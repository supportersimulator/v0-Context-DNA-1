'use client';

// =============================================================================
// useFleetEvents — subscribe to /api/fleet/events SSE stream
//
// Replaces the 5s polling on /api/fleet/health for surgeon/3-surgeons/fleet/
// gold events. The endpoint stays open as long as the component is mounted.
// On mount: open EventSource. On unmount: close. On error: auto-reconnect
// with exponential backoff (capped at 30s).
//
// Returns:
//   events    — newest-first list, capped at `maxBuffer` (default 200)
//   connected — true once SSE handshake completed
//   error     — last error message, cleared on successful reconnect
//   stats     — running counts
// =============================================================================

import { useEffect, useRef, useState } from 'react';

export interface FleetEvent {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
  source?: string;
  timestamp?: string | number;
  [k: string]: unknown;
}

export interface UseFleetEventsOptions {
  kinds?: string[];      // glob list: ['surgeon.*', 'fleet.*']
  maxBuffer?: number;    // newest-first ring (default 200)
  enabled?: boolean;     // gate to allow toggling
}

export interface UseFleetEventsResult {
  events: FleetEvent[];
  connected: boolean;
  error: string | null;
  stats: { received: number; reconnects: number };
  clear: () => void;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export function useFleetEvents(opts: UseFleetEventsOptions = {}): UseFleetEventsResult {
  const { kinds, maxBuffer = 200, enabled = true } = opts;
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ received: 0, reconnects: 0 });

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    closedRef.current = false;

    const url = (() => {
      const u = new URL('/api/fleet/events', window.location.origin);
      if (kinds && kinds.length > 0) u.searchParams.set('kinds', kinds.join(','));
      return u.toString();
    })();

    const open = () => {
      if (closedRef.current) return;
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        setError(null);
      };

      es.onmessage = (ev) => {
        // Generic 'message' frames (when no `event:` line was emitted upstream).
        ingest(ev.data);
      };

      // Catch-all: every typed event comes through here (event: <type>).
      // EventSource only dispatches on listeners we add, so subscribe to '*'-ish
      // by listening to the broad set we expect. A wildcard listener doesn't
      // exist in the API — instead we register by namespace prefix and also
      // keep `onmessage` for fallbacks.
      const NS = ['fleet', 'surgeon', 'probe', 'evidence', 'quorum', 'panel', 'gold', 'sse'];
      for (const ns of NS) {
        // EventSource string listener gets the raw `data:` payload
        es.addEventListener(`${ns}.*`, (ev) => ingest((ev as MessageEvent).data));
      }
      // Also a few high-frequency concrete types so dev publish events arrive
      // before any namespace-style listener:
      ['sse.hello', 'surgeon.dissent', 'fleet.peer.online', 'fleet.peer.offline'].forEach((t) => {
        es.addEventListener(t, (ev) => ingest((ev as MessageEvent).data));
      });

      es.onerror = () => {
        setConnected(false);
        try { es.close(); } catch { /* noop */ }
        if (closedRef.current) return;
        retryRef.current += 1;
        setStats((s) => ({ ...s, reconnects: s.reconnects + 1 }));
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (retryRef.current - 1), RECONNECT_MAX_MS);
        setError(`disconnected; retry in ${Math.round(delay / 1000)}s`);
        timerRef.current = setTimeout(open, delay);
      };
    };

    const ingest = (raw: string) => {
      try {
        const evt = JSON.parse(raw) as FleetEvent;
        setEvents((prev) => {
          const next = [evt, ...prev];
          return next.length > maxBuffer ? next.slice(0, maxBuffer) : next;
        });
        setStats((s) => ({ ...s, received: s.received + 1 }));
      } catch {
        // ignore malformed frame
      }
    };

    open();

    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try { esRef.current?.close(); } catch { /* noop */ }
      esRef.current = null;
      setConnected(false);
    };
    // re-open if filter or enable changes
  }, [enabled, kinds?.join(','), maxBuffer]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => setEvents([]);

  return { events, connected, error, stats, clear };
}
