import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../lib/auth";
import db from "../../lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user) { res.status(401).json({ message: "Login required" }); return; }

  const rows = db.prepare(`
    SELECT tag, COUNT(*) as count FROM series_tags
    GROUP BY tag ORDER BY count DESC, tag ASC
  `).all() as { tag: string; count: number }[];
  res.json(rows);
}
