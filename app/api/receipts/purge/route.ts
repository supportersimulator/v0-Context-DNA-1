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

export const dynamic = 'force-dynamic';

function receiptsPath(projectDir: string): string {
  return path.join(projectDir, '.3-surgeons', 'receipts', 'cross-runs.jsonl');
}

function defaultProjectDir(): string {
  const start = process.cwd();
  let dir = start;
  for (let i = 0; i < 6; i++) {
    try {
      const fsSync = require('fs') as typeof import('fs');
      if (fsSync.existsSync(path.join(dir, '.3-surgeons'))) return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(start);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectDir = searchParams.get('project_dir') || defaultProjectDir();
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
    return NextResponse.json(
      { ok: false, error: `truncate failed: ${(err as Error).message}`, file },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, purged, file });
}
