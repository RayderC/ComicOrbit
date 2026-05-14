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
  const id = Number(req.query.id);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const owns = db.prepare("SELECT id FROM collections WHERE id = ? AND user_id = ?").get(id, userId);
  if (!owns) { res.status(404).json({ message: "Not found" }); return; }

  if (req.method === "DELETE") {
    db.prepare("DELETE FROM collections WHERE id = ?").run(id);
    res.json({ ok: true });
    return;
  }

  if (req.method === "POST") {
    // Add a series to this collection.
    const sId = Number((req.body ?? {}).series_id);
    if (!Number.isFinite(sId)) { res.status(400).json({ message: "series_id required" }); return; }
    db.prepare("INSERT OR IGNORE INTO collection_items (collection_id, series_id) VALUES (?, ?)").run(id, sId);
    res.json({ ok: true });
    return;
  }

  if (req.method === "PATCH") {
    // Remove a series from this collection: pass series_id; or rename: pass name.
    const body = req.body ?? {};
    if (body.name) {
      db.prepare("UPDATE collections SET name = ? WHERE id = ?").run(String(body.name), id);
    }
    if (body.remove_series_id != null) {
      const sId = Number(body.remove_series_id);
      if (Number.isFinite(sId)) {
        db.prepare("DELETE FROM collection_items WHERE collection_id = ? AND series_id = ?").run(id, sId);
      }
    }
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
