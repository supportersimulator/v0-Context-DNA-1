/**
 * GET /api/logs?since=<ms>&level=<info|warn|error>&limit=<n>
 *
 * Returns the in-memory ring buffer slice plus a `cursor` (newest ts) the
 * client uses for the next poll. Polling-friendly — no streaming.
 */
import { NextRequest, NextResponse } from 'next/server';

import { read, type LogLevel } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function parseLevel(raw: string | null): LogLevel | undefined {
  if (raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return undefined;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const sinceRaw = searchParams.get('since');
  const since = sinceRaw != null && sinceRaw !== '' ? Number(sinceRaw) : undefined;
  const safeSince = typeof since === 'number' && Number.isFinite(since) ? since : undefined;

  const level = parseLevel(searchParams.get('level'));

  const limitRaw = parseInt(searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_LIMIT)
    : DEFAULT_LIMIT;

  const logs = read({ since: safeSince, level, limit });
  const cursor = logs.length > 0 ? logs[logs.length - 1].ts : (safeSince ?? 0);

  return NextResponse.json({ logs, cursor });
}
