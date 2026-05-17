import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";
import db from "../../../lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.status(405).end(); return; }

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user) { res.status(401).json([]); return; }

  try {
    const rows = db.prepare(`
      SELECT c.series_id
      FROM chapters c
      LEFT JOIN read_progress rp ON rp.chapter_id = c.id AND rp.user_id = ?
      GROUP BY c.series_id
      HAVING COUNT(*) > 0 AND COUNT(*) = SUM(CASE WHEN rp.completed = 1 THEN 1 ELSE 0 END)
    `).all(session.user.id) as { series_id: number }[];

    res.json(rows.map((r) => r.series_id));
  } catch {
    res.json([]);
  }
}
