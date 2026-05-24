import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../../lib/session";
import { checkCsrf } from "../../../../lib/csrf";
import db from "../../../../lib/db";
import { syncAnilistProgress } from "../../../../lib/anilist";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user) { res.status(401).json({ message: "Unauthorized" }); return; }

  const seriesId = Number(req.query.id);
  if (!Number.isFinite(seriesId)) { res.status(400).json({ message: "Invalid id" }); return; }

  const { completed = true } = req.body ?? {};
  const isCompleted = completed ? 1 : 0;

  const chapters = db.prepare(
    "SELECT id, page_count FROM chapters WHERE series_id = ?"
  ).all(seriesId) as { id: number; page_count: number }[];

  if (chapters.length === 0) { res.json({ ok: true, count: 0 }); return; }

  const txn = db.transaction(() => {
    if (isCompleted) {
      // Mark all read: upsert each chapter at its last page.
      const upsert = db.prepare(`
        INSERT INTO read_progress (user_id, series_id, chapter_id, page, completed, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(user_id, series_id, chapter_id) DO UPDATE SET
          page = excluded.page,
          completed = 1,
          updated_at = datetime('now')
      `);
      for (const ch of chapters) {
        upsert.run(session.user!.id, seriesId, ch.id, Math.max(0, ch.page_count - 1));
      }
    } else {
      // Mark all unread: delete all progress rows for this series so chapters
      // no longer appear in "Continue Reading" (which selects completed = 0 rows).
      db.prepare(
        "DELETE FROM read_progress WHERE user_id = ? AND series_id = ?"
      ).run(session.user!.id, seriesId);
    }
  });
  txn();

  // Sync completed read count to AniList when marking chapters as read.
  // Fire-and-forget — don't let a sync failure block the response.
  if (completed) {
    const chaptersRead = (db.prepare(
      "SELECT COUNT(*) as c FROM read_progress WHERE user_id = ? AND series_id = ? AND completed = 1"
    ).get(session.user!.id, seriesId) as { c: number }).c;
    syncAnilistProgress(session.user!.id, seriesId, chaptersRead).catch(() => {});
  }

  res.json({ ok: true, count: chapters.length });
}
