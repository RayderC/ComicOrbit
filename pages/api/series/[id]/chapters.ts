import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../../lib/db";
import { getApiSession } from "../../../../lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  const session = await getApiSession(req, res);
  if (!session.user) { res.status(401).json({ message: "Login required" }); return; }

  const rows = db.prepare(`
    SELECT id, series_id, number, title, page_count, downloaded_at
    FROM chapters WHERE series_id = ?
    ORDER BY number ASC
  `).all(id) as {
    id: number; series_id: number; number: number; title: string;
    page_count: number; downloaded_at: string;
  }[];

  let progress: Record<number, { page: number; completed: number }> = {};
  if (session.user) {
    const pr = db.prepare("SELECT chapter_id, page, completed FROM read_progress WHERE user_id = ? AND series_id = ?")
      .all(session.user.id, id) as { chapter_id: number; page: number; completed: number }[];
    progress = Object.fromEntries(pr.map((r) => [r.chapter_id, { page: r.page, completed: r.completed }]));
  }

  res.json(rows.map((c) => ({
    ...c,
    progress: progress[c.id] || null,
  })));
}
