import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../lib/db";
import bcrypt from "bcryptjs";
import { getApiSession } from "../../lib/auth";
import { checkCsrf } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/rateLimit";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user) {
    res.status(401).json({ message: "Login required" });
    return;
  }
  const userId = session.user.id;

  if (req.method === "GET") {
    const row = db.prepare("SELECT username, email, anilist_token FROM users WHERE id = ?").get(userId) as
      | { username: string; email: string; anilist_token: string }
      | undefined;
    if (!row) { res.status(404).json({ message: "User not found" }); return; }
    res.json(row);
    return;
  }

  if (req.method === "PATCH") {
    if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

    const { email, password, currentPassword, anilistToken } = req.body ?? {};
    let updated = false;

    if (email !== undefined) {
      if (typeof email !== "string") { res.status(400).json({ message: "Invalid email" }); return; }
      const trimmed = email.trim();
      if (trimmed !== "" && !EMAIL_RE.test(trimmed)) { res.status(400).json({ message: "Invalid email format" }); return; }
      if (trimmed.length > 254) { res.status(400).json({ message: "Email must be under 254 characters" }); return; }
      db.prepare("UPDATE users SET `email` = ? WHERE id = ?").run(trimmed, userId);
      updated = true;
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 8) { res.status(400).json({ message: "Password must be at least 8 characters" }); return; }
      if (password.length > 72) { res.status(400).json({ message: "Password must be 72 characters or fewer" }); return; }
      if (!currentPassword || typeof currentPassword !== "string") { res.status(400).json({ message: "Current password is required to set a new one" }); return; }
      // Throttle current-password verification to slow brute-force.
      if (!checkRateLimit(`pwchange:${userId}`, 10, 60_000)) {
        res.status(429).json({ message: "Too many password change attempts. Try again in a minute." });
        return;
      }
      const row = db.prepare("SELECT password FROM users WHERE id = ?").get(userId) as { password: string } | undefined;
      if (!row || !bcrypt.compareSync(currentPassword, row.password)) { res.status(400).json({ message: "Current password is incorrect" }); return; }
      db.prepare("UPDATE users SET `password` = ?, token_version = token_version + 1 WHERE id = ?").run(bcrypt.hashSync(password, 10), userId);
      // Other devices get signed out. Keep this one signed in with the new version.
      session.user!.v = (session.user!.v ?? 0) + 1;
      await session.save();
      updated = true;
    }

    if (anilistToken !== undefined) {
      if (typeof anilistToken !== "string" || anilistToken.length > 2000) {
        res.status(400).json({ message: "Invalid AniList token" });
        return;
      }
      db.prepare("UPDATE users SET anilist_token = ? WHERE id = ?").run(anilistToken.trim(), userId);
      updated = true;
    }

    if (!updated) { res.status(400).json({ message: "Nothing to update" }); return; }
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
