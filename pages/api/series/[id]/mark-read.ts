import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../../lib/session";
import db from "../../../../lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }

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

  const upsert = db.prepare(`
    INSERT INTO read_progress (user_id, series_id, chapter_id, page, completed, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, series_id, chapter_id) DO UPDATE SET
      page = excluded.page,
      completed = excluded.completed,
      updated_at = datetime('now')
  `);

  const txn = db.transaction(() => {
    for (const ch of chapters) {
      const page = isCompleted ? Math.max(0, ch.page_count - 1) : 0;
      upsert.run(session.user!.id, seriesId, ch.id, page, isCompleted);
    }
  });
  txn();

  res.json({ ok: true, count: chapters.length });
}
