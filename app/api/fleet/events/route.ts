/**
 * Fleet SSE Proxy — streams `text/event-stream` from the fleet daemon
 * to the browser.
 *
 *   GET /api/fleet/events            -> all kinds (no filter)
 *   GET /api/fleet/events?kinds=...  -> forwarded as-is
 *
 * Daemon endpoint: http://127.0.0.1:8855/events/stream
 *
 * Implementation notes:
 * - Runs in Node.js runtime (the Edge runtime cannot proxy a long-lived
 *   undici body stream cleanly with abort propagation).
 * - We pass the upstream body through ReadableStream so backpressure
 *   propagates and disconnect tears the upstream fetch down via AbortSignal.
 * - On daemon-down, returns 503 with a JSON body so the hook can show an
 *   "offline" state instead of throwing.
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAEMON_BASE = process.env.FLEET_DAEMON_URL ?? 'http://127.0.0.1:8855';

export async function GET(req: NextRequest) {
  const upstreamUrl = new URL('/events/stream', DAEMON_BASE);
  const kinds = req.nextUrl.searchParams.get('kinds');
  if (kinds) upstreamUrl.searchParams.set('kinds', kinds);

  const upstreamCtl = new AbortController();
  // Tear down upstream when the browser disconnects.
  req.signal.addEventListener('abort', () => {
    try { upstreamCtl.abort(); } catch { /* noop */ }
  });

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: upstreamCtl.signal,
      cache: 'no-store',
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: 'fleet daemon unreachable', details: String(err) }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return new Response(
      JSON.stringify({ ok: false, error: 'sse upstream rejected', status: upstream.status, body: text.slice(0, 300) }),
      { status: upstream.status === 503 ? 503 : 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
