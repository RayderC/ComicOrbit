import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user) {
    res.status(401).json({ message: "Login required" });
    return;
  }
  const userId = session.user.id;

  if (req.method === "POST") {
    const { chapter_id, page, completed } = req.body ?? {};
    const cId = Number(chapter_id);
    const p = Number(page);
    if (!Number.isFinite(cId) || !Number.isFinite(p)) {
      res.status(400).json({ message: "Invalid fields" });
      return;
    }
    const ch = db.prepare("SELECT series_id FROM chapters WHERE id = ?").get(cId) as { series_id: number } | undefined;
    if (!ch) { res.status(404).json({ message: "Chapter not found" }); return; }
    db.prepare(`
      INSERT INTO read_progress (user_id, series_id, chapter_id, page, completed, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, series_id, chapter_id) DO UPDATE SET
        page = excluded.page,
        completed = excluded.completed,
        updated_at = datetime('now')
    `).run(userId, ch.series_id, cId, p, completed ? 1 : 0);
    res.json({ ok: true });
    return;
  }

  if (req.method === "GET") {
    const seriesId = Number(req.query.series_id);
    if (Number.isFinite(seriesId)) {
      const rows = db.prepare(`
        SELECT chapter_id, page, completed, updated_at
        FROM read_progress WHERE user_id = ? AND series_id = ?
      `).all(userId, seriesId);
      res.json(rows);
      return;
    }
    // Continue reading: most recent unfinished chapter per series.
    const rows = db.prepare(`
      SELECT s.id as series_id, s.title, s.type, c.id as chapter_id, c.number, c.title as chapter_title,
             p.page, c.page_count, p.updated_at
      FROM read_progress p
      JOIN chapters c ON c.id = p.chapter_id
      JOIN series s ON s.id = p.series_id
      WHERE p.user_id = ? AND p.completed = 0
      ORDER BY p.updated_at DESC LIMIT 8
    `).all(userId);
    res.json(rows);
    return;
  }

  res.status(405).end();
}
