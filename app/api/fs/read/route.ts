/**
 * GET /api/fs/read?path=<absolute|relative-to-superrepo>
 *
 * Returns a UTF-8 text file. Caps:
 *   - 5s timeout
 *   - 5 MB max file size (rejected with 413 if larger)
 * Path must resolve inside the superrepo or simulator-core.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';

import { resolveSafePath, withTimeout } from '@/lib/api/fs/safety';
import { append as logAppend } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path');

  const resolved = resolveSafePath(rawPath);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 403 });
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await withTimeout(fs.stat(resolved.absolute), TIMEOUT_MS, 'stat');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === 'ENOENT' ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: (err as Error).message, path: resolved.absolute },
      { status },
    );
  }

  if (!stat.isFile()) {
    return NextResponse.json(
      { ok: false, error: 'path is not a regular file', path: resolved.absolute },
      { status: 400 },
    );
  }

  if (stat.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `file too large: ${stat.size} bytes (max ${MAX_FILE_BYTES})`,
        path: resolved.absolute,
        size: stat.size,
      },
      { status: 413 },
    );
  }

  try {
    const content = await withTimeout(
      fs.readFile(resolved.absolute, 'utf-8'),
      TIMEOUT_MS,
      'readFile',
    );
    return NextResponse.json({
      ok: true,
      path: resolved.absolute,
      content,
      encoding: 'utf-8',
      size: stat.size,
    });
  } catch (err) {
    try { logAppend({ ts: Date.now(), level: 'error', source: 'fs/read', msg: (err as Error).message, detail: ((err as Error).stack || '').slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json(
      { ok: false, error: (err as Error).message, path: resolved.absolute },
      { status: 500 },
    );
  }
}
