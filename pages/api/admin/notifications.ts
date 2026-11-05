import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../../lib/auth";
import db from "../../../lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  if (req.method !== "GET") { res.status(405).end(); return; }

  const rows = db.prepare(`
    SELECT l.id, l.user_id, u.username, l.endpoint_host, l.status_code,
           l.error, l.title, l.created_at
    FROM push_log l
    LEFT JOIN users u ON u.id = l.user_id
    ORDER BY l.id DESC
    LIMIT 50
  `).all();

  res.json(rows);
}
