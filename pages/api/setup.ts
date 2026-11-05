import type { NextApiRequest, NextApiResponse } from "next";
import db, { userCount } from "../../lib/db";
import bcrypt from "bcryptjs";
import { getApiSession } from "../../lib/auth";
import { checkRateLimit } from "../../lib/rateLimit";
import { checkCsrf } from "../../lib/csrf";
import { clientIp } from "../../lib/clientIp";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    res.json({ needsSetup: userCount() === 0 });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  // 5 attempts per hour per IP — setup is one-time, no need for more.
  if (!checkRateLimit(`setup:${clientIp(req)}`, 5, 60 * 60_000)) {
    res.status(429).json({ message: "Too many requests. Try again later." });
    return;
  }

  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ message: "Missing field(s)" });
    return;
  }
  if (typeof password !== "string" || password.length < 8) {
    res.status(400).json({ message: "Password must be at least 8 characters" });
    return;
  }
  if (password.length > 72) {
    res.status(400).json({ message: "Password must be 72 characters or fewer" });
    return;
  }

  const cleanUsername = String(username).trim().toLowerCase();
  if (cleanUsername.length < 2 || cleanUsername.length > 50) {
    res.status(400).json({ message: "Username must be 2–50 characters" });
    return;
  }

  // Hash outside the transaction (bcrypt is slow).
  const hash = bcrypt.hashSync(password, 10);

  // Atomic check-then-insert prevents two concurrent setup requests both succeeding.
  const result = db.transaction(() => {
    if (userCount() > 0) return null;
    return db
      .prepare("INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)")
      .run(cleanUsername, hash);
  })();

  if (!result) {
    res.status(403).json({ message: "Setup has already been completed" });
    return;
  }

  const session = await getApiSession(req, res);
  session.user = { id: result.lastInsertRowid as number, username: cleanUsername, isAdmin: true, v: 0 };
  await session.save();

  res.json({ ok: true });
}
