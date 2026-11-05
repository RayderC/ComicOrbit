import type { NextApiRequest, NextApiResponse } from "next";
import db, { getSiteConfig } from "../../../lib/db";
import fs from "fs";
import path from "path";
import { getApiSession } from "../../../lib/auth";
import { checkCsrf } from "../../../lib/csrf";

function getAllowedChapterDirs(): string[] {
  const cfg = getSiteConfig();
  return [cfg.MANGA_DIRECTORY || "/Manga"].map((d) => path.resolve(d));
}

function isChapterPathSafe(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return getAllowedChapterDirs().some(
    (dir) => resolved.startsWith(dir + path.sep) || resolved === dir
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") { res.status(405).end(); return; }

  if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }

  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const chapter = db.prepare("SELECT id, file_path FROM chapters WHERE id = ?").get(id) as
    | { id: number; file_path: string }
    | undefined;
  if (!chapter) { res.status(404).json({ message: "Chapter not found" }); return; }

  // Delete the file before the DB row so a concurrent request doesn't see a
  // "chapter exists but file missing" state. Validate path is within allowed dirs first.
  if (chapter.file_path && isChapterPathSafe(chapter.file_path) && fs.existsSync(chapter.file_path)) {
    try { fs.unlinkSync(chapter.file_path); } catch { /* ignore */ }
  }

  db.prepare("DELETE FROM chapters WHERE id = ?").run(id);

  res.json({ ok: true });
}
