import type { NextApiRequest, NextApiResponse } from "next";
import db, { userCount } from "../../lib/db";
import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    res.json({ needsSetup: userCount() === 0 });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  if (userCount() > 0) {
    res.status(403).json({ message: "Setup has already been completed" });
    return;
  }

  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ message: "Missing field(s)" });
    return;
  }
  if (typeof password !== "string" || password.length < 5) {
    res.status(400).json({ message: "Password must be at least 5 characters" });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)")
    .run(String(username).toLowerCase(), hash);

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  session.user = { id: info.lastInsertRowid as number, username: String(username).toLowerCase(), isAdmin: true };
  await session.save();

  res.json({ ok: true });
}
