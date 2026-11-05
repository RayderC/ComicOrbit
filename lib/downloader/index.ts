import path from "path";
import fs from "fs";
import db, { getSiteConfig } from "../db";
import { writeCbz, countCbzPages } from "../cbz";
import { sanitizeFsName } from "../url";
import { safeFetch } from "../safeUrl";
import { getSource, SOURCES } from "./sources";
import { publish, remove } from "./progress";
import { enqueueChapterNotification } from "../notificationOutbox";
import { buildComicInfoXml } from "../comicinfo";
import type { Source } from "./sources/types";

const POLL_MS = 5000;
let running = false;
const aborts = new Map<number, AbortController>();

interface SeriesRow {
  id: number;
  title: string;
  type: string;
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
        try {
          await runJob(job);
        } catch (e) {
          // Without this, a job that throws (say, an unwritable folder) is picked up again
          // forever and blocks everything queued behind it.
          console.error(`[downloader] job ${job.id} failed:`, e);
          aborts.delete(job.id);
          setStatus(job.id, { status: "error", error_message: (e as Error).message || "Download failed" });
        }
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

const ALLOWED_STATUS_FIELDS = new Set(["status", "error_message", "progress_pct", "current_chapter"]);

function setStatus(queueId: number, fields: Partial<{
  status: string; error_message: string; progress_pct: number; current_chapter: string;
}>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_STATUS_FIELDS.has(k)) continue;
    sets.push(`\`${k}\` = ?`);  // backtick-quote column names as defense-in-depth
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
  const cfg = getSiteConfig();
  const base = cfg.MANGA_DIRECTORY || "/Manga";

  // If a stored folder exists on disk, use it; otherwise (re)create at the correct base path.
  if (s.series_folder && fs.existsSync(s.series_folder)) return s.series_folder;

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

const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10 MB

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
    const { buffer, contentType } = await safeFetch(cover, {
      maxBytes: MAX_COVER_BYTES,
      timeoutMs: 15_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!contentType.startsWith("image/")) {
      console.warn(`[downloader] cover fetch returned non-image content-type "${contentType}" for ${cover}`);
      return;
    }
    fs.writeFileSync(target, buffer);
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
  let failed = 0;
  let lastError = "";
  for (const ch of todo) {
    if (controller.signal.aborted) {
      setStatus(job.id, { status: "paused", current_chapter: "cancelled" });
      aborts.delete(job.id);
      return;
    }

    // Series may have been deleted while we were downloading
    if (!getSeries(s.id)) {
      console.log(`[downloader] series ${s.id} was deleted; stopping job ${job.id}`);
      aborts.delete(job.id);
      remove(job.id);
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

      // Pull the freshest series metadata for the ComicInfo we'll embed.
      const cur = db.prepare(
        "SELECT description, status, source_url FROM series WHERE id = ?"
      ).get(s.id) as { description: string; status: string; source_url: string } | undefined;
      const seriesTags = (db.prepare(
        "SELECT tag FROM series_tags WHERE series_id = ?"
      ).all(s.id) as { tag: string }[]).map((r) => r.tag);

      const comicInfo = buildComicInfoXml({
        series: series.title,
        number: ch.number,
        title: ch.title || undefined,
        summary: cur?.description || undefined,
        status: (cur?.status as "ongoing" | "completed" | "hiatus" | "unknown" | undefined) || undefined,
        tags: seriesTags,
        web: cur?.source_url || undefined,
        oneShot: series.one_shot === 1,
      });

      let finalTarget = target;
      if (payload.kind === "images") {
        await writeCbz(target, payload.images, comicInfo);
      } else {
        // archive: write to disk; if it's a .zip / .cbz / .cbr keep as-is, renamed.
        finalTarget = target.replace(/\.cbz$/, `.${payload.ext === "cbr" ? "cbr" : "cbz"}`);
        fs.writeFileSync(finalTarget, payload.data);
      }

      // Basic integrity check: reject zero-byte or suspiciously tiny files.
      try {
        const stat = fs.statSync(finalTarget);
        if (stat.size < 100) {
          console.warn(`[downloader] chapter ${ch.number} file too small (${stat.size} bytes), skipping`);
          try { fs.unlinkSync(finalTarget); } catch { /* ignore */ }
          failed++;
          lastError = `Chapter ${ch.number} came back empty`;
          continue;
        }
      } catch {
        console.warn(`[downloader] chapter ${ch.number} file stat failed, skipping`);
        failed++;
        lastError = `Chapter ${ch.number} couldn't be saved`;
        continue;
      }

      const pages = await countCbzPages(finalTarget).catch(() => 0);
      db.prepare(`
        INSERT OR REPLACE INTO chapters (series_id, number, title, file_path, page_count, downloaded_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(s.id, ch.number, ch.title || "", finalTarget, pages);

      // Enqueue a per-favoriter notification; the outbox flusher coalesces
      // bursts (e.g. catching up 5 chapters) into a single push.
      try { enqueueChapterNotification(s.id, ch.number); } catch { /* non-fatal */ }

      completed++;

      // Brief pause between chapters so we don't saturate the source's rate limits.
      if (completed < todo.length) await sleep(1500);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") {
        setStatus(job.id, { status: "paused", current_chapter: "cancelled" });
        aborts.delete(job.id);
        return;
      }
      const msg = (e as Error).message || String(e);
      console.error(`[downloader] chapter ${ch.number} failed:`, msg);
      failed++;
      lastError = `Chapter ${ch.number}: ${msg}`;
      // Move on to the next chapter instead of failing the whole series.
      // (User can see partial progress and retry.)
    }
  }

  aborts.delete(job.id);
  if (failed > 0) {
    // Report it, so the queue doesn't say "complete" with chapters missing. Retrying only fetches what's missing.
    setStatus(job.id, {
      status: "error",
      error_message: `${failed} of ${todo.length} chapters failed. ${lastError}`.slice(0, 500),
      current_chapter: `${completed} of ${todo.length} downloaded`,
    });
    return;
  }
  setStatus(job.id, { status: "done", progress_pct: 100, current_chapter: "complete" });
}

export function cancelJob(queueId: number) {
  const c = aborts.get(queueId);
  if (c) c.abort();
  setStatus(queueId, { status: "paused", current_chapter: "cancelled" });
  remove(queueId);
}

export function cancelJobForSeries(seriesId: number) {
  const jobs = db.prepare(
    "SELECT id FROM download_queue WHERE series_id = ? AND status IN ('queued', 'downloading')"
  ).all(seriesId) as { id: number }[];
  for (const { id } of jobs) {
    const c = aborts.get(id);
    if (c) { c.abort(); aborts.delete(id); }
    remove(id);
  }
}

export async function scanAllSeries(): Promise<void> {
  const allSeries = db.prepare(
    "SELECT id, source, source_url FROM series WHERE source_url != ''"
  ).all() as { id: number; source: string; source_url: string }[];
  // Series from a source that was removed stay readable; there's just nothing to check them against.
  const scannable = allSeries.filter((s) => SOURCES[s.source]);

  console.log(`[downloader] scanning ${scannable.length} series for new chapters`);
  let queued = 0;

  for (const s of scannable) {
    const existing = db.prepare(
      "SELECT id FROM download_queue WHERE series_id = ? AND status IN ('queued', 'downloading')"
    ).get(s.id);
    if (existing) continue;

    try {
      const source = getSource(s.source);
      const remote = await source.listChapters(s.source_url);
      const localNums = new Set<number>(
        (db.prepare("SELECT number FROM chapters WHERE series_id = ?").all(s.id) as { number: number }[])
          .map((r) => r.number)
      );
      const hasNew = remote.some((c) => !localNums.has(c.number));
      if (hasNew) {
        db.prepare("INSERT INTO download_queue (series_id) VALUES (?)").run(s.id);
        queued++;
        console.log(`[downloader] scan: queued series ${s.id} for update`);
      }
    } catch (e) {
      console.warn(`[downloader] scan: series ${s.id} failed:`, (e as Error).message);
    }

    await sleep(500);
  }

  console.log(`[downloader] scan complete — ${queued} series queued`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
