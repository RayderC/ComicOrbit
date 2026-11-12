export async function register() {
  // Only run in the Node.js server runtime (skip during edge / build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrationIfNeeded, backfillPageCounts } = await import("./lib/migration");
  const { startWorker, scanAllSeries } = await import("./lib/downloader");
  const { ensureVapidKeys } = await import("./lib/webpush");
  const { startOutboxFlusher } = await import("./lib/notificationOutbox");

  try {
    runMigrationIfNeeded();
  } catch (e) {
    console.error("[instrumentation] migration error:", e);
  }

  // Generate VAPID keys once and persist them in site_config for push notifications.
  try { ensureVapidKeys(); } catch (e) { console.warn("[instrumentation] vapid:", e); }

  // Backfill page counts in the background; failures here are non-fatal.
  backfillPageCounts().catch((e) => console.warn("[instrumentation] backfill:", e));

  startWorker();
  startOutboxFlusher();

  // The nightly backup and the daily update check, each hour.
  const { nightlyBackup } = await import("./lib/backupCore");
  const { backupConfig } = await import("./lib/backup");
  const { checkForUpdate } = await import("./lib/updateCore");
  const jobs = async () => {
    await nightlyBackup(backupConfig).catch((e) => console.error("[backup] nightly copy failed", e));
    await checkForUpdate("rayderc/comicorbit");
  };
  setTimeout(jobs, 60_000).unref();
  setInterval(jobs, 60 * 60 * 1000).unref();

  // Scan for new chapters on startup, then repeat every 6 hours.
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setTimeout(() => {
    scanAllSeries().catch((e) => console.warn("[instrumentation] startup scan:", e));
    setInterval(() => {
      scanAllSeries().catch((e) => console.warn("[instrumentation] periodic scan:", e));
    }, SIX_HOURS);
  }, 10_000); // 10-second delay so the server is fully ready before the first scan
}
