import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getApiSession } from "../../../lib/auth";

type Row = { series_id: number; chapter_id: number; page: number | null; title: string; number: number };

/**
 * Where "Continue reading" goes: the chapter you're partway through, or else the next chapter
 * of the series you finished a chapter in most recently. Null when there's nothing to go back to.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.status(405).end(); return; }
  const session = await getApiSession(req, res);
  if (!session.user) { res.status(401).json({ message: "Login required" }); return; }
  const userId = session.user.id;

  const partway = db.prepare(`
    SELECT p.series_id, p.chapter_id, p.page, s.title, c.number
    FROM read_progress p
    JOIN chapters c ON c.id = p.chapter_id
    JOIN series s ON s.id = p.series_id
    WHERE p.user_id = ? AND p.completed = 0
    ORDER BY p.updated_at DESC LIMIT 1
  `).get(userId) as Row | undefined;

  const next = partway ? undefined : db.prepare(`
    SELECT c.series_id, c.id AS chapter_id, NULL AS page, s.title, c.number
    FROM read_progress p
    JOIN chapters done ON done.id = p.chapter_id
    JOIN chapters c ON c.series_id = done.series_id AND c.number > done.number
    JOIN series s ON s.id = c.series_id
    WHERE p.user_id = ? AND p.completed = 1
      AND c.id NOT IN (SELECT chapter_id FROM read_progress WHERE user_id = ? AND completed = 1)
    ORDER BY p.updated_at DESC, c.number ASC LIMIT 1
  `).get(userId, userId) as Row | undefined;

  const row = partway ?? next;
  res.setHeader("Cache-Control", "no-store");
  if (!row) { res.json({ href: null }); return; }
  const num = Number.isInteger(row.number) ? String(row.number) : row.number.toFixed(1);
  res.json({
    href: `/library/${row.series_id}/read/${row.chapter_id}${row.page ? `?page=${row.page}` : ""}`,
    title: row.title,
    chapter: num,
  });
}
