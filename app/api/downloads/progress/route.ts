import { getVerifiedSession } from "@/lib/authServer";
import { subscribe, snapshot } from "@/lib/downloader/progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getVerifiedSession();
  if (!session.user?.isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)); } catch { cleanup(); }
      };

      write(`data: ${JSON.stringify(snapshot())}\n\n`);
      const unsubscribe = subscribe((snap) => write(`data: ${JSON.stringify(snap)}\n\n`));

      // Keep the connection warm with a periodic comment line.
      const ping = setInterval(() => write(": ping\n\n"), 15000);

      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
    },
    cancel() {
      cleanup();
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
