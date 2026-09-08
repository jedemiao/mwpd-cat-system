import { getActiveSession } from "@/lib/session";
import { subscribeToUser } from "@/lib/notifyBus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 20000;

// Server-Sent Events stream: pushes "routed to you" updates live to the
// signed-in user's browser tab. One in-memory subscription per open tab —
// fine at this office's scale (see notifyBus.ts for why no external broker).
export async function GET(req: Request) {
  const session = await getActiveSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval>;
  let unsubscribe: () => void;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Flush a chunk before anything else. A ReadableStream response does
      // not send its headers until the first chunk is enqueued, so with only
      // the heartbeat below the browser got no reply for a full 20 seconds:
      // EventSource stayed in CONNECTING, then errored and reconnected, and
      // the bell spent its life in that loop instead of listening. This
      // comment line is ignored by the EventSource parser and exists purely
      // to open the connection now.
      controller.enqueue(encoder.encode(": connected\n\n"));

      unsubscribe = subscribeToUser(userId, send);

      // Keeps the connection alive through browsers/proxies that would
      // otherwise time out an idle response.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, HEARTBEAT_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
