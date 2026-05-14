import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../lib/db";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const rows = db.prepare(`
    SELECT tag, COUNT(*) as count FROM series_tags
    GROUP BY tag ORDER BY count DESC, tag ASC
  `).all() as { tag: string; count: number }[];
  res.json(rows);
}
