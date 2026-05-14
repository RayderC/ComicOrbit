import fs from "fs";
import path from "path";
import db, { getSiteConfig, setSiteConfigKey } from "./db";
import { listCbzImages } from "./cbz";
import { slugify, sanitizeFsName } from "./url";

const FLAG = "migrated_v1";
const CONFIG_DIR = process.env.CONFIG_DIRECTORY || "/config";

interface OldUserFile {
  username: string;
  password: string;
  role?: string;
}

interface OldQueueEntry {
  series_name: string;
  read_online_link: string;
  folder_type: "manga" | "comic";
  series_folder?: string;
  poster_path?: string;
  description?: string;
  one_shot?: boolean;
  date_added?: string;
}

export function runMigrationIfNeeded(): void {
  const cfg = getSiteConfig();
  if (cfg[FLAG] === "true") return;

  try {
    console.log("[migration] starting one-time migration");
    importConfig();
    importUsers();
    importQueue();
    scanLibraryFromDisk();
    setSiteConfigKey(FLAG, "true");
    console.log("[migration] completed");
  } catch (e) {
    console.error("[migration] failed (will not retry):", (e as Error).message);
    // Still set the flag so we don't loop on a partial failure. The admin can
    // inspect logs and re-add users / queue manually if needed.
    setSiteConfigKey(FLAG, "true");
  }
}

function importConfig() {
  const configPath = path.join(CONFIG_DIR, "config.json");
  if (!fs.existsSync(configPath)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(raw)) {
      if (k === "SECRET_KEY") continue; // don't persist the old Flask secret
      if (v == null) continue;
      setSiteConfigKey(k, String(v));
    }
    console.log("[migration] imported config.json");
  } catch (e) {
    console.warn("[migration] config.json parse failed:", (e as Error).message);
  }
}

function importUsers() {
  const usersDir = path.join(CONFIG_DIR, "Users");
  if (!fs.existsSync(usersDir)) return;
  const files = fs.readdirSync(usersDir).filter((f) => f.endsWith(".json"));
  let count = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, legacy_password, is_admin)
    VALUES (?, '', ?, ?)
  `);
  for (const f of files) {
    try {
      const u = JSON.parse(fs.readFileSync(path.join(usersDir, f), "utf8")) as OldUserFile;
      if (!u.username || !u.password) continue;
      const isAdmin = u.role === "admin" ? 1 : 0;
      insert.run(u.username.toLowerCase(), u.password, isAdmin);
      count++;
    } catch (e) {
      console.warn(`[migration] user file ${f} skipped:`, (e as Error).message);
    }
  }
  console.log(`[migration] imported ${count} user(s)`);
}

function importQueue(): Set<string> {
  const queuePath = path.join(CONFIG_DIR, "download_list.json");
  const imported = new Set<string>();
  if (!fs.existsSync(queuePath)) return imported;
  try {
    const raw = JSON.parse(fs.readFileSync(queuePath, "utf8")) as unknown;
    if (!Array.isArray(raw)) return imported;
    const insertSeries = db.prepare(`
      INSERT OR IGNORE INTO series
        (slug, title, type, source, source_url, description, cover_path, status, one_shot, series_folder)
      VALUES (?, ?, ?, '', ?, ?, ?, 'unknown', ?, ?)
    `);
    const insertQueue = db.prepare(`
      INSERT INTO download_queue (series_id, status, error_message, progress_pct)
      VALUES (?, 'queued', '', 0)
    `);
    let count = 0;
    for (const item of raw as OldQueueEntry[]) {
      if (!item?.series_name) continue;
      const slug = uniqueSlug(item.series_name);
      const folder = item.series_folder || "";
      insertSeries.run(
        slug,
        item.series_name,
        item.folder_type === "comic" ? "comic" : "manga",
        item.read_online_link || "",
        item.description || "",
        item.poster_path || "",
        item.one_shot ? 1 : 0,
        folder,
      );
      const sid = (db.prepare("SELECT id FROM series WHERE slug = ?").get(slug) as { id: number } | undefined)?.id;
      if (sid != null) {
        // Don't auto-requeue migrated entries (the source format changed); admin can
        // hit "Resume" if they want to keep downloading. But we still want a series row.
        // To enable auto-resume change the next line to: insertQueue.run(sid);
        void insertQueue;
        if (folder) imported.add(folder);
        count++;
      }
    }
    console.log(`[migration] imported ${count} queued series`);
  } catch (e) {
    console.warn("[migration] download_list.json parse failed:", (e as Error).message);
  }
  return imported;
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

function scanLibraryFromDisk() {
  const cfg = getSiteConfig();
  const dirs: { dir: string; type: "manga" | "comic" }[] = [
    { dir: cfg.MANGA_DIRECTORY || "/Manga", type: "manga" },
    { dir: cfg.COMICS_DIRECTORY || "/Comics", type: "comic" },
  ];

  for (const { dir, type } of dirs) {
    if (!fs.existsSync(dir)) continue;
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      console.warn(`[migration] cannot read ${dir}:`, (e as Error).message);
      continue;
    }
    for (const name of entries) {
      const seriesDir = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(seriesDir); } catch { continue; }
      if (!stat.isDirectory()) continue;
      importSeriesFolder(seriesDir, name, type);
    }
  }
}

function importSeriesFolder(folder: string, name: string, type: "manga" | "comic") {
  const safeName = sanitizeFsName(name);
  const slug = ensureUniqueSlug(safeName, folder);

  const cbzFiles = fs.readdirSync(folder).filter((f) => /\.(cbz|cbr|zip)$/i.test(f));
  if (cbzFiles.length === 0) return;

  const oneShot = cbzFiles.length === 1 && !cbzFiles[0].includes(" - ");
  const cover = fs.existsSync(path.join(folder, "cover_image.jpg"))
    ? path.join(folder, "cover_image.jpg") : "";

  let seriesRow = db.prepare("SELECT id FROM series WHERE slug = ? OR (title = ? AND type = ?)")
    .get(slug, safeName, type) as { id: number } | undefined;

  if (!seriesRow) {
    const info = db.prepare(`
      INSERT INTO series (slug, title, type, source, source_url, description, cover_path, status, one_shot, series_folder)
      VALUES (?, ?, ?, '', '', '', ?, 'unknown', ?, ?)
    `).run(slug, safeName, type, cover, oneShot ? 1 : 0, folder);
    seriesRow = { id: info.lastInsertRowid as number };
  } else {
    db.prepare("UPDATE series SET series_folder = COALESCE(NULLIF(series_folder, ''), ?), cover_path = COALESCE(NULLIF(cover_path, ''), ?) WHERE id = ?")
      .run(folder, cover, seriesRow.id);
  }

  const seriesId = seriesRow.id;
  const insertChapter = db.prepare(`
    INSERT OR IGNORE INTO chapters (series_id, number, title, file_path, page_count, downloaded_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const file of cbzFiles) {
    const fullPath = path.join(folder, file);
    const num = parseChapterNumber(file, safeName);
    let pages = 0;
    if (file.toLowerCase().endsWith(".cbz") || file.toLowerCase().endsWith(".zip")) {
      try {
        const list = listCbzImagesSync(fullPath);
        pages = list;
      } catch { /* ignore */ }
    }
    insertChapter.run(seriesId, num, file.replace(/\.(cbz|cbr|zip)$/i, ""), fullPath, pages);
  }
}

function listCbzImagesSync(p: string): number {
  // Best-effort: spawn the async list synchronously by buffering — but we can't
  // block here without async. Return 0 and let the worker re-count later.
  void p;
  return 0;
}

function ensureUniqueSlug(name: string, folder: string): string {
  // Tie slug to folder when possible so re-scans are stable.
  const base = slugify(name) || "series";
  const existing = db.prepare("SELECT slug FROM series WHERE series_folder = ?").get(folder) as { slug: string } | undefined;
  if (existing) return existing.slug;
  let s = base;
  let n = 0;
  while (db.prepare("SELECT id FROM series WHERE slug = ?").get(s)) {
    n++;
    s = `${base}-${n}`;
  }
  return s;
}

function parseChapterNumber(file: string, seriesName: string): number {
  // Strip the prefix "<seriesName> - " if present.
  const base = file.replace(/\.(cbz|cbr|zip)$/i, "");
  const stripped = seriesName && base.toLowerCase().startsWith(seriesName.toLowerCase() + " - ")
    ? base.slice(seriesName.length + 3)
    : base;
  const m = stripped.match(/(\d+(?:\.\d+)?)/);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return 0; // one-shot / unknown
}

// Re-list page counts asynchronously after import (called from instrumentation
// once the DB is up so we don't block server startup).
export async function backfillPageCounts(): Promise<void> {
  const rows = db.prepare("SELECT id, file_path FROM chapters WHERE page_count = 0").all() as
    { id: number; file_path: string }[];
  for (const r of rows) {
    if (!fs.existsSync(r.file_path)) continue;
    try {
      const list = await listCbzImages(r.file_path);
      db.prepare("UPDATE chapters SET page_count = ? WHERE id = ?").run(list.length, r.id);
    } catch { /* skip */ }
  }
}
