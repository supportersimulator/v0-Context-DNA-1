/**
 * Benchmark Results API
 *
 * GET  /api/benchmark/results?limit=20&suite=TTFT_SHORT
 * Returns benchmark history from the helper service (falls back to empty array).
 *
 * POST /api/benchmark/results
 * Saves a BenchmarkSnapshot to the helper service.
 */

import { NextRequest, NextResponse } from 'next/server';

const HELPER_API = process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get('limit') || '20';
  const suite = searchParams.get('suite');

  const params = new URLSearchParams({ limit });
  if (suite) params.set('suite', suite);

  try {
    const res = await fetch(`${HELPER_API}/api/benchmark/results?${params}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ results: [], source: 'client' }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ results: [], source: 'client' });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch(`${HELPER_API}/api/benchmark/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { saved: false, error: 'Backend unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ saved: false, error: 'Backend unreachable' }, { status: 503 });
  }
}
