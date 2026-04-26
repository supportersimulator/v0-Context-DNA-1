/**
 * IDE Settings — Backend Persistence
 *
 * GET  /api/settings → returns the workspace-level settings JSON
 *                      (or {} when the file doesn't exist yet).
 * POST /api/settings → atomically writes the workspace-level settings JSON.
 *                      Body: { settings: Partial<IDESettings> }.
 *
 * Today's settings panel persists to localStorage only. That's fine for a
 * single-machine session but loses everything on reinstall and doesn't travel
 * with a workspace switch (e.g., between superrepo and a fresh checkout).
 *
 * The IDE writes to `<superrepoRoot>/.3-surgeons/ide-settings.json` so the
 * file co-locates with the rest of our IDE workspace state. Path safety is
 * enforced via `lib/api/fs/safety.ts` even though we only ever touch one
 * known path — keeps the audit pattern uniform across every fs/* route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

import { resolveSafePath, superrepoRoot, withTimeout } from '@/lib/api/fs/safety';
import { append as logAppend } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 5000;
const MAX_WRITE_BYTES = 256 * 1024; // 256 KiB — settings should never approach this.

interface SettingsBody {
  settings?: unknown;
}

function settingsPath(): string {
  return path.join(superrepoRoot(), '.3-surgeons', 'ide-settings.json');
}

// ---------------------------------------------------------------------------
// GET — returns current settings (or {} when absent / unreadable).
// Soft-fails: returns 200 with `{ ok: true, settings: {} }` rather than 500
// so the IDE never blocks rendering on a missing file.
// ---------------------------------------------------------------------------

export async function GET() {
  const target = settingsPath();
  // Defence-in-depth: even though we computed the path from a constant, run it
  // through the safety helper so any future refactor that derives the path
  // from user input still gets allowlisted.
  const resolved = resolveSafePath(target);
  if (!resolved.ok) {
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'settings/GET',
        msg: 'settings path escaped allowed roots',
        detail: resolved.error,
      });
    } catch {
      /* noop */
    }
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 500 });
  }

  try {
    const raw = await withTimeout(fs.readFile(resolved.absolute, 'utf-8'), TIMEOUT_MS, 'readFile');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      try {
        logAppend({
          ts: Date.now(),
          level: 'warn',
          source: 'settings/GET',
          msg: 'corrupt settings file — returning defaults',
          detail: ((err as Error)?.message ?? String(err)).slice(0, 200),
        });
      } catch {
        /* noop */
      }
      return NextResponse.json({ ok: true, settings: {}, corrupted: true });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ ok: true, settings: {} });
    }
    return NextResponse.json({ ok: true, settings: parsed, path: resolved.absolute });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return NextResponse.json({ ok: true, settings: {}, path: resolved.absolute });
    }
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'settings/GET',
        msg: `read failed: ${(err as Error)?.message ?? String(err)}`,
        detail: ((err as Error)?.stack ?? '').slice(0, 500),
      });
    } catch {
      /* noop */
    }
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message ?? 'read failed' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — atomically writes settings via tmp + rename. Same envelope as
// /api/fs/write so the path-safety + audit story stays uniform.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: SettingsBody;
  try {
    body = (await req.json()) as SettingsBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
    return NextResponse.json(
      { ok: false, error: '`settings` must be a plain object' },
      { status: 400 },
    );
  }

  const target = settingsPath();
  const resolved = resolveSafePath(target);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: 403 });
  }

  let payload: string;
  try {
    payload = JSON.stringify(body.settings, null, 2);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `serialise failed: ${(err as Error)?.message ?? 'unknown'}` },
      { status: 400 },
    );
  }

  const bytes = Buffer.byteLength(payload, 'utf-8');
  if (bytes > MAX_WRITE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `payload too large: ${bytes} bytes (max ${MAX_WRITE_BYTES})` },
      { status: 413 },
    );
  }

  // Ensure parent dir.
  try {
    await fs.mkdir(path.dirname(resolved.absolute), { recursive: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `mkdir parent failed: ${(err as Error)?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const tmpSuffix = crypto.randomBytes(6).toString('hex');
  const tmpPath = `${resolved.absolute}.tmp.${tmpSuffix}`;
  try {
    await withTimeout(
      fs.writeFile(tmpPath, payload, { encoding: 'utf-8' }),
      TIMEOUT_MS,
      'writeFile',
    );
    await withTimeout(fs.rename(tmpPath, resolved.absolute), TIMEOUT_MS, 'rename');
  } catch (err) {
    // Tmp cleanup is best-effort — we surface failures in the error body so
    // the IDE doesn't silently leak partial files.
    let cleanupNote = '';
    try {
      await fs.unlink(tmpPath);
    } catch (e) {
      cleanupNote = ` (tmp cleanup failed: ${(e as Error)?.message ?? 'unknown'})`;
    }
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'settings/POST',
        msg: `settings write failed: ${(err as Error)?.message ?? String(err)}`,
        detail: ((err as Error)?.stack ?? '').slice(0, 500),
      });
    } catch {
      /* noop */
    }
    return NextResponse.json(
      {
        ok: false,
        error: `write failed: ${(err as Error)?.message ?? String(err)}${cleanupNote}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, path: resolved.absolute, bytes });
}
