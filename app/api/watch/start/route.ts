/**
 * POST /api/watch/start
 *
 * Body: { paths: string[], debounce_ms?: number }
 * Resp: { ok: true, watchId, watching: string[], debounceMs }
 *     | { ok: false, error }
 *
 * Spawns a chokidar watcher over the requested paths and registers it in the
 * shared registry (lib/api/watch/registry.ts). The watcher runs until the
 * matching POST /api/watch/stop is received or the process exits.
 *
 * SECURITY:
 *   Each path is resolved via lib/api/fs/safety.ts; any path that escapes the
 *   allowed roots is rejected up-front. We do NOT silently drop bad paths —
 *   one bad path fails the whole call so the caller sees the typo.
 *
 * RESOURCE GUARD:
 *   Hard cap of MAX_WATCHERS active watchers per process. A misbehaving client
 *   that calls /start in a loop would otherwise leak file descriptors and
 *   eventually exhaust EMFILE.
 *
 * CHOKIDAR CONFIG (load-bearing — see registry.ts):
 *   usePolling: false  — fsevents on macOS, inotify on Linux. Polling is a
 *                        fallback for network mounts and we don't want it.
 *   ignored: node_modules / .next / dist / .git / .venv  — Aaron's repo has
 *                        thousands of files in those; watching them would
 *                        fire events constantly during builds.
 *   ignoreInitial: true — we only care about future events, not the directory
 *                        listing at watcher start.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import chokidar from 'chokidar';

import { resolveSafePath } from '@/lib/api/fs/safety';
import {
  MAX_WATCHERS,
  activeCount,
  emit,
  registerWatch,
  type WatchEntry,
  type WatchEventType,
} from '@/lib/api/watch/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_DEBOUNCE_MS = 200;
const MIN_DEBOUNCE_MS = 0;
const MAX_DEBOUNCE_MS = 10_000;

const IGNORED = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/.git/**',
  '**/.venv/**',
];

interface StartBody {
  paths?: unknown;
  debounce_ms?: unknown;
}

export async function POST(req: NextRequest) {
  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'paths must be a non-empty string[]' },
      { status: 400 },
    );
  }

  // Resolve every path against the safety helper. Reject the whole call on
  // the first bad path — surfacing a typo is better than silently dropping it.
  const resolved: string[] = [];
  for (const p of body.paths) {
    if (typeof p !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'every paths[] entry must be a string' },
        { status: 400 },
      );
    }
    const r = resolveSafePath(p);
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `path rejected (${p}): ${r.error}` },
        { status: 403 },
      );
    }
    resolved.push(r.absolute);
  }

  // Debounce validation — clamp into [MIN, MAX] but reject NaN / non-number.
  let debounceMs = DEFAULT_DEBOUNCE_MS;
  if (body.debounce_ms !== undefined) {
    if (typeof body.debounce_ms !== 'number' || !Number.isFinite(body.debounce_ms)) {
      return NextResponse.json(
        { ok: false, error: 'debounce_ms must be a finite number' },
        { status: 400 },
      );
    }
    debounceMs = Math.max(MIN_DEBOUNCE_MS, Math.min(MAX_DEBOUNCE_MS, body.debounce_ms));
  }

  // Hard cap — reject the (cap+1)th watcher with a helpful message so the
  // caller knows to stop one before opening another.
  if (activeCount() >= MAX_WATCHERS) {
    return NextResponse.json(
      {
        ok: false,
        error: `watcher cap reached (${MAX_WATCHERS} active). Stop an existing watcher first via POST /api/watch/stop.`,
      },
      { status: 429 },
    );
  }

  const watchId = randomUUID();

  let watcher;
  try {
    watcher = chokidar.watch(resolved, {
      usePolling: false,
      ignored: IGNORED,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        // Editors often write atomically (tmp + rename). awaitWriteFinish
        // collapses the burst into a single 'change' once the file has been
        // stable for stabilityThreshold ms.
        stabilityThreshold: 50,
        pollInterval: 25,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `chokidar.watch failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const entry: WatchEntry = {
    id: watchId,
    watcher,
    watching: resolved,
    debounceMs,
    listeners: new Set(),
    lastEmit: new Map(),
    createdAt: Date.now(),
  };
  registerWatch(entry);

  // Wire chokidar events into the registry's debounced emit. We deliberately
  // forward addDir/unlinkDir too — the consumer can ignore them, but a new
  // directory in simulator-core/er-sim-monitor is meaningful UX info.
  const forward = (event: WatchEventType) => (path: string) => {
    emit(entry, { event, path, ts: Date.now() });
  };
  watcher.on('add', forward('add'));
  watcher.on('change', forward('change'));
  watcher.on('unlink', forward('unlink'));
  watcher.on('addDir', forward('addDir'));
  watcher.on('unlinkDir', forward('unlinkDir'));
  // Surface watcher errors to all listeners as a synthetic event so the UI
  // can warn — silent watcher failures are the worst kind.
  watcher.on('error', (err) => {
    emit(entry, {
      event: 'change',
      path: `__watcher_error__:${(err as Error).message}`,
      ts: Date.now(),
    });
  });

  return NextResponse.json({
    ok: true,
    watchId,
    watching: resolved,
    debounceMs,
  });
}
