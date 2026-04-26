/**
 * POST /api/logs/clear — drops all entries in the in-memory log ring.
 */
import { NextResponse } from 'next/server';

import { clear } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

export async function POST() {
  clear();
  return NextResponse.json({ ok: true });
}
