/**
 * POST /api/terminal/kill
 *
 * Body: { sessionId: string }
 * Resp: { ok: true, killed: boolean } | { ok: false, error }
 *
 * SIGTERM the spawned proc. The session is removed from the registry once
 * the process emits its 'close' event (see sessions.ts markClosed eviction).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/terminal/sessions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface KillBody {
  sessionId?: unknown;
}

export async function POST(req: NextRequest) {
  let body: KillBody;
  try {
    body = (await req.json()) as KillBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.sessionId !== 'string' || !body.sessionId) {
    return NextResponse.json(
      { ok: false, error: 'sessionId required' },
      { status: 400 },
    );
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'session not found (already exited or unknown id)' },
      { status: 404 },
    );
  }

  if (session.closed) {
    return NextResponse.json({ ok: true, killed: false, alreadyClosed: true });
  }

  try {
    const killed = session.proc.kill('SIGTERM');
    return NextResponse.json({ ok: true, killed });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `kill failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
