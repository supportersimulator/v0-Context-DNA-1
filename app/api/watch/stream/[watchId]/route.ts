/**
 * GET /api/watch/stream/[watchId]
 *
 * SSE stream of chokidar events for a registered watcher.
 * Each event:
 *   data: {"event":"change|add|unlink|addDir|unlinkDir","path":"...","ts":1729...}
 *
 * Lifecycle:
 *   - On subscribe, attach a listener to the registry entry.
 *   - On client disconnect (req.signal.abort), detach the listener.
 *     The watcher itself is NOT closed here — close is explicit via /stop.
 *   - If the watchId is unknown (already stopped, or never existed) we
 *     respond 404 with a single not_found event so EventSource doesn't
 *     loop-reconnect against a dead id.
 *
 * Mirrors the pattern in app/api/terminal/stream/[sessionId]/route.ts so the
 * client-side EventSource glue is identical.
 */
import type { NextRequest } from 'next/server';
import { getWatch, type WatchListener } from '@/lib/api/watch/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ watchId: string }>;
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { watchId } = await params;
  const entry = getWatch(watchId);
  if (!entry) {
    return new Response(sseLine({ event: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true;
        }
      };
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Hello frame — lets the client confirm the subscription is live without
      // having to wait for the first file change. Also keeps proxies happy.
      safeEnqueue(
        sseLine({
          event: 'subscribed',
          watchId,
          watching: entry.watching,
          debounceMs: entry.debounceMs,
          ts: Date.now(),
        }),
      );

      const listener: WatchListener = (evt) => safeEnqueue(sseLine(evt));
      entry.listeners.add(listener);

      // Client-disconnect cleanup. Detach the listener but do NOT close the
      // chokidar watcher — other clients may still be subscribed, and /stop
      // owns watcher lifecycle.
      const onAbort = () => {
        entry.listeners.delete(listener);
        safeClose();
      };
      if (req.signal.aborted) {
        onAbort();
      } else {
        req.signal.addEventListener('abort', onAbort, { once: true });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
