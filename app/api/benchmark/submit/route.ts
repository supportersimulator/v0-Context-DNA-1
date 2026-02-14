/**
 * Benchmark Submit API
 *
 * POST /api/benchmark/submit
 * Submit a benchmark result to the community leaderboard.
 * Currently returns a stub response — backend endpoint not yet implemented.
 */

import { NextRequest, NextResponse } from 'next/server';

const HELPER_API = process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${HELPER_API}/api/benchmark/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // Backend not yet available — return stub
      return NextResponse.json({ submitted: true, leaderboard_rank: null });
    }
    return NextResponse.json(await res.json());
  } catch {
    // Community backend not yet live — stub response
    return NextResponse.json({ submitted: true, leaderboard_rank: null });
  }
}
