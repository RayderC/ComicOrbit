import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";
import { syncAnilistProgress } from "../../../lib/anilist";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

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
    if (!Number.isFinite(cId)) {
      res.status(400).json({ message: "Invalid fields" });
      return;
    }
    const ch = db.prepare("SELECT series_id, page_count FROM chapters WHERE id = ?").get(cId) as
      | { series_id: number; page_count: number }
      | undefined;
    if (!ch) { res.status(404).json({ message: "Chapter not found" }); return; }

    // Clamp page to valid range — reject obviously bogus values.
    const rawPage = Number(page);
    if (!Number.isFinite(rawPage)) {
      res.status(400).json({ message: "Invalid fields" });
      return;
    }
    const maxPage = ch.page_count > 0 ? ch.page_count : 9999;
    const p = Math.max(0, Math.min(Math.round(rawPage), maxPage));

    if (completed) {
      // Mark as read: upsert with page + completed flag.
      db.prepare(`
        INSERT INTO read_progress (user_id, series_id, chapter_id, page, completed, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(user_id, series_id, chapter_id) DO UPDATE SET
          page = excluded.page,
          completed = 1,
          updated_at = datetime('now')
      `).run(userId, ch.series_id, cId, p);

      // Fire-and-forget AniList sync when a chapter is completed.
      const chaptersRead = (db.prepare(
        "SELECT COUNT(*) as c FROM read_progress WHERE user_id = ? AND series_id = ? AND completed = 1"
      ).get(userId, ch.series_id) as { c: number }).c;
      syncAnilistProgress(userId, ch.series_id, chaptersRead).catch(() => {});
    } else {
      // Mark as unread: delete the record entirely so it no longer appears in
      // "Continue Reading" (which selects all rows where completed = 0).
      db.prepare(
        "DELETE FROM read_progress WHERE user_id = ? AND series_id = ? AND chapter_id = ?"
      ).run(userId, ch.series_id, cId);
    }

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
