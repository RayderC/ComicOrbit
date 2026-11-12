import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import { backupConfig } from "../../../../lib/backup";
import { backupPath, downloadStream } from "../../../../lib/backupCore";
import { one, requireAdmin } from "../../../../lib/opsApi";

/** No name: everything as a .tar. With ?name=: one saved copy, as a .db. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.status(405).end(); return; }
  if (!(await requireAdmin(req, res))) return;
  const name = one(req.query.name);
  if (name) {
    const p = backupPath(backupConfig, name);
    if (!p) { res.status(404).json({ message: "Backup not found" }); return; }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", String(fs.statSync(p).size));
    res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/\.backup$/, ".db")}"`);
    fs.createReadStream(p).pipe(res);
    return;
  }
  const { stream, filename } = await downloadStream(backupConfig);
  res.setHeader("Content-Type", "application/x-tar");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  stream.pipe(res);
}

export const config = { api: { responseLimit: false } };
