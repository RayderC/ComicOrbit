import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, User } from "@/lib/session";
import { subscribe, snapshot } from "@/lib/downloader/progress";

type SessionData = { user?: User };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.user?.isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial snapshot.
      send(snapshot());

      const unsubscribe = subscribe((snap) => send(snap));

      // Keep the connection warm with a periodic comment line.
      const ping = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* closed */ }
      }, 15000);

      const close = () => {
        clearInterval(ping);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      };

      // The Next runtime aborts the request on disconnect via the stream's
      // `cancel`; we wire cleanup there.
      (controller as unknown as { __close?: () => void }).__close = close;
    },
    cancel() {
      const c = (this as unknown as { __close?: () => void }).__close;
      if (c) c();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
