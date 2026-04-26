/**
 * GET /api/build/status
 *
 * Reports the most recent /api/build/run invocation's state.
 *
 * Returns:
 *   - When no build has been run this process: { ok: true, running: false }
 *   - While a build is in flight: { ok, running: true, target, started_at, pid }
 *   - After a build finishes: { ok, running: false, target, started_at,
 *                               finished_at, exit_code, pid }
 *
 * State is module-level (per Node process). It does not survive a server
 * restart and there is no persistence.
 */
import { NextResponse } from 'next/server';
import { getBuildState } from '@/lib/api/build/state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = getBuildState();
  if (!state) {
    return NextResponse.json({ ok: true, running: false });
  }
  return NextResponse.json({ ok: true, ...state });
}
