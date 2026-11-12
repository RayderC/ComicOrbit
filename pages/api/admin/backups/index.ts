import type { NextApiRequest, NextApiResponse } from "next";
import { backupConfig } from "../../../../lib/backup";
import { listBackups, makeBackup } from "../../../../lib/backupCore";
import { requireAdmin } from "../../../../lib/opsApi";

/** GET: the saved copies. POST: save one now. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await requireAdmin(req, res))) return;
  if (req.method === "GET") { res.json({ backups: listBackups(backupConfig), folder: backupConfig.dir }); return; }
  if (req.method === "POST") { res.json(await makeBackup(backupConfig, "manual")); return; }
  res.status(405).end();
}
