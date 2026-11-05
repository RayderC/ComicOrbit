import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../lib/db";
import { getApiSession } from "../../lib/auth";
import { checkCsrf } from "../../lib/csrf";

export const config = { api: { bodyParser: { sizeLimit: "16kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user) {
    res.status(401).json({ message: "Login required" });
    return;
  }
  const userId = session.user.id;

  if (req.method === "GET") {
    const rows = db.prepare(`
      SELECT s.id, s.slug, s.title, s.type, s.cover_path, s.status, s.description
      FROM favorites f JOIN series s ON s.id = f.series_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(userId);
    res.json(rows);
    return;
  }

  if (req.method === "POST") {
    if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }
    const id = Number((req.body ?? {}).series_id);
    if (!Number.isFinite(id)) { res.status(400).json({ message: "series_id required" }); return; }
    if (!db.prepare("SELECT 1 FROM series WHERE id = ?").get(id)) { res.status(404).json({ message: "Series not found" }); return; }
    db.prepare("INSERT OR IGNORE INTO favorites (user_id, series_id) VALUES (?, ?)").run(userId, id);
    res.json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }
    const id = Number(req.query.series_id ?? (req.body ?? {}).series_id);
    if (!Number.isFinite(id)) { res.status(400).json({ message: "series_id required" }); return; }
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND series_id = ?").run(userId, id);
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
