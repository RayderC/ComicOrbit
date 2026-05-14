import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import db from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const seriesId = Number(id);
  if (!Number.isFinite(seriesId)) return NextResponse.json({ message: "bad id" }, { status: 400 });

  const row = db.prepare("SELECT cover_path FROM series WHERE id = ?").get(seriesId) as { cover_path: string } | undefined;
  if (!row?.cover_path) return NextResponse.json({ message: "no cover" }, { status: 404 });

  const cover = row.cover_path;

  // Allow either local file paths or http(s) URLs (we proxy remote covers so the
  // browser always hits same-origin and avoids CORS hassles).
  if (/^https?:\/\//i.test(cover)) {
    try {
      const upstream = await fetch(cover);
      if (!upstream.ok) return NextResponse.json({ message: "upstream cover failed" }, { status: 502 });
      const buf = Buffer.from(await upstream.arrayBuffer());
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (e) {
      return NextResponse.json({ message: "proxy failed", error: (e as Error).message }, { status: 502 });
    }
  }

  if (!fs.existsSync(cover)) return NextResponse.json({ message: "missing on disk" }, { status: 404 });
  const data = fs.readFileSync(cover);
  const ext = path.extname(cover).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" :
    ext === ".webp" ? "image/webp" :
    ext === ".gif" ? "image/gif" :
    "image/jpeg";
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" },
  });
}
