import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline } from "stream/promises";
import { backupConfig } from "../../../../lib/backup";
import { backupPath, restore, uploadTemp } from "../../../../lib/backupCore";
import { one, requireAdmin } from "../../../../lib/opsApi";

/** The backup file as the request body, or ?name= for a saved copy. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (!(await requireAdmin(req, res))) return;
  const name = one(req.query.name);
  let file: string | null = null, temp = false;
  try {
    if (name) {
      file = backupPath(backupConfig, name);
      if (!file) { res.status(404).json({ message: "Backup not found" }); return; }
    } else {
      file = uploadTemp(backupConfig.app); temp = true;
      await pipeline(req, fs.createWriteStream(file));
      if (fs.statSync(file).size < 512) { res.status(400).json({ message: "That file is empty" }); return; }
    }
    try {
      res.json({ ok: true, ...(await restore(backupConfig, file)) });
    } catch (e) {
      res.status(400).json({ message: (e as Error).message });
    }
  } finally {
    if (temp && file) fs.rmSync(file, { force: true });
  }
}

// The upload is streamed to disk, not parsed.
export const config = { api: { bodyParser: false } };
