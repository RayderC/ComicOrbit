export async function register() {
  // Only run in the Node.js server runtime (skip during edge / build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runMigrationIfNeeded, backfillPageCounts } = await import("./lib/migration");
  const { startWorker } = await import("./lib/downloader");

  try {
    runMigrationIfNeeded();
  } catch (e) {
    console.error("[instrumentation] migration error:", e);
  }

  // Backfill page counts in the background; failures here are non-fatal.
  backfillPageCounts().catch((e) => console.warn("[instrumentation] backfill:", e));

  startWorker();
}
