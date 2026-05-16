import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";
import fs from "fs";
import type { SeriesRow } from "./index";
import { cancelJobForSeries } from "../../../lib/downloader";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  if (req.method === "GET") {
    const row = db.prepare(`
      SELECT id, slug, title, type, source, source_url, description, cover_path, status, one_shot, series_folder, reading_mode, created_at, updated_at
      FROM series WHERE id = ?
    `).get(id) as SeriesRow | undefined;
    if (!row) { res.status(404).json({ message: "Not found" }); return; }
    const tags = (db.prepare("SELECT tag FROM series_tags WHERE series_id = ?").all(id) as { tag: string }[]).map((t) => t.tag);
    res.json({ ...row, tags });
    return;
  }

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.method === "PUT") {
    const { title, status, description, tags, readingMode } = req.body ?? {};
    if (title) db.prepare("UPDATE series SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
    if (status) db.prepare("UPDATE series SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    if (typeof description === "string") db.prepare("UPDATE series SET description = ?, updated_at = datetime('now') WHERE id = ?").run(description, id);
    if (typeof readingMode === "string" && ["ltr", "rtl", "webtoon"].includes(readingMode)) {
      db.prepare("UPDATE series SET reading_mode = ?, updated_at = datetime('now') WHERE id = ?").run(readingMode, id);
    }
    if (Array.isArray(tags)) {
      const txn = db.transaction((list: string[]) => {
        db.prepare("DELETE FROM series_tags WHERE series_id = ?").run(id);
        const ins = db.prepare("INSERT OR IGNORE INTO series_tags (series_id, tag) VALUES (?, ?)");
        for (const t of list) {
          const v = (t || "").trim();
          if (v) ins.run(id, v);
        }
      });
      txn(tags);
    }
    res.json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    cancelJobForSeries(id);
    const deleteFiles = req.query.files === "true";
    const row = db.prepare("SELECT series_folder FROM series WHERE id = ?").get(id) as { series_folder: string } | undefined;
    db.prepare("DELETE FROM series WHERE id = ?").run(id);
    if (deleteFiles && row?.series_folder && fs.existsSync(row.series_folder)) {
      try { fs.rmSync(row.series_folder, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
