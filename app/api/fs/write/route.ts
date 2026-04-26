/**
 * POST /api/fs/write   { path, content }
 *
 * Atomic write: writes to <path>.tmp.<rand>, then renames over <path>.
 * Before overwriting, copies the existing file to
 *   <superrepoRoot>/.3-surgeons/file-backups/<sha>/<filename>
 * so we can restore. <sha> = sha256(absolute path) first 16 chars.
 *
 * Path must resolve inside the superrepo or simulator-core.
 */
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

import { resolveSafePath, superrepoRoot, withTimeout } from '@/lib/api/fs/safety';
import { append as logAppend } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;
const MAX_WRITE_BYTES = 5 * 1024 * 1024; // 5 MB — same envelope as read.

interface WriteBody {
  path?: unknown;
  content?: unknown;
}

function backupDirFor(absolute: string): string {
  const sha = crypto.createHash('sha256').update(absolute).digest('hex').slice(0, 16);
  return path.join(superrepoRoot(), '.3-surgeons', 'file-backups', sha);
}

async function backupExisting(absolute: string): Promise<string | null> {
  try {
    await fs.access(absolute);
  } catch {
    return null; // nothing to back up — first write.
  }
  const dir = backupDirFor(absolute);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${stamp}__${path.basename(absolute)}`);
  await fs.copyFile(absolute, dest);
  return dest;
}

export async function POST(req: NextRequest) {
  let body: WriteBody;
  try {
    body = (await req.json()) as WriteBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'content must be a string' },
      { status: 400 },
    );
  }

  const bytes = Buffer.byteLength(body.content, 'utf-8');
  if (bytes > MAX_WRITE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `content too large: ${bytes} bytes (max ${MAX_WRITE_BYTES})` },
      { status: 413 },
    );
  }

  const resolved = resolveSafePath(typeof body.path === 'string' ? body.path : null);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 403 });
  }

  // Refuse to overwrite a directory. (.3-surgeons/file-backups itself lives
  // under the superrepo root and is allowed to be created.)
  try {
    const st = await fs.stat(resolved.absolute);
    if (st.isDirectory()) {
      return NextResponse.json(
        { ok: false, error: 'path is a directory', path: resolved.absolute },
        { status: 400 },
      );
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      return NextResponse.json(
        { ok: false, error: (err as Error).message, path: resolved.absolute },
        { status: 500 },
      );
    }
    // ENOENT is fine — we're creating the file.
  }

  // Ensure parent directory exists.
  try {
    await fs.mkdir(path.dirname(resolved.absolute), { recursive: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `mkdir parent failed: ${(err as Error).message}`,
        path: resolved.absolute,
      },
      { status: 500 },
    );
  }

  let backupPath: string | null = null;
  try {
    backupPath = await withTimeout(
      backupExisting(resolved.absolute),
      TIMEOUT_MS,
      'backup',
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `backup failed: ${(err as Error).message}`,
        path: resolved.absolute,
      },
      { status: 500 },
    );
  }

  // Atomic write: tmp file in same directory, then rename.
  const tmpSuffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = `${resolved.absolute}.tmp.${tmpSuffix}`;
  try {
    await withTimeout(
      fs.writeFile(tmpPath, body.content, { encoding: 'utf-8' }),
      TIMEOUT_MS,
      'writeFile',
    );
    await withTimeout(
      fs.rename(tmpPath, resolved.absolute),
      TIMEOUT_MS,
      'rename',
    );
  } catch (err) {
    // Best-effort tmp cleanup. Failure to clean is non-fatal but logged via
    // the error response so we don't silently leak tmp files.
    let cleanupNote = '';
    try { await fs.unlink(tmpPath); } catch (e) {
      cleanupNote = ` (tmp cleanup failed: ${(e as Error).message})`;
    }
    try { logAppend({ ts: Date.now(), level: 'error', source: 'fs/write', msg: `write failed: ${(err as Error).message}`, detail: ((err as Error).stack || '').slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json(
      {
        ok: false,
        error: `write failed: ${(err as Error).message}${cleanupNote}`,
        path: resolved.absolute,
        backup: backupPath,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    path: resolved.absolute,
    bytes,
    backup: backupPath,
  });
}
