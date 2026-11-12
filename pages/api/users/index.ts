import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getApiSession } from "../../../lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.method === "GET") {
    const users = db
      .prepare("SELECT id, username, email, is_admin, created_at, anilist_token != '' AS anilist FROM users ORDER BY created_at DESC")
      .all();
    res.json(users);
    return;
  }

  res.status(405).end();
}
