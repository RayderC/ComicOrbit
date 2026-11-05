import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import db from "../../../lib/db";
import { getApiSession } from "../../../lib/auth";
import { checkCsrf } from "../../../lib/csrf";

export const config = { api: { bodyParser: { sizeLimit: "1kb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  if (!checkCsrf(req)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  // Find all chapters whose file is missing on disk.
  const allChapters = db.prepare(
    "SELECT id, series_id, file_path FROM chapters WHERE file_path != ''"
  ).all() as { id: number; series_id: number; file_path: string }[];

  const missingBySeriesId = new Map<number, number[]>();
  for (const ch of allChapters) {
    if (!fs.existsSync(ch.file_path)) {
      const ids = missingBySeriesId.get(ch.series_id) ?? [];
      ids.push(ch.id);
      missingBySeriesId.set(ch.series_id, ids);
    }
  }

  if (missingBySeriesId.size === 0) {
    res.json({ series: 0, chapters: 0 });
    return;
  }

  // Delete missing chapter records so the downloader will re-fetch them.
  const deleteChapter = db.prepare("DELETE FROM chapters WHERE id = ?");
  let chaptersCleared = 0;
  const deleteTxn = db.transaction(() => {
    for (const ids of missingBySeriesId.values()) {
      for (const id of ids) {
        deleteChapter.run(id);
        chaptersCleared++;
      }
    }
  });
  deleteTxn();

  // Enqueue each affected series that isn't already queued or downloading.
  const insertQueue = db.prepare("INSERT INTO download_queue (series_id, status) VALUES (?, 'queued')");
  const checkActive = db.prepare(
    "SELECT id FROM download_queue WHERE series_id = ? AND status IN ('queued', 'downloading')"
  );
  let seriesQueued = 0;
  for (const seriesId of missingBySeriesId.keys()) {
    if (!checkActive.get(seriesId)) {
      insertQueue.run(seriesId);
      seriesQueued++;
    }
  }

  res.json({ series: seriesQueued, chapters: chaptersCleared });
}
