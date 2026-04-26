/**
 * ER Simulator Status Probe
 *
 * GET /api/er-sim/status
 *
 * Probes the Expo web dev server (default http://localhost:8081) to determine
 * whether the ER Simulator is currently running. Returns a graceful HTTP 200
 * with `{ ok: false, reachable: false, ... }` when the dev server is offline,
 * so callers can render an "ER Sim stopped" state without throwing.
 *
 * Why this exists:
 *   - The IDE has a Launch button (`/api/er-sim/launch`) that detaches a child
 *     process. Once spawned, the IDE has no idea whether the simulator is still
 *     alive — users see "Launched (PID 12345)" forever, even after they kill it.
 *   - Cross-product visibility (5-product wiring plan, Wire 4: "fleet status,
 *     peer health … visible from one place") requires every product surface to
 *     expose a health endpoint the IDE can poll.
 *   - The status pill in the IDE status bar consumes this endpoint at 5s cadence.
 *
 * Security:
 *   - Read-only HEAD/GET against a localhost-only address. No user input.
 *   - 1.5s timeout via AbortController so the IDE never blocks on a hung port.
 */

import { NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';

const ER_SIM_URL =
  process.env.ER_SIM_URL || 'http://localhost:8081';
const TIMEOUT_MS = 1500;

export interface ErSimStatusResponse {
  ok: boolean;
  reachable: boolean;
  url: string;
  http_status?: number;
  latency_ms?: number;
  error?: string;
  checked_at: number;
}

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    // Expo dev server returns 200 on root with HTML. We don't need the body —
    // a successful TCP+HTTP response is enough to declare "reachable".
    const response = await fetch(ER_SIM_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      // Don't follow redirects — keep the probe cheap.
      redirect: 'manual',
    });
    clearTimeout(timer);

    const body: ErSimStatusResponse = {
      ok: response.ok || (response.status >= 300 && response.status < 400),
      reachable: true,
      url: ER_SIM_URL,
      http_status: response.status,
      latency_ms: Date.now() - start,
      checked_at: Date.now(),
    };
    return NextResponse.json(body);
  } catch (error) {
    clearTimeout(timer);
    const message = error instanceof Error ? error.message : String(error);
    // Expected when the simulator isn't running. Logged at info level so it
    // doesn't pollute the error tab in the log viewer.
    try {
      logAppend({
        ts: Date.now(),
        level: 'info',
        source: 'er-sim/status',
        msg: 'ER Sim probe failed (likely stopped)',
        detail: message.slice(0, 200),
      });
    } catch {
      /* noop */
    }
    const body: ErSimStatusResponse = {
      ok: false,
      reachable: false,
      url: ER_SIM_URL,
      error: message,
      checked_at: Date.now(),
    };
    return NextResponse.json(body);
  }
}
