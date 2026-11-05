import { NextRequest, NextResponse } from "next/server";
import { authenticateBasic, BASIC_CHALLENGE } from "@/lib/basicAuth";
import fs from "fs";
import path from "path";
import db, { getSiteConfig } from "@/lib/db";
import { safeFetch } from "@/lib/safeUrl";

export const runtime = "nodejs";

const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function getAllowedLocalDirs(): string[] {
  const cfg = getSiteConfig();
  return [
    cfg.MANGA_DIRECTORY || "/Manga",
    path.join(process.env.CONFIG_DIRECTORY || "/config", "covers"),
  ].map((d) => path.resolve(d));
}

function isPathWithinAllowedDirs(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return getAllowedLocalDirs().some((dir) => resolved.startsWith(dir + path.sep) || resolved === dir);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateBasic(req);
  if (!user) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_CHALLENGE },
    });
  }

  const { id } = await ctx.params;
  const seriesId = Number(id);
  if (!Number.isFinite(seriesId)) return new NextResponse("bad id", { status: 400 });

  const row = db.prepare("SELECT cover_path FROM series WHERE id = ?").get(seriesId) as { cover_path: string } | undefined;
  if (!row?.cover_path) return new NextResponse("no cover", { status: 404 });

  const cover = row.cover_path;

  if (/^https?:\/\//i.test(cover)) {
    try {
      const { buffer, contentType } = await safeFetch(cover, {
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: 15_000,
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (!SAFE_IMAGE_TYPES.has(contentType)) return new NextResponse("non-image", { status: 502 });
      return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300" } });
    } catch {
      return new NextResponse("proxy failed", { status: 502 });
    }
  }

  if (!isPathWithinAllowedDirs(cover)) return new NextResponse("forbidden", { status: 403 });
  if (!fs.existsSync(cover)) return new NextResponse("missing on disk", { status: 404 });
  const data = fs.readFileSync(cover);
  const ext = path.extname(cover).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" :
    "image/jpeg";
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
  });
}
