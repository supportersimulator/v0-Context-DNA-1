/**
 * Benchmark Leaderboard API
 *
 * GET /api/benchmark/leaderboard?hardware_class=apple_silicon_32gb&model=all&limit=50
 * Returns community leaderboard entries.
 * Currently returns a stub — community backend not yet implemented.
 */

import { NextRequest, NextResponse } from 'next/server';

const HELPER_API = process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hardwareClass = searchParams.get('hardware_class');
  const model = searchParams.get('model');
  const limit = searchParams.get('limit') || '50';

  const params = new URLSearchParams({ limit });
  if (hardwareClass) params.set('hardware_class', hardwareClass);
  if (model) params.set('model', model);

  try {
    const res = await fetch(`${HELPER_API}/api/benchmark/leaderboard?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ entries: [], source: 'stub' });
    }
    return NextResponse.json(await res.json());
  } catch {
    // Community backend not yet live — empty leaderboard
    return NextResponse.json({ entries: [], source: 'stub' });
  }
}
