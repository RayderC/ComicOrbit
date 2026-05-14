import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../../lib/session";

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

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);

  const rows = db.prepare(`
    SELECT id, series_id, number, title, file_path, page_count, downloaded_at
    FROM chapters WHERE series_id = ?
    ORDER BY number ASC
  `).all(id) as {
    id: number; series_id: number; number: number; title: string;
    file_path: string; page_count: number; downloaded_at: string;
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
