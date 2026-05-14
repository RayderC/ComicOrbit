import path from "path";
import fs from "fs";
import db, { getSiteConfig } from "../db";
import { writeCbz, countCbzPages } from "../cbz";
import { sanitizeFsName } from "../url";
import { getSource } from "./sources";
import { publish, remove } from "./progress";
import type { Source } from "./sources/types";

const POLL_MS = 5000;
let running = false;
const aborts = new Map<number, AbortController>();

interface SeriesRow {
  id: number;
  title: string;
  type: "manga" | "comic";
  source: string;
  source_url: string;
  series_folder: string;
  one_shot: number;
}

interface QueueRow {
  id: number;
  series_id: number;
}

export function startWorker() {
  if (running) return;
  running = true;
  console.log("[downloader] worker starting");
  loop().catch((e) => {
    console.error("[downloader] fatal:", e);
    running = false;
  });
}

async function loop() {
  while (running) {
    try {
      const job = nextJob();
      if (job) {
        await runJob(job);
      } else {
        await sleep(POLL_MS);
      }
    } catch (e) {
      console.error("[downloader] loop error:", e);
      await sleep(POLL_MS);
    }
  }
}

function nextJob(): QueueRow | null {
  const row = db.prepare(`
    SELECT id, series_id FROM download_queue
    WHERE status IN ('queued', 'downloading')
    ORDER BY added_at ASC LIMIT 1
  `).get() as QueueRow | undefined;
  return row ?? null;
}

function setStatus(queueId: number, fields: Partial<{
  status: string; error_message: string; progress_pct: number; current_chapter: string;
}>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE download_queue SET ${sets.join(", ")} WHERE id = ?`).run(...vals, queueId);

  const row = db.prepare(`
    SELECT id, series_id, status, error_message, progress_pct, current_chapter, updated_at
    FROM download_queue WHERE id = ?
  `).get(queueId) as {
    id: number; series_id: number; status: string;
    error_message: string; progress_pct: number;
    current_chapter: string; updated_at: string;
  } | undefined;
  if (row) {
    publish({
      queueId: row.id,
      seriesId: row.series_id,
      status: row.status as "queued" | "downloading" | "paused" | "error" | "done",
      progress_pct: row.progress_pct,
      current_chapter: row.current_chapter,
      error_message: row.error_message,
      updated_at: row.updated_at,
    });
  }
}

function getSeries(id: number): SeriesRow | null {
  const s = db.prepare(`
    SELECT id, title, type, source, source_url, series_folder, one_shot FROM series WHERE id = ?
  `).get(id) as SeriesRow | undefined;
  return s ?? null;
}

function ensureSeriesFolder(s: SeriesRow): string {
  if (s.series_folder) return s.series_folder;
  const cfg = getSiteConfig();
  const base = s.type === "comic"
    ? (cfg.COMICS_DIRECTORY || "/Comics")
    : (cfg.MANGA_DIRECTORY || "/Manga");
  const dir = path.join(base, sanitizeFsName(s.title));
  fs.mkdirSync(dir, { recursive: true });
  db.prepare("UPDATE series SET series_folder = ? WHERE id = ?").run(dir, s.id);
  return dir;
}

function chapterFilePath(s: SeriesRow, folder: string, num: number): string {
  const safeTitle = sanitizeFsName(s.title);
  if (s.one_shot === 1) return path.join(folder, `${safeTitle}.cbz`);
  return path.join(folder, `${safeTitle} - ${num}.cbz`);
}

async function downloadCoverIfMissing(s: SeriesRow, folder: string, cover?: string): Promise<void> {
  if (!cover) return;
  const target = path.join(folder, "cover_image.jpg");
  if (fs.existsSync(target)) {
    if (!getSeriesCoverPath(s.id)) {
      db.prepare("UPDATE series SET cover_path = ? WHERE id = ?").run(target, s.id);
    }
    return;
  }
  try {
    const r = await fetch(cover);
    if (!r.ok) return;
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(target, buf);
    db.prepare("UPDATE series SET cover_path = ? WHERE id = ?").run(target, s.id);
  } catch (e) {
    console.warn("[downloader] cover fetch failed:", (e as Error).message);
  }
}

function getSeriesCoverPath(id: number): string {
  const r = db.prepare("SELECT cover_path FROM series WHERE id = ?").get(id) as { cover_path: string } | undefined;
  return r?.cover_path || "";
}

async function runJob(job: QueueRow): Promise<void> {
  const s = getSeries(job.series_id);
  if (!s) {
    setStatus(job.id, { status: "error", error_message: "Series no longer exists" });
    return;
  }

  let source: Source;
  try {
    source = getSource(s.source);
  } catch (e) {
    setStatus(job.id, { status: "error", error_message: (e as Error).message });
    return;
  }

  setStatus(job.id, { status: "downloading", progress_pct: 0, current_chapter: "preparing", error_message: "" });

  const folder = ensureSeriesFolder(s);

  // Refresh metadata + cover.
  try {
    const meta = await source.getMetadata(s.source_url);
    db.prepare(`
      UPDATE series SET description = ?, status = ?, one_shot = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(meta.description || "", meta.status || "unknown", meta.oneShot ? 1 : 0, s.id);

    // Sync tags (replace).
    const txn = db.transaction((tags: string[]) => {
      db.prepare("DELETE FROM series_tags WHERE series_id = ?").run(s.id);
      const ins = db.prepare("INSERT OR IGNORE INTO series_tags (series_id, tag) VALUES (?, ?)");
      for (const t of tags) {
        const tag = (t || "").trim();
        if (tag) ins.run(s.id, tag);
      }
    });
    txn(meta.tags);

    await downloadCoverIfMissing({ ...s, one_shot: meta.oneShot ? 1 : 0 }, folder, meta.cover);
  } catch (e) {
    console.warn("[downloader] metadata refresh failed:", (e as Error).message);
  }

  // Reload to pick up oneShot change.
  const series = getSeries(s.id);
  if (!series) {
    setStatus(job.id, { status: "error", error_message: "Series vanished" });
    return;
  }

  let chapters;
  try {
    chapters = await source.listChapters(series.source_url);
  } catch (e) {
    setStatus(job.id, { status: "error", error_message: `listChapters: ${(e as Error).message}` });
    return;
  }

  if (chapters.length === 0) {
    setStatus(job.id, { status: "done", progress_pct: 100, current_chapter: "no chapters found" });
    return;
  }

  // Skip already-downloaded chapters.
  const have = new Set<number>(
    (db.prepare("SELECT number FROM chapters WHERE series_id = ?").all(s.id) as { number: number }[])
      .map((r) => r.number)
  );
  const todo = chapters.filter((c) => !have.has(c.number));

  if (todo.length === 0) {
    setStatus(job.id, { status: "done", progress_pct: 100, current_chapter: "up to date" });
    return;
  }

  const controller = new AbortController();
  aborts.set(job.id, controller);

  let completed = 0;
  for (const ch of todo) {
    if (controller.signal.aborted) {
      setStatus(job.id, { status: "paused", current_chapter: "cancelled" });
      aborts.delete(job.id);
      return;
    }

    setStatus(job.id, {
      current_chapter: series.one_shot === 1 ? series.title : `Chapter ${ch.number}`,
      progress_pct: Math.round((completed / todo.length) * 100),
    });

    try {
      const payload = await source.fetchChapter(ch, (cur, total) => {
        const pageFrac = total > 0 ? cur / total : 0;
        const overall = (completed + pageFrac) / todo.length;
        const pct = Math.min(99, Math.round(overall * 100));
        // throttle: only publish on integer percentage changes
        setStatus(job.id, { progress_pct: pct });
      }, controller.signal);

      if (payload.kind === "unsupported_host") {
        setStatus(job.id, {
          status: "error",
          error_message: `Unsupported download host: ${payload.host}. Open ${payload.url} manually.`,
        });
        aborts.delete(job.id);
        return;
      }

      const target = chapterFilePath(series, folder, ch.number);

      if (payload.kind === "images") {
        await writeCbz(target, payload.images);
      } else {
        // archive: write to disk; if it's a .zip / .cbz / .cbr keep as-is, renamed.
        const finalTarget = target.replace(/\.cbz$/, `.${payload.ext === "cbr" ? "cbr" : "cbz"}`);
        fs.writeFileSync(finalTarget, payload.data);
      }

      const pages = await countCbzPages(target).catch(() => 0);
      db.prepare(`
        INSERT OR REPLACE INTO chapters (series_id, number, title, file_path, page_count, downloaded_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(s.id, ch.number, ch.title || "", target, pages);

      completed++;
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") {
        setStatus(job.id, { status: "paused", current_chapter: "cancelled" });
        aborts.delete(job.id);
        return;
      }
      const msg = (e as Error).message || String(e);
      console.error(`[downloader] chapter ${ch.number} failed:`, msg);
      // Move on to the next chapter instead of failing the whole series.
      // (User can see partial progress and retry.)
    }
  }

  aborts.delete(job.id);
  setStatus(job.id, { status: "done", progress_pct: 100, current_chapter: "complete" });
}

export function cancelJob(queueId: number) {
  const c = aborts.get(queueId);
  if (c) c.abort();
  setStatus(queueId, { status: "paused", current_chapter: "cancelled" });
  remove(queueId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
