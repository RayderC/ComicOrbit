import { NextRequest, NextResponse } from "next/server";
import { authenticateBasic, BASIC_CHALLENGE } from "@/lib/basicAuth";
import { CBZ_MIME } from "@/lib/opds";
import db, { getSiteConfig } from "@/lib/db";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function isInsideAllowedDirs(filePath: string): boolean {
  const cfg = getSiteConfig();
  const allowed = [cfg.MANGA_DIRECTORY || "/Manga"].map((d) => path.resolve(d));
  const resolved = path.resolve(filePath);
  return allowed.some((dir) => resolved === dir || resolved.startsWith(dir + path.sep));
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chapterId: string }> }) {
  const user = await authenticateBasic(req);
  if (!user) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": BASIC_CHALLENGE },
    });
  }

  const { chapterId } = await ctx.params;
  const cId = Number(chapterId);
  if (!Number.isFinite(cId)) return new NextResponse("Bad id", { status: 400 });

  const row = db.prepare(`
    SELECT c.file_path, c.number, s.title AS series_title
    FROM chapters c JOIN series s ON s.id = c.series_id
    WHERE c.id = ?
  `).get(cId) as { file_path: string; number: number; series_title: string } | undefined;

  if (!row?.file_path) return new NextResponse("Not found", { status: 404 });
  if (!isInsideAllowedDirs(row.file_path)) return new NextResponse("Forbidden", { status: 403 });
  if (!fs.existsSync(row.file_path)) return new NextResponse("Missing on disk", { status: 404 });

  const buf = fs.readFileSync(row.file_path);
  const filename = `${row.series_title} - ${Number.isInteger(row.number) ? row.number : row.number.toFixed(1)}.cbz`
    .replace(/[\\/]/g, "_");

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": CBZ_MIME,
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
