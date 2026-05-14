import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.method === "GET") {
    const rows = db.prepare(`
      SELECT q.id, q.series_id, q.status, q.error_message, q.progress_pct, q.current_chapter, q.added_at, q.updated_at,
             s.title, s.type, s.slug, s.source
      FROM download_queue q
      JOIN series s ON s.id = q.series_id
      ORDER BY q.added_at DESC
    `).all();
    res.json(rows);
    return;
  }

  if (req.method === "POST") {
    const { series_id } = req.body ?? {};
    const id = Number(series_id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ message: "series_id required" });
      return;
    }
    const exists = db.prepare("SELECT id FROM series WHERE id = ?").get(id);
    if (!exists) {
      res.status(404).json({ message: "Series not found" });
      return;
    }
    const info = db.prepare("INSERT INTO download_queue (series_id, status) VALUES (?, 'queued')").run(id);
    res.status(201).json({ id: info.lastInsertRowid });
    return;
  }

  res.status(405).end();
}
