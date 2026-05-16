import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../lib/db";
import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user) {
    res.status(401).json({ message: "Login required" });
    return;
  }
  const userId = session.user.id;

  if (req.method === "GET") {
    const row = db.prepare("SELECT username, email FROM users WHERE id = ?").get(userId) as
      | { username: string; email: string }
      | undefined;
    if (!row) { res.status(404).json({ message: "User not found" }); return; }
    res.json(row);
    return;
  }

  if (req.method === "PATCH") {
    const { password, email } = req.body ?? {};
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (email !== undefined) {
      if (typeof email !== "string") { res.status(400).json({ message: "Invalid email" }); return; }
      sets.push("email = ?");
      vals.push(email.trim());
    }

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 5) {
        res.status(400).json({ message: "Password must be at least 5 characters" });
        return;
      }
      sets.push("password = ?");
      vals.push(bcrypt.hashSync(password, 10));
    }

    if (sets.length === 0) { res.status(400).json({ message: "Nothing to update" }); return; }

    db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals, userId);
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
