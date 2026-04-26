/**
 * GET /api/terminal/stream/[sessionId]
 *
 * Returns text/event-stream of process output. Each event:
 *   data: {"stream":"stdout","chunk":"..."}
 *   data: {"stream":"stderr","chunk":"..."}
 *   data: {"event":"close","code":N}
 *
 * Why SSE (not WebSocket):
 *   Next.js app router doesn't support upgrade-protocol WS handlers; SSE
 *   rides on a regular streaming Response and works in dev + prod + Vercel.
 *
 * Lifecycle:
 *   - On subscribe, we replay the pre-stream buffer so chunks emitted
 *     between exec POST and EventSource open aren't lost.
 *   - On client disconnect (req.signal abort), we remove the listener.
 *     The child proc is NOT killed here — kill is explicit via /kill.
 *   - On proc close, we emit one close event and end the stream.
 */

import type { NextRequest } from 'next/server';
import { getSession, type SessionListener } from '@/lib/terminal/sessions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { sessionId } = await params;
  const session = getSession(sessionId);
  if (!session) {
    return new Response(`data: ${JSON.stringify({ event: 'not_found' })}\n\n`, {
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

      // Replay pre-stream buffer so the client sees chunks emitted between
      // exec response landing and EventSource attaching.
      for (const chunk of session.buffer) {
        safeEnqueue(sseLine(chunk));
      }

      // If proc already closed, emit close event immediately and end.
      if (session.closed && session.closeEvent) {
        safeEnqueue(sseLine({ event: 'close', code: session.closeEvent.code }));
        safeClose();
        return;
      }

      const listener: SessionListener = (evt) => {
        if (evt.type === 'chunk') {
          safeEnqueue(sseLine(evt.data));
        } else {
          safeEnqueue(sseLine({ event: 'close', code: evt.data.code }));
          session.listeners.delete(listener);
          safeClose();
        }
      };
      session.listeners.add(listener);

      // Client-disconnect cleanup. Don't kill the proc — that's explicit
      // via POST /api/terminal/kill. Just stop streaming to this client.
      const onAbort = () => {
        session.listeners.delete(listener);
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
