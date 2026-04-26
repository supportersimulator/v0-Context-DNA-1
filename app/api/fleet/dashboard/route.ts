/**
 * Fleet Theatrical Dashboard Proxy
 *
 * GET /api/fleet/dashboard
 * Proxies to local Multi-Fleet daemon at http://127.0.0.1:8855/dashboard/data.
 * Daemon returns { timestamp, components: { vital_signs, surgeon_feed,
 *   fleet_constellation, evidence_timeline, quorum_pulse, memory_heat_map,
 *   probe_grid, corrigibility_gauge, gold_stream } }.
 *
 * Surgeon Theater + Corrigibility Gauge IDE panels consume this until the
 * fleet daemon's SSE multiplex (`/events/stream`, parallel agent) lands.
 *
 * On daemon-down, returns HTTP 200 with { ok: false, error, details } so
 * the UI renders an offline state instead of cascading 500s.
 */

import { NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';

const FLEET_DAEMON_URL = 'http://127.0.0.1:8855/dashboard/data';
const TIMEOUT_MS = 4000;

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
        error: 'fleet daemon dashboard unreachable',
        details: `HTTP ${response.status}`,
      });
    }

    const data = (await response.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    clearTimeout(timer);
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'fleet/dashboard',
        msg: 'fleet daemon dashboard unreachable',
        detail: ((error as Error)?.stack || String(error)).slice(0, 500),
      });
    } catch {
      /* noop */
    }
    return NextResponse.json({
      ok: false,
      error: 'fleet daemon dashboard unreachable',
      details: String(error),
    });
  }
}
