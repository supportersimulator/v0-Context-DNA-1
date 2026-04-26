/**
 * Fleet Daemon Health Proxy
 *
 * GET /api/fleet/health
 * Proxies to local Multi-Fleet daemon at http://127.0.0.1:8855/health.
 * Returns the daemon JSON as-is on success.
 * On daemon-down, returns HTTP 200 with { ok: false, error, details }
 * so the UI can render an "offline" state without a 500 cascade.
 */

import { NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';

const FLEET_DAEMON_URL = 'http://127.0.0.1:8855/health';
const TIMEOUT_MS = 3000;

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(FLEET_DAEMON_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timer);

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: 'fleet daemon unreachable',
        details: `HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    clearTimeout(timer);
    try { logAppend({ ts: Date.now(), level: 'error', source: 'fleet/health', msg: 'fleet daemon unreachable', detail: ((error as Error)?.stack || String(error)).slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json({
      ok: false,
      error: 'fleet daemon unreachable',
      details: String(error),
    });
  }
}
