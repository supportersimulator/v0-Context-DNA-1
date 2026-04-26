'use client';

/**
 * useFileWatch — client hook around /api/watch/{start,stream,stop}.
 *
 *   const { watching, watchId, error } = useFileWatch({
 *     paths: ['simulator-core/er-sim-monitor'],
 *     onEvent: (evt) => console.log(evt),
 *     enabled: true,
 *     debounceMs: 200,
 *   });
 *
 * Lifecycle:
 *   1. On mount (or when `paths` changes) → POST /api/watch/start.
 *   2. On success → open EventSource against /api/watch/stream/<id>.
 *   3. Per event → push into the global file-events store and call onEvent.
 *   4. On unmount or paths change → close EventSource AND POST /api/watch/stop
 *      via navigator.sendBeacon when available so the watcher is reaped even
 *      if the page is closing.
 *
 * Stale-closure note: onEvent is stored in a ref so the hook does NOT
 * re-subscribe every render when the parent passes a fresh callback.
 */

import { useEffect, useRef, useState } from 'react';
import { addEvent, type FileEvent } from '@/lib/state/file-events';

export interface UseFileWatchOptions {
  /** Absolute or superrepo-relative paths to watch. */
  paths: string[];
  /** Called for every event. Stable across renders via ref. */
  onEvent?: (evt: FileEvent) => void;
  /** Default: true. Set false to suspend without unmounting. */
  enabled?: boolean;
  /** Default: 200. Per-path debounce on the server. */
  debounceMs?: number;
}

export interface UseFileWatchResult {
  watching: boolean;
  watchId: string | null;
  error: string | null;
}

interface StartResponse {
  ok: boolean;
  watchId?: string;
  watching?: string[];
  debounceMs?: number;
  error?: string;
}

interface StreamPayload {
  event: string;
  path?: string;
  ts?: number;
  watchId?: string;
  watching?: string[];
}

/**
 * Stable JSON for paths so the effect doesn't restart on a new array
 * reference with identical contents.
 */
function pathsKey(paths: string[]): string {
  return JSON.stringify([...paths].sort());
}

export function useFileWatch(opts: UseFileWatchOptions): UseFileWatchResult {
  const { paths, onEvent, enabled = true, debounceMs = 200 } = opts;
  const [watching, setWatching] = useState(false);
  const [watchId, setWatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const key = pathsKey(paths);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || paths.length === 0) {
      // Reset state via queueMicrotask so we don't call setState synchronously
      // inside the effect body (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        if (cancelled) return;
        setWatching(false);
        setWatchId(null);
      });
      return () => {
        cancelled = true;
      };
    }

    let es: EventSource | null = null;
    let activeId: string | null = null;

    const stopWatcher = (id: string) => {
      // Use sendBeacon if the page is unloading — fetch() may be cancelled
      // mid-flight on tab close, which would leak the watcher.
      try {
        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          const blob = new Blob([JSON.stringify({ watchId: id })], {
            type: 'application/json',
          });
          if (navigator.sendBeacon('/api/watch/stop', blob)) return;
        }
      } catch {
        /* fall through to fetch */
      }
      void fetch('/api/watch/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId: id }),
        keepalive: true,
      }).catch(() => {
        /* best-effort */
      });
    };

    (async () => {
      setError(null);
      let started: StartResponse;
      try {
        const res = await fetch('/api/watch/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths, debounce_ms: debounceMs }),
          cache: 'no-store',
        });
        started = (await res.json()) as StartResponse;
        if (!res.ok || !started.ok || !started.watchId) {
          throw new Error(started.error || `HTTP ${res.status}`);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setWatching(false);
        setWatchId(null);
        return;
      }

      if (cancelled) {
        // Race: hook unmounted between POST send and resolve. Reap the
        // watcher we just opened so it doesn't leak.
        if (started.watchId) stopWatcher(started.watchId);
        return;
      }

      activeId = started.watchId;
      setWatchId(activeId);

      es = new EventSource(`/api/watch/stream/${activeId}`);
      es.onmessage = (msg) => {
        if (cancelled) return;
        let payload: StreamPayload;
        try {
          payload = JSON.parse(msg.data) as StreamPayload;
        } catch {
          return;
        }
        if (payload.event === 'subscribed') {
          setWatching(true);
          return;
        }
        if (payload.event === 'not_found') {
          setError('watch not found on server');
          setWatching(false);
          return;
        }
        if (typeof payload.path !== 'string' || typeof payload.ts !== 'number') return;
        const evt: FileEvent = {
          event: payload.event as FileEvent['event'],
          path: payload.path,
          ts: payload.ts,
        };
        addEvent(evt);
        onEventRef.current?.(evt);
      };
      es.onerror = () => {
        if (cancelled) return;
        if (es && es.readyState === EventSource.CLOSED) {
          setWatching(false);
        }
      };
    })();

    return () => {
      cancelled = true;
      if (es) {
        try {
          es.close();
        } catch {
          /* ignore */
        }
        es = null;
      }
      if (activeId) stopWatcher(activeId);
      setWatching(false);
      setWatchId(null);
    };
    // `key` captures paths content; debounceMs + enabled are primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, debounceMs, enabled]);

  return { watching, watchId, error };
}
