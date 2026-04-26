/**
 * GET /api/fs/list?path=<absolute|relative>&depth=1&hidden=false
 *
 * Returns directory entries for the IDE file tree. Defaults to the superrepo
 * root resolved via lib/api/fs/safety#superrepoRoot. Hard caps:
 *   - 5s timeout (slow disk shouldn't pin the route)
 *   - 1000 entries (paginated by truncated:true)
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

import {
  HIDDEN_DIRS,
  resolveSafePath,
  superrepoRoot,
  withTimeout,
} from '@/lib/api/fs/safety';
import { append as logAppend } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;
const MAX_ENTRIES = 1000;

interface Entry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  modified?: number;
}

async function readDirEntries(absolute: string, includeHidden: boolean): Promise<{
  entries: Entry[];
  truncated: boolean;
}> {
  const dirents = await fs.readdir(absolute, { withFileTypes: true });
  const filtered = includeHidden
    ? dirents
    : dirents.filter((d) => !HIDDEN_DIRS.has(d.name) && !d.name.startsWith('.'));

  const truncated = filtered.length > MAX_ENTRIES;
  const slice = truncated ? filtered.slice(0, MAX_ENTRIES) : filtered;

  const entries: Entry[] = await Promise.all(
    slice.map(async (d): Promise<Entry> => {
      const full = path.join(absolute, d.name);
      const isDir = d.isDirectory();
      try {
        const st = await fs.stat(full);
        return {
          name: d.name,
          type: isDir ? 'dir' : 'file',
          size: isDir ? undefined : st.size,
          modified: st.mtimeMs,
        };
      } catch {
        // Broken symlink / permission denied — still surface the name so the
        // tree doesn't silently drop it. Zero Silent Failures.
        return { name: d.name, type: isDir ? 'dir' : 'file' };
      }
    }),
  );

  // Sort: dirs first, then alpha.
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { entries, truncated };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get('path') ?? superrepoRoot();
  const includeHidden = searchParams.get('hidden') === 'true';

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

  if (!stat.isDirectory()) {
    return NextResponse.json(
      { ok: false, error: 'path is not a directory', path: resolved.absolute },
      { status: 400 },
    );
  }

  try {
    const { entries, truncated } = await withTimeout(
      readDirEntries(resolved.absolute, includeHidden),
      TIMEOUT_MS,
      'readdir',
    );
    return NextResponse.json({
      ok: true,
      path: resolved.absolute,
      entries,
      truncated,
    });
  } catch (err) {
    try { logAppend({ ts: Date.now(), level: 'error', source: 'fs/list', msg: (err as Error).message, detail: ((err as Error).stack || '').slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json(
      { ok: false, error: (err as Error).message, path: resolved.absolute },
      { status: 500 },
    );
  }
}
