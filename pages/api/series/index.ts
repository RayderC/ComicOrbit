import type { NextApiRequest, NextApiResponse } from "next";
import db from "../../../lib/db";
import { getApiSession } from "../../../lib/auth";
import { slugify, sanitizeFsName } from "../../../lib/url";
import { getSource } from "../../../lib/downloader/sources";
import { isSafeExternalUrl } from "../../../lib/safeUrl";
import { checkCsrf } from "../../../lib/csrf";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

export interface SeriesRow {
  id: number;
  slug: string;
  title: string;
  type: string;
  source: string;
  source_url: string;
  description: string;
  cover_path: string;
  original_cover_path: string;
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
    const session = await getApiSession(req, res);
    if (!session.user) { res.status(401).json({ message: "Login required" }); return; }

    const { status, q, tag } = req.query;
    const where: string[] = [];
    const params: unknown[] = [];
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
             s.cover_path, s.status, s.one_shot, s.reading_mode,
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
    if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

    const session = await getApiSession(req, res);
    if (!session.user?.isAdmin) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const { title, source, source_url, description, cover } = req.body ?? {};
    if (typeof title !== "string" || !title.trim() || typeof source !== "string" || !source || !source_url) {
      res.status(400).json({ message: "Missing field(s)" });
      return;
    }
    if (title.length > 255) {
      res.status(400).json({ message: "Title must be under 255 characters" });
      return;
    }
    // Checked before anything is saved, so a rejected cover can't leave a half-created series behind.
    if (cover && (typeof cover !== "string" || !isSafeExternalUrl(cover))) {
      res.status(400).json({ message: "cover URL points to a disallowed address" });
      return;
    }
    if (typeof source_url !== "string") {
      res.status(400).json({ message: "source_url must be a string" });
      return;
    }
    try {
      const parsed = new URL(source_url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
    } catch {
      res.status(400).json({ message: "source_url must be a valid http/https URL" });
      return;
    }
    if (!isSafeExternalUrl(source_url)) {
      res.status(400).json({ message: "source_url points to a disallowed address" });
      return;
    }
    try { getSource(source); } catch {
      res.status(400).json({ message: `Unknown source: ${source}` });
      return;
    }

    const slug = uniqueSlug(title);
    const cfg = db.prepare("SELECT value FROM site_config WHERE key = ?");
    const mangaDir = (cfg.get("MANGA_DIRECTORY") as { value: string } | undefined)?.value || "/Manga";
    const folder = path.join(mangaDir, sanitizeFsName(title));

    const info = db.prepare(`
      INSERT INTO series (slug, title, type, source, source_url, description, cover_path, status, series_folder)
      VALUES (?, ?, 'manga', ?, ?, ?, '', 'unknown', ?)
    `).run(slug, title, source, source_url, typeof description === "string" ? description.slice(0, 10_000) : "", folder);

    const seriesId = info.lastInsertRowid as number;

    db.prepare("INSERT INTO download_queue (series_id, status) VALUES (?, 'queued')").run(seriesId);

    if (cover) {
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
