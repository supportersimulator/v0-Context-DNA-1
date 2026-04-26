/**
 * 3-Surgeons Receipts — Purge endpoint
 *
 * POST /api/receipts/purge?project_dir=<path>
 *
 * Truncates <project_dir>/.3-surgeons/receipts/cross-runs.jsonl in place
 * (file is kept; contents zeroed). Mirrors three_surgeons.receipts.store
 * .purge_receipts(): returns the count of entries removed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

import { append as logAppend } from '@/lib/log/buffer';
import { resolveSafePath, superrepoRoot } from '@/lib/api/fs/safety';

export const dynamic = 'force-dynamic';

function receiptsPath(projectDir: string): string {
  return path.join(projectDir, '.3-surgeons', 'receipts', 'cross-runs.jsonl');
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawProjectDir = searchParams.get('project_dir');
  const projectDir = rawProjectDir
    ? (() => {
        const safe = resolveSafePath(rawProjectDir);
        return safe.ok ? safe.absolute : null;
      })()
    : superrepoRoot();
  if (!projectDir) {
    return NextResponse.json({ ok: false, error: 'project_dir escapes allowed roots' }, { status: 403 });
  }
  const file = receiptsPath(projectDir);

  let text: string;
  try {
    text = await fs.readFile(file, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return NextResponse.json({ ok: true, purged: 0, file });
    }
    return NextResponse.json(
      { ok: false, error: `read failed: ${(err as Error).message}`, file },
      { status: 500 },
    );
  }

  const purged = text.split('\n').reduce((n, line) => (line.trim() ? n + 1 : n), 0);

  try {
    await fs.writeFile(file, '', 'utf-8');
  } catch (err) {
    try { logAppend({ ts: Date.now(), level: 'error', source: 'receipts/purge', msg: `truncate failed: ${(err as Error).message}`, detail: ((err as Error).stack || '').slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json(
      { ok: false, error: `truncate failed: ${(err as Error).message}`, file },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, purged, file });
}
