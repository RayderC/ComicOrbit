import type { NextApiRequest, NextApiResponse } from "next";
import { getIronSession } from "iron-session";
import { sessionOptions, User } from "../../../../lib/session";
import db from "../../../../lib/db";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const customCoversDir = () => path.join(process.env.CONFIG_DIR || "/config", "covers");

function deleteCustomCoverFiles(id: number) {
  const dir = customCoversDir();
  for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
    const f = path.join(dir, `${id}${ext}`);
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{ user?: User }>(req, res, sessionOptions);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  // ── POST: upload custom cover ──
  if (req.method === "POST") {
    const { dataUrl } = req.body ?? {};
    if (typeof dataUrl !== "string") { res.status(400).json({ message: "Missing dataUrl" }); return; }

    const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ message: "Invalid image format" }); return; }

    const [, mime, base64] = match;
    const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : mime === "image/gif" ? ".gif" : ".jpg";
    const buf = Buffer.from(base64, "base64");

    const row = db.prepare("SELECT cover_path, original_cover_path FROM series WHERE id = ?").get(id) as
      { cover_path: string; original_cover_path: string } | undefined;
    if (!row) { res.status(404).json({ message: "Series not found" }); return; }

    const dir = customCoversDir();
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {
        res.status(500).json({ message: "Could not create covers directory" }); return;
      }
    }

    // Remove any existing custom cover files for this series
    deleteCustomCoverFiles(id);

    const coverPath = path.join(dir, `${id}${ext}`);
    try { fs.writeFileSync(coverPath, buf); } catch {
      res.status(500).json({ message: "Failed to save file" }); return;
    }

    // Save the original cover_path the first time only
    const originalToSave = row.original_cover_path || row.cover_path;
    db.prepare(
      "UPDATE series SET cover_path = ?, original_cover_path = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(coverPath, originalToSave, id);

    res.json({ ok: true });
    return;
  }

  // ── DELETE: revert to original cover ──
  if (req.method === "DELETE") {
    const row = db.prepare("SELECT original_cover_path FROM series WHERE id = ?").get(id) as
      { original_cover_path: string } | undefined;
    if (!row) { res.status(404).json({ message: "Series not found" }); return; }

    deleteCustomCoverFiles(id);

    db.prepare(
      "UPDATE series SET cover_path = ?, original_cover_path = '', updated_at = datetime('now') WHERE id = ?"
    ).run(row.original_cover_path || "", id);

    res.json({ ok: true });
    return;
  }

  res.status(405).end();
}
