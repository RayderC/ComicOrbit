export async function register() {
  // Only run in the Node.js server runtime (skip during edge / build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrationIfNeeded, backfillPageCounts } = await import("./lib/migration");
  const { startWorker, scanAllSeries } = await import("./lib/downloader");

  try {
    runMigrationIfNeeded();
  } catch (e) {
    console.error("[instrumentation] migration error:", e);
  }

  // Backfill page counts in the background; failures here are non-fatal.
  backfillPageCounts().catch((e) => console.warn("[instrumentation] backfill:", e));

  startWorker();

  // Scan for new chapters on startup, then repeat every 6 hours.
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setTimeout(() => {
    scanAllSeries().catch((e) => console.warn("[instrumentation] startup scan:", e));
    setInterval(() => {
      scanAllSeries().catch((e) => console.warn("[instrumentation] periodic scan:", e));
    }, SIX_HOURS);
  }, 10_000); // 10-second delay so the server is fully ready before the first scan
}
