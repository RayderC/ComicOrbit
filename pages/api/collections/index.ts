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

  if (req.method === "GET") {
    const cols = db.prepare("SELECT id, name, created_at FROM collections WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    const items = db.prepare(`
      SELECT ci.collection_id, s.id, s.slug, s.title, s.type, s.cover_path
      FROM collection_items ci
      JOIN series s ON s.id = ci.series_id
      WHERE ci.collection_id IN (SELECT id FROM collections WHERE user_id = ?)
    `).all(userId) as { collection_id: number; id: number; slug: string; title: string; type: string; cover_path: string }[];
    const byCol = new Map<number, typeof items>();
    for (const it of items) {
      if (!byCol.has(it.collection_id)) byCol.set(it.collection_id, []);
      byCol.get(it.collection_id)!.push(it);
    }
    res.json((cols as { id: number; name: string; created_at: string }[]).map((c) => ({
      ...c,
      items: byCol.get(c.id) || [],
    })));
    return;
  }

  if (req.method === "POST") {
    const name = String((req.body ?? {}).name || "").trim();
    if (!name) { res.status(400).json({ message: "name required" }); return; }
    const info = db.prepare("INSERT INTO collections (user_id, name) VALUES (?, ?)").run(userId, name);
    res.status(201).json({ id: info.lastInsertRowid, name });
    return;
  }

  res.status(405).end();
}
