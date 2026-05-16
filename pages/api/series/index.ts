import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../lib/session";
import { slugify, sanitizeFsName } from "../../../lib/url";
import { getSource } from "../../../lib/downloader/sources";
import path from "path";

export interface SeriesRow {
  id: number;
  slug: string;
  title: string;
  type: "manga" | "comic";
  source: string;
  source_url: string;
  description: string;
  cover_path: string;
  status: string;
  one_shot: number;
  series_folder: string;
  reading_mode: string;
  created_at: string;
  updated_at: string;
  chapter_count?: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { type, tag, status, q } = req.query;
    const where: string[] = [];
    const params: unknown[] = [];
    if (type === "manga" || type === "comic") { where.push("type = ?"); params.push(type); }
    if (status && typeof status === "string") { where.push("status = ?"); params.push(status); }
    if (q && typeof q === "string") {
      where.push("(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)");
      const like = `%${q.toLowerCase()}%`;
      params.push(like, like);
    }
    if (tag && typeof tag === "string") {
      where.push("id IN (SELECT series_id FROM series_tags WHERE tag = ?)");
      params.push(tag);
    }

    const rows = db.prepare(`
      SELECT s.id, s.slug, s.title, s.type, s.source, s.source_url, s.description,
             s.cover_path, s.status, s.one_shot, s.series_folder, s.reading_mode,
             s.created_at, s.updated_at,
             (SELECT COUNT(*) FROM chapters WHERE series_id = s.id) as chapter_count
      FROM series s
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY s.title COLLATE NOCASE ASC
    `).all(...params) as (SeriesRow & { chapter_count: number; reading_mode: string })[];

    const tagMap = new Map<number, string[]>();
    const tagRows = db.prepare("SELECT series_id, tag FROM series_tags").all() as { series_id: number; tag: string }[];
    for (const t of tagRows) {
      if (!tagMap.has(t.series_id)) tagMap.set(t.series_id, []);
      tagMap.get(t.series_id)!.push(t.tag);
    }
    res.json(rows.map((r) => ({ ...r, tags: tagMap.get(r.id) || [] })));
    return;
  }

  if (req.method === "POST") {
    const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
    if (!session.user?.isAdmin) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const { title, type, source, source_url, description, cover } = req.body ?? {};
    if (!title || !type || !source || !source_url) {
      res.status(400).json({ message: "Missing field(s)" });
      return;
    }
    if (type !== "manga" && type !== "comic") {
      res.status(400).json({ message: "type must be 'manga' or 'comic'" });
      return;
    }
    try { getSource(source); } catch {
      res.status(400).json({ message: `Unknown source: ${source}` });
      return;
    }

    const slug = uniqueSlug(title);
    const cfg = db.prepare("SELECT value FROM site_config WHERE key = ?");
    const mangaDir = (cfg.get("MANGA_DIRECTORY") as { value: string } | undefined)?.value || "/Manga";
    const comicDir = (cfg.get("COMICS_DIRECTORY") as { value: string } | undefined)?.value || "/Comics";
    const folder = path.join(type === "comic" ? comicDir : mangaDir, sanitizeFsName(title));

    const info = db.prepare(`
      INSERT INTO series (slug, title, type, source, source_url, description, cover_path, status, series_folder)
      VALUES (?, ?, ?, ?, ?, ?, '', 'unknown', ?)
    `).run(slug, title, type, source, source_url, description || "", folder);

    const seriesId = info.lastInsertRowid as number;

    // Auto-queue.
    db.prepare("INSERT INTO download_queue (series_id, status) VALUES (?, 'queued')").run(seriesId);

    // Persist cover hint immediately so the UI has something to show.
    if (cover && typeof cover === "string") {
      // not downloading here — worker will fetch and save to disk.
      db.prepare("UPDATE series SET cover_path = ? WHERE id = ?").run(cover, seriesId);
    }

    res.status(201).json({ id: seriesId, slug });
    return;
  }

  res.status(405).end();
}

function uniqueSlug(title: string): string {
  const base = slugify(title) || "series";
  let s = base;
  let n = 0;
  while (db.prepare("SELECT id FROM series WHERE slug = ?").get(s)) {
    n++;
    s = `${base}-${n}`;
  }
  return s;
}
