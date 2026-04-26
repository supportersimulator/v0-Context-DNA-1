/**
 * POST /api/watch/stop
 *
 * Body: { watchId: string }
 * Resp: { ok: true, stopped: boolean }
 *     | { ok: false, error }
 *
 * Closes the chokidar watcher and removes it from the registry. Idempotent —
 * calling /stop twice on the same id returns ok:true with stopped:false on
 * the second call so the client can fire-and-forget on unmount without
 * special-casing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { removeWatch } from '@/lib/api/watch/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface StopBody {
  watchId?: unknown;
}

export async function POST(req: NextRequest) {
  let body: StopBody;
  try {
    body = (await req.json()) as StopBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.watchId !== 'string' || !body.watchId) {
    return NextResponse.json(
      { ok: false, error: 'watchId must be a non-empty string' },
      { status: 400 },
    );
  }

  const stopped = await removeWatch(body.watchId);
  return NextResponse.json({ ok: true, stopped });
}
