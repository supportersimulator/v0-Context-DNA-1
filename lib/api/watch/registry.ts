/**
 * Watch registry — module-level Map<watchId, WatchEntry> shared by the
 * /api/watch/{start,stream,stop} routes.
 *
 * One process owns the chokidar watchers; each entry has its own listener
 * fan-out so multiple SSE clients can attach to the same watcher (the editor
 * shell + the terminal panel can both subscribe).
 *
 * Hard cap: MAX_WATCHERS — POST /start rejects the (cap+1)th watcher with a
 * helpful error so a misbehaving client can't leak file descriptors.
 *
 * Per-path debounce: events are coalesced within debounceMs so a single Cmd-S
 * doesn't fan out N "change" events (Monaco can produce two close-together
 * writes during atomic-rename).
 */
import type { FSWatcher } from 'chokidar';

export const MAX_WATCHERS = 5;

export type WatchEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

export interface WatchEvent {
  event: WatchEventType;
  /** Absolute path. */
  path: string;
  /** Epoch milliseconds. */
  ts: number;
}

export type WatchListener = (evt: WatchEvent) => void;

export interface WatchEntry {
  id: string;
  watcher: FSWatcher;
  /** Absolute roots actually watched (post path-safety resolution). */
  watching: string[];
  debounceMs: number;
  listeners: Set<WatchListener>;
  /** Last emit ts per path — used to debounce. */
  lastEmit: Map<string, number>;
  createdAt: number;
}

const REGISTRY = new Map<string, WatchEntry>();

export function registerWatch(entry: WatchEntry): void {
  REGISTRY.set(entry.id, entry);
}

export function getWatch(id: string): WatchEntry | undefined {
  return REGISTRY.get(id);
}

export function listWatches(): WatchEntry[] {
  return Array.from(REGISTRY.values());
}

export function activeCount(): number {
  return REGISTRY.size;
}

/**
 * Close a watcher and remove it from the registry. Idempotent — safe to call
 * twice. Returns true if a watcher was actually removed.
 *
 * NOTE: chokidar leaks file descriptors if .close() is forgotten. Every code
 * path that drops a watcher MUST go through this helper.
 */
export async function removeWatch(id: string): Promise<boolean> {
  const entry = REGISTRY.get(id);
  if (!entry) return false;
  REGISTRY.delete(id);
  entry.listeners.clear();
  try {
    await entry.watcher.close();
  } catch {
    /* best-effort — registry is already cleared */
  }
  return true;
}

/**
 * Emit an event to all listeners, applying per-path debounce. If the same
 * path fires twice within debounceMs the second emit is dropped.
 */
export function emit(entry: WatchEntry, evt: WatchEvent): void {
  const last = entry.lastEmit.get(evt.path) ?? 0;
  if (evt.ts - last < entry.debounceMs) return;
  entry.lastEmit.set(evt.path, evt.ts);
  for (const l of entry.listeners) {
    try {
      l(evt);
    } catch {
      /* listener errors must not poison the fan-out */
    }
  }
}
