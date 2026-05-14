import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.method === "GET") {
    const users = db
      .prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC")
      .all();
    res.json(users);
    return;
  }

  res.status(405).end();
}
