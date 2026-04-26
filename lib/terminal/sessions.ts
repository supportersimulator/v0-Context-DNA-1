/**
 * Terminal sessions registry — shared module-level Map<sessionId, Session>.
 *
 * Used by app/api/terminal/{exec,stream,kill} routes. All three routes import
 * from this single module so the spawned ChildProcess and its in-memory
 * output buffer are reachable across requests.
 *
 * Why a buffer:
 *   exec spawns a process and returns immediately. The client then connects
 *   to the SSE stream — but stdout/stderr chunks may arrive between the
 *   exec response landing and the EventSource attaching. We buffer those
 *   pre-stream chunks (capped) and replay them on subscribe.
 *
 * Memory bounds:
 *   - PRE_STREAM_BUFFER_MAX caps replay buffer size.
 *   - Sessions auto-evict from the registry on close + after grace window.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';

/** Maximum bytes of stdout/stderr buffered before the SSE stream attaches. */
const PRE_STREAM_BUFFER_MAX = 64 * 1024;

/** ms a closed session lingers in the registry so late SSE clients can drain it. */
const CLOSED_SESSION_TTL_MS = 30_000;

export type StreamKind = 'stdout' | 'stderr';

export interface BufferedChunk {
  stream: StreamKind;
  chunk: string;
}

export interface CloseEvent {
  code: number | null;
  signal: NodeJS.Signals | null;
}

/** Subscriber callback signature — called for each new chunk or the close event. */
export type SessionListener = (
  evt:
    | { type: 'chunk'; data: BufferedChunk }
    | { type: 'close'; data: CloseEvent },
) => void;

export interface Session {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  cwd: string;
  command: string[];
  /** Pre-stream chunk buffer (capped at PRE_STREAM_BUFFER_MAX bytes). */
  buffer: BufferedChunk[];
  bufferBytes: number;
  closed: boolean;
  closeEvent: CloseEvent | null;
  listeners: Set<SessionListener>;
  createdAt: number;
}

/**
 * Module-level registry. In dev, Next.js may HMR this module — we attach to
 * globalThis to survive reloads so an in-flight session isn't orphaned.
 */
const GLOBAL_KEY = '__contextdna_terminal_sessions__';

interface GlobalRegistry {
  sessions: Map<string, Session>;
}

function getRegistry(): GlobalRegistry {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { sessions: new Map<string, Session>() } satisfies GlobalRegistry;
  }
  return g[GLOBAL_KEY] as GlobalRegistry;
}

export function getSession(id: string): Session | undefined {
  return getRegistry().sessions.get(id);
}

export function deleteSession(id: string): void {
  getRegistry().sessions.delete(id);
}

export function registerSession(session: Session): void {
  getRegistry().sessions.set(session.id, session);
}

/** Push a chunk to a session's buffer (capped) and notify all listeners. */
export function pushChunk(session: Session, chunk: BufferedChunk): void {
  if (session.bufferBytes < PRE_STREAM_BUFFER_MAX) {
    session.buffer.push(chunk);
    session.bufferBytes += Buffer.byteLength(chunk.chunk, 'utf8');
  }
  for (const listener of session.listeners) {
    try {
      listener({ type: 'chunk', data: chunk });
    } catch {
      // Listener errors must not affect other subscribers.
    }
  }
}

/** Mark session closed, notify listeners, and schedule eviction. */
export function markClosed(session: Session, evt: CloseEvent): void {
  if (session.closed) return;
  session.closed = true;
  session.closeEvent = evt;
  for (const listener of session.listeners) {
    try {
      listener({ type: 'close', data: evt });
    } catch {
      // Listener errors must not affect other subscribers.
    }
  }
  setTimeout(() => deleteSession(session.id), CLOSED_SESSION_TTL_MS);
}

// ---------------------------------------------------------------------------
// Path safety — defaultProjectDir mirrors app/api/receipts/route.ts pattern.
// Walks up from process.cwd() looking for the .3-surgeons marker; falls back
// to the parent of cwd. The superrepo root is the IDE's parent directory.
// ---------------------------------------------------------------------------

/**
 * Returns the superrepo root. Mirrors defaultProjectDir() in the receipts
 * route — walks up from process.cwd() looking for the .3-surgeons marker
 * and falls back to the parent of cwd if none found.
 */
export function defaultProjectDir(): string {
  const start = process.cwd();
  let dir = start;
  for (let i = 0; i < 6; i++) {
    try {
      const probe = path.join(dir, '.3-surgeons');
      if (existsSync(probe)) return dir;
    } catch {
      /* keep walking */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(start);
}

/**
 * Resolve+validate a user-supplied cwd. Must:
 *   - resolve to a real existing directory
 *   - sit inside the superrepo root (no traversal escape via ..)
 * Returns the absolute resolved path on success, or null on rejection.
 *
 * SECURITY: Without this check a caller could pass cwd: "../.." and run
 * commands anywhere on disk. Containment is enforced by string-prefix
 * comparison after path.resolve() collapses traversals.
 */
export function resolveSafeCwd(input: string | undefined): string | null {
  const root = defaultProjectDir();
  const target = input && input.trim() ? input.trim() : root;
  // Relative inputs resolve against the superrepo root, NOT process.cwd(),
  // so "simulator-core/er-sim-monitor" works regardless of where Next runs.
  const abs = path.isAbsolute(target) ? path.resolve(target) : path.resolve(root, target);
  // Containment check — abs must equal root or live beneath it.
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null;
  try {
    if (!existsSync(abs)) return null;
    if (!statSync(abs).isDirectory()) return null;
  } catch {
    return null;
  }
  return abs;
}
