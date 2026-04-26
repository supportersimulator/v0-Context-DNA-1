/**
 * Global file-event store — module-level sliding window of recent watcher
 * events plus a tiny pub/sub so any IDE component can subscribe without
 * pulling in a state-management library.
 *
 * Why module-level (not React Context):
 *   - The TerminalPanel + WorkspaceEditorShell live in different subtrees;
 *     a Context would force a common provider higher up in the tree.
 *   - Events arrive from EventSource callbacks which already live outside
 *     React render cycles.
 *   - Keeps the dep graph empty — no zustand, no jotai.
 *
 * The store also tracks "self-writes" — paths the IDE just wrote to via
 * /api/fs/write. The editor uses this to suppress the "file changed on disk"
 * banner for its own saves (otherwise every Cmd-S would fire the banner).
 */

import type { WatchEvent, WatchEventType } from '@/lib/api/watch/registry';

export type FileEvent = WatchEvent;
export type { WatchEventType };

const MAX_EVENTS = 100;
/** Self-write entries older than this are evicted on the next access. */
const SELF_WRITE_TTL_MS = 2_000;

type Listener = (evt: FileEvent) => void;

const events: FileEvent[] = [];
const listeners = new Set<Listener>();

/** Map<absolutePath, lastSelfWriteTs>. Used to suppress echo events. */
const selfWrites = new Map<string, number>();

export function addEvent(evt: FileEvent): void {
  events.push(evt);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  for (const l of listeners) {
    try {
      l(evt);
    } catch {
      /* listener errors must not poison the fan-out */
    }
  }
}

export function getRecent(limit?: number): FileEvent[] {
  if (!limit || limit <= 0 || limit >= events.length) return events.slice();
  return events.slice(events.length - limit);
}

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function clearAll(): void {
  events.length = 0;
  selfWrites.clear();
}

/**
 * Mark a path as "we just wrote this" so the editor can suppress the
 * "file changed on disk" banner when chokidar fires the echo.
 *
 * Call this immediately BEFORE the /api/fs/write fetch — chokidar's
 * awaitWriteFinish (50ms) plus debounce (200ms) gives us a comfortable
 * window before the echo lands.
 */
export function markSelfWrite(absolutePath: string): void {
  selfWrites.set(absolutePath, Date.now());
}

/**
 * Returns true if `absolutePath` was marked as a self-write within the TTL.
 * Stale entries are evicted on access so the map stays bounded.
 */
export function isRecentSelfWrite(absolutePath: string): boolean {
  const ts = selfWrites.get(absolutePath);
  if (ts === undefined) return false;
  if (Date.now() - ts > SELF_WRITE_TTL_MS) {
    selfWrites.delete(absolutePath);
    return false;
  }
  return true;
}
