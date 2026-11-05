import type { NextApiRequest, NextApiResponse } from "next";
import db, { getSiteConfig } from "../../../lib/db";
import { getApiSession } from "../../../lib/auth";
import { checkCsrf } from "../../../lib/csrf";
import fs from "fs";
import path from "path";
import type { SeriesRow } from "./index";
import { cancelJobForSeries } from "../../../lib/downloader";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const VALID_STATUS = new Set(["unknown", "ongoing", "completed", "hiatus"]);

function getAllowedSeriesDirs(): string[] {
  const cfg = getSiteConfig();
  return [cfg.MANGA_DIRECTORY || "/Manga"].map((d) => path.resolve(d));
}

// The library root itself never counts: deleting one series mustn't be able to delete everything.
function isSeriesFolderSafe(folder: string): boolean {
  const resolved = path.resolve(folder);
  return getAllowedSeriesDirs().some((dir) => resolved.startsWith(dir + path.sep));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Number(req.query.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }

  if (req.method === "GET") {
    // The whole app is login-gated, and this response includes the server's folder path.
    const viewer = await getApiSession(req, res);
    if (!viewer.user) { res.status(401).json({ message: "Login required" }); return; }
    const row = db.prepare(`
      SELECT id, slug, title, type, source, source_url, description, cover_path, status, one_shot, series_folder, reading_mode, created_at, updated_at
      FROM series WHERE id = ?
    `).get(id) as SeriesRow | undefined;
    if (!row) { res.status(404).json({ message: "Not found" }); return; }
    const tags = (db.prepare("SELECT tag FROM series_tags WHERE series_id = ?").all(id) as { tag: string }[]).map((t) => t.tag);
    res.json({ ...row, tags });
    return;
  }

  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.method === "PUT") {
    const { title, status, description, tags, readingMode } = req.body ?? {};

    if (title) {
      if (typeof title !== "string" || title.length > 255) {
        res.status(400).json({ message: "Title must be under 255 characters" });
        return;
      }
      db.prepare("UPDATE series SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
    }
    if (status) {
      if (!VALID_STATUS.has(status)) {
        res.status(400).json({ message: "status must be one of: unknown, ongoing, completed, hiatus" });
        return;
      }
      db.prepare("UPDATE series SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    }
    if (typeof description === "string") {
      if (description.length > 10_000) {
        res.status(400).json({ message: "Description must be under 10,000 characters" });
        return;
      }
      db.prepare("UPDATE series SET description = ?, updated_at = datetime('now') WHERE id = ?").run(description, id);
    }
    if (typeof readingMode === "string" && ["ltr", "rtl", "webtoon"].includes(readingMode)) {
      db.prepare("UPDATE series SET reading_mode = ?, updated_at = datetime('now') WHERE id = ?").run(readingMode, id);
    }
    if (Array.isArray(tags)) {
      const txn = db.transaction((list: string[]) => {
        db.prepare("DELETE FROM series_tags WHERE series_id = ?").run(id);
        const ins = db.prepare("INSERT OR IGNORE INTO series_tags (series_id, tag) VALUES (?, ?)");
        for (const t of list) {
          // Strip all HTML tags and control characters, then trim/truncate.
          const v = (t || "").replace(/<[^>]*>/g, "").replace(/[^\x20-\x7E -￿]/g, "").trim().slice(0, 100);
          if (v) ins.run(id, v);
        }
      });
      txn(tags.slice(0, 100)); // max 100 tags
    }
    res.json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    cancelJobForSeries(id);
    const deleteFiles = req.query.files === "true";
    const row = db.prepare("SELECT series_folder FROM series WHERE id = ?").get(id) as { series_folder: string } | undefined;
    db.prepare("DELETE FROM series WHERE id = ?").run(id);

    if (deleteFiles && row?.series_folder) {
      const folder = row.series_folder;
      // Guard against deleting outside designated media directories
      if (isSeriesFolderSafe(folder) && fs.existsSync(folder)) {
        try { fs.rmSync(folder, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
