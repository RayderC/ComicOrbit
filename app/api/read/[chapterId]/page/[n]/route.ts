import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/authServer";
import db from "@/lib/db";
import { streamCbzImage } from "@/lib/cbz";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ chapterId: string; n: string }> }
) {
  const session = await getVerifiedSession();
  if (!session.user) {
    return NextResponse.json({ message: "Login required" }, { status: 401 });
  }

  const { chapterId, n } = await ctx.params;
  const cId = Number(chapterId);
  const pageIdx = Number(n);
  if (!Number.isFinite(cId) || !Number.isFinite(pageIdx) || pageIdx < 0) {
    return NextResponse.json({ message: "Bad params" }, { status: 400 });
  }

  const row = db.prepare("SELECT file_path FROM chapters WHERE id = ?").get(cId) as { file_path: string } | undefined;
  if (!row) return NextResponse.json({ message: "Chapter not found" }, { status: 404 });

  try {
    const { buffer, name } = await streamCbzImage(row.file_path, pageIdx);
    const ext = name.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "gif" ? "image/gif" :
      "image/jpeg";
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    void e;
    return NextResponse.json({ message: "Page not found" }, { status: 404 });
  }
}
