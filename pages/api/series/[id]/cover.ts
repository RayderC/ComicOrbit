import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../../lib/session";
import db from "../../../../lib/db";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  const { dataUrl } = req.body ?? {};
  if (typeof dataUrl !== "string") { res.status(400).json({ message: "Missing dataUrl" }); return; }

  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) { res.status(400).json({ message: "Invalid image format" }); return; }

  const [, mime, base64] = match;
  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : mime === "image/gif" ? ".gif" : ".jpg";
  const buf = Buffer.from(base64, "base64");

  const row = db.prepare("SELECT series_folder FROM series WHERE id = ?").get(id) as { series_folder: string | null } | undefined;
  if (!row) { res.status(404).json({ message: "Series not found" }); return; }

  // Save to series folder if it exists, otherwise use /config
  const dir = row.series_folder && fs.existsSync(row.series_folder)
    ? row.series_folder
    : process.env.CONFIG_DIR || "/config";

  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {
      res.status(500).json({ message: "Could not create directory" }); return;
    }
  }

  // Remove old cover files with different extension
  for (const oldExt of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
    const old = path.join(dir, `cover${oldExt}`);
    if (oldExt !== ext && fs.existsSync(old)) {
      try { fs.unlinkSync(old); } catch { /* ignore */ }
    }
  }

  const coverPath = path.join(dir, `cover${ext}`);
  try {
    fs.writeFileSync(coverPath, buf);
  } catch {
    res.status(500).json({ message: "Failed to save file" }); return;
  }

  db.prepare("UPDATE series SET cover_path = ?, updated_at = datetime('now') WHERE id = ?").run(coverPath, id);
  res.json({ ok: true });
}
