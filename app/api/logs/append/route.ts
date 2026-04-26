/**
 * POST /api/logs/append
 *
 * Body: { level: 'info'|'warn'|'error', source: string, msg: string, detail?: any }
 *
 * Lets the frontend (or any caller in the same process) push a log entry
 * into the in-memory ring buffer. Validates shape; never throws on bad
 * input — returns 400 instead so the UI doesn't crash on a bad payload.
 */
import { NextRequest, NextResponse } from 'next/server';

import { append, type LogLevel } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

interface AppendBody {
  level?: unknown;
  source?: unknown;
  msg?: unknown;
  detail?: unknown;
}

function isLevel(v: unknown): v is LogLevel {
  return v === 'info' || v === 'warn' || v === 'error';
}

export async function POST(req: NextRequest) {
  let body: AppendBody;
  try {
    body = (await req.json()) as AppendBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (!isLevel(body.level)) {
    return NextResponse.json(
      { ok: false, error: "level must be 'info' | 'warn' | 'error'" },
      { status: 400 },
    );
  }
  if (typeof body.source !== 'string' || body.source.trim() === '') {
    return NextResponse.json(
      { ok: false, error: 'source (string) is required' },
      { status: 400 },
    );
  }
  if (typeof body.msg !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'msg (string) is required' },
      { status: 400 },
    );
  }

  append({
    ts: Date.now(),
    level: body.level,
    source: body.source,
    msg: body.msg,
    detail: body.detail,
  });

  return NextResponse.json({ ok: true });
}
