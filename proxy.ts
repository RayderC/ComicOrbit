import { getIronSession } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_PASSWORD =
  process.env.SESSION_SECRET ?? "build_time_placeholder_secret_at_least_32_chars";

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  try {
    const session = await getIronSession<{ user?: { id: number; username: string } }>(
      req,
      res,
      { password: SESSION_PASSWORD, cookieName: "comicorbit_session" }
    );
    if (!session.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export const config = {
  matcher: ["/((?!login|setup|api|_next|favicon\\.ico).*)"],
};
