import { NextRequest, NextResponse } from "next/server";
import { getVerifiedSession } from "@/lib/authServer";
import { safeFetch } from "@/lib/safeUrl";

export const runtime = "nodejs";

const SAFE_IMAGE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET(req: NextRequest) {
  const session = await getVerifiedSession();
  if (!session.user) {
    return NextResponse.json({ message: "Login required" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!url) return NextResponse.json({ message: "url required" }, { status: 400 });

  try {
    const { buffer, contentType } = await safeFetch(url, {
      maxBytes: MAX_BYTES,
      timeoutMs: 10_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!SAFE_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ message: "not an image" }, { status: 400 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ message: "proxy failed" }, { status: 502 });
  }
}
