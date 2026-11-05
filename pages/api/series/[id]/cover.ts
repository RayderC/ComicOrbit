import type { NextApiRequest, NextApiResponse } from "next";
import { getApiSession } from "../../../../lib/auth";
import { checkCsrf } from "../../../../lib/csrf";
import db from "../../../../lib/db";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

// Strict allowlist — no SVG (can embed scripts), no AVIF/HEIC (exotic parsers)
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_DECODED_BYTES = 8 * 1024 * 1024; // 8 MB after base64 decode

const customCoversDir = () => path.join(process.env.CONFIG_DIRECTORY || "/config", "covers");

function matchesMime(b: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 4).toString("latin1") === "\x89PNG";
  if (mime === "image/gif") return b.subarray(0, 4).toString("latin1") === "GIF8";
  if (mime === "image/webp") return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}

function deleteCustomCoverFiles(id: number) {
  const dir = customCoversDir();
  for (const ext of Object.values(ALLOWED_MIME)) {
    const f = path.join(dir, `${id}${ext}`);
    if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getApiSession(req, res);
  if (!session.user?.isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  if (req.method === "POST" || req.method === "DELETE") {
    if (!checkCsrf(req)) { res.status(403).json({ message: "Forbidden" }); return; }
  }

  const id = Number(req.query.id);
  if (!Number.isFinite(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  // ── POST: upload custom cover ──
  if (req.method === "POST") {
    const { dataUrl } = req.body ?? {};
    if (typeof dataUrl !== "string") { res.status(400).json({ message: "Missing dataUrl" }); return; }

    const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!match) { res.status(400).json({ message: "Invalid image format" }); return; }

    const [, mime, base64] = match;
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
      res.status(400).json({ message: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." });
      return;
    }

    const buf = Buffer.from(base64, "base64");
    if (!matchesMime(buf, mime)) {
      res.status(400).json({ message: "That file isn't the image type it claims to be" });
      return;
    }
    if (buf.length > MAX_DECODED_BYTES) {
      res.status(400).json({ message: "Image must be under 8 MB" });
      return;
    }

    const row = db.prepare("SELECT cover_path, original_cover_path FROM series WHERE id = ?").get(id) as
      { cover_path: string; original_cover_path: string } | undefined;
    if (!row) { res.status(404).json({ message: "Series not found" }); return; }

    const dir = customCoversDir();
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {
        res.status(500).json({ message: "Could not create covers directory" }); return;
      }
    }

    deleteCustomCoverFiles(id);

    const coverPath = path.join(dir, `${id}${ext}`);
    try { fs.writeFileSync(coverPath, buf); } catch {
      res.status(500).json({ message: "Failed to save file" }); return;
    }

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
