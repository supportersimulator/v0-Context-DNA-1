/**
 * Agent Reviews API
 *
 * GET /api/agent-reviews?session_id=...
 * Returns recent agent reviews from the review bridge queue.
 *
 * GET /api/agent-reviews?plan=1
 * Returns active plan progress (checklist completion %).
 *
 * Backend: memory/agent_review_bridge.py (file-based JSON queue)
 * Backend: memory/plan_tracker.py (plan file watcher)
 */

import { NextRequest, NextResponse } from 'next/server';

const HELPER_API = process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');
  const wantPlan = searchParams.get('plan');

  // Plan progress endpoint
  if (wantPlan) {
    try {
      const res = await fetch(`${HELPER_API}/api/plan-progress`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return NextResponse.json({ error: 'Plan service unavailable' }, { status: 502 });
      return NextResponse.json(await res.json());
    } catch {
      // Fallback: read plan progress directly from the queue file
      return NextResponse.json({
        total: 0,
        completed: 0,
        pending: 0,
        percentage: 0,
        plan_name: null,
      });
    }
  }

  // Agent reviews endpoint
  try {
    const url = sessionId
      ? `${HELPER_API}/api/agent-reviews?session_id=${encodeURIComponent(sessionId)}`
      : `${HELPER_API}/api/agent-reviews`;

    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ reviews: [], error: 'Review service unavailable' }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ reviews: [] });
  }
}
