/**
 * In-memory ring buffer for the IDE's unified log/error viewer.
 *
 * Module-level state — fine for a dev surface. Process restart wipes it.
 * NOT a production telemetry sink.
 *
 * API:
 *   append(entry)             — push, evict oldest when capacity exceeded,
 *                               notify subscribers
 *   read({ since, level, limit }) — slice + filter + cap
 *   clear()                   — drop all entries (notifies subscribers)
 *   subscribe(cb) -> unsub    — pub/sub on each append (and on clear)
 *   stats()                   — { count, oldest, newest } for diagnostics
 */
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  msg: string;
  detail?: unknown;
}

const MAX_ENTRIES = 500;

const ring: LogEntry[] = [];
const subscribers = new Set<(entry: LogEntry) => void>();

/** Append an entry. Evicts oldest if buffer full. Notifies subscribers. */
export function append(entry: LogEntry): void {
  if (!entry || typeof entry.ts !== 'number' || !entry.level || !entry.source) {
    return;
  }
  ring.push(entry);
  if (ring.length > MAX_ENTRIES) {
    ring.splice(0, ring.length - MAX_ENTRIES);
  }
  for (const cb of subscribers) {
    try {
      cb(entry);
    } catch {
      // Subscriber errors must never break the appender.
    }
  }
}

export interface ReadOpts {
  since?: number;
  level?: LogLevel;
  limit?: number;
}

/** Read filtered slice. Returns chronological order (oldest first). */
export function read(opts: ReadOpts = {}): LogEntry[] {
  const { since, level, limit } = opts;
  let out = ring;
  if (typeof since === 'number') {
    out = out.filter((e) => e.ts > since);
  }
  if (level) {
    out = out.filter((e) => e.level === level);
  }
  if (typeof limit === 'number' && limit > 0 && out.length > limit) {
    out = out.slice(-limit);
  }
  // Always return a copy so callers can't mutate the ring.
  return out.slice();
}

/** Drop all entries. Notifies subscribers with a synthetic clear marker. */
export function clear(): void {
  ring.length = 0;
  const marker: LogEntry = {
    ts: Date.now(),
    level: 'info',
    source: 'log-buffer',
    msg: 'cleared',
  };
  for (const cb of subscribers) {
    try {
      cb(marker);
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to append events. Returns unsubscribe fn. */
export function subscribe(cb: (entry: LogEntry) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Diagnostic snapshot — counts and timestamp envelope. */
export function stats(): { count: number; oldest: number | null; newest: number | null } {
  if (ring.length === 0) return { count: 0, oldest: null, newest: null };
  return {
    count: ring.length,
    oldest: ring[0].ts,
    newest: ring[ring.length - 1].ts,
  };
}

/** Capacity exposed for tests / instrumentation. */
export const CAPACITY = MAX_ENTRIES;
