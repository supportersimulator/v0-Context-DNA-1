'use client';

// =============================================================================
// EventBridge — wires the Python EventBus (multi-fleet daemon) into the
// browser-side TypedEventBus singleton (lib/ide/event-bus.ts).
//
// Round-3 sprint (2026-05-04): the IDE event bus existed and panels emitted
// local events, but no consumer ever subscribed to the fleet daemon's SSE
// stream. As a result, ~9 theatrical components stayed dark — they listened
// for fleet/surgeon/probe events that never arrived. This bridge closes that
// gap.
//
// Topology:
//
//   Python EventBus (port 8031 WS, plus event_stream.py SSE / sse_multiplex
//   on daemon port 8855) ── HTTP SSE ──► Next.js proxy /api/fleet/events
//                                                ▲
//                                                │  EventSource
//                                                │
//                                EventBridge.start()  (this file)
//                                                │
//                                                ▼
//                          getEventBus()  (singleton TypedEventBus)
//                                                │
//                                                ▼
//                       useIDEEvent('fleet:peer-online', …)  in panels
//
// Why a dedicated bridge instead of `useFleetEvents` per-panel?
//   - Single connection, fan-out to N panels (avoids N EventSource sockets).
//   - Panels stay framework-pure: they call useIDEEvent and never know SSE
//     exists. Swapping transport (WebSocket, NATS, mock) becomes a 1-file
//     change here, not a tour through every panel.
//   - Survives Hot Module Reload by reusing the singleton bus.
//
// SSR-safe: never touches `window` outside browser code paths. The factory
// `getEventBridge()` returns a no-op bridge on the server.
// =============================================================================

import { getEventBus, type IDEEvents } from './event-bus';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * SSE endpoint. Defaults to the Next.js proxy `/api/fleet/events`, which
 * forwards to the multi-fleet daemon's `/events/stream` endpoint (port 8855).
 *
 * Override via NEXT_PUBLIC_FLEET_SSE_URL to point directly at a Python
 * EventBus instance (e.g. `http://127.0.0.1:8031/events` for the WS server's
 * SSE handler, or `http://127.0.0.1:8033/events` for event_stream.py).
 */
const DEFAULT_SSE_PATH = '/api/fleet/events';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

// Namespaces emitted by the Python EventBus (multi-fleet/multifleet/event_types.py).
// Used to register addEventListener('<ns>.*') on the EventSource — this is
// how SSE typed events propagate without a true wildcard listener.
const FLEET_NAMESPACES = [
  'fleet',
  'surgeon',
  'probe',
  'evidence',
  'quorum',
  'gold',
  'panel',
  'sse',
  'injection',
  'health',
] as const;

// High-frequency concrete event types we want to ensure are subscribed to
// even if they don't fit the namespace prefix listener (some daemons emit
// `event: <exact-type>` headers without trailing dot-suffix).
const CONCRETE_EVENT_TYPES = [
  'sse.hello',
  'sse.heartbeat',
  'fleet.peer.online',
  'fleet.peer.offline',
  'surgeon.dissent',
] as const;

// ---------------------------------------------------------------------------
// FleetEnvelope — shape of a parsed Python event
// ---------------------------------------------------------------------------

interface FleetEnvelope {
  type: string;
  payload?: Record<string, unknown>;
  source?: string;
  timestamp?: string | number;
  correlation_id?: string;
  session_id?: string;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// Type-safe mapping from Python event types → typed IDE event names
//
// We dispatch BOTH a strongly-typed event (for ergonomic useIDEEvent calls)
// AND a generic 'fleet:event' / 'surgeon:event' / etc. (for prefix listeners
// and devtools).
// ---------------------------------------------------------------------------

type Mapping = {
  [pythonType: string]: keyof IDEEvents;
};

const TYPED_MAPPING: Mapping = {
  'fleet.peer.online': 'fleet:peer-online',
  'fleet.peer.offline': 'fleet:peer-offline',
  'surgeon.dissent': 'surgeon:dissent',
};

/**
 * Map a Python event namespace to its generic IDE event name.
 * Anything outside this map falls through to 'fleet:event'.
 */
function namespaceToGeneric(eventType: string): keyof IDEEvents {
  const ns = eventType.split('.')[0];
  switch (ns) {
    case 'surgeon':
      return 'surgeon:event';
    case 'probe':
      return 'probe:event';
    case 'evidence':
      return 'evidence:event';
    case 'quorum':
      return 'quorum:event';
    case 'gold':
      return 'gold:event';
    default:
      return 'fleet:event';
  }
}

// ---------------------------------------------------------------------------
// EventBridge class
// ---------------------------------------------------------------------------

export interface EventBridgeOptions {
  /** Override the SSE URL. Defaults to `/api/fleet/events`. */
  url?: string;
  /** Optional kind filter forwarded to the daemon as `?kinds=`. */
  kinds?: string[];
}

export class EventBridge {
  private es: EventSource | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private url: string;
  private kinds: string[];
  private started = false;

  constructor(opts: EventBridgeOptions = {}) {
    this.url = opts.url ?? this.resolveDefaultUrl();
    this.kinds = opts.kinds ?? [];
  }

  /** Open the SSE connection and start dispatching into the IDE bus. */
  start(): void {
    if (this.started) return;
    if (typeof window === 'undefined') return; // SSR: do nothing
    if (typeof window.EventSource === 'undefined') {
      console.warn('[EventBridge] EventSource not available in this runtime');
      return;
    }
    this.started = true;
    this.closed = false;
    this.open();
  }

  /** Tear down — call on app shutdown / hot-reload. */
  stop(): void {
    this.closed = true;
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.es) {
      try {
        this.es.close();
      } catch {
        // already closed
      }
      this.es = null;
    }
  }

  /** True if currently subscribed (an EventSource exists and is OPEN). */
  isConnected(): boolean {
    return this.es?.readyState === 1; // EventSource.OPEN
  }

  // -------------------------------------------------------------------------

  private resolveDefaultUrl(): string {
    if (typeof window === 'undefined') return DEFAULT_SSE_PATH;
    const override =
      typeof process !== 'undefined' &&
      process.env?.NEXT_PUBLIC_FLEET_SSE_URL;
    if (override) return override;
    const u = new URL(DEFAULT_SSE_PATH, window.location.origin);
    return u.toString();
  }

  private buildUrl(): string {
    if (this.kinds.length === 0) return this.url;
    const u = new URL(this.url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    u.searchParams.set('kinds', this.kinds.join(','));
    return u.toString();
  }

  private open(): void {
    if (this.closed) return;

    let es: EventSource;
    try {
      es = new EventSource(this.buildUrl());
    } catch (err) {
      console.warn('[EventBridge] EventSource constructor threw:', err);
      this.scheduleReconnect();
      return;
    }
    this.es = es;

    es.onopen = () => {
      this.retry = 0;
      const bus = getEventBus();
      bus.emit('fleet:bridge-connected', { endpoint: this.url });
    };

    // Generic 'message' events (no `event:` line emitted upstream).
    es.onmessage = (ev) => this.ingest(ev.data);

    // EventSource has no wildcard listener — we register one per namespace.
    for (const ns of FLEET_NAMESPACES) {
      // The daemon emits `event: <type>` per envelope; matching by exact
      // type would require enumeration, so we approximate via namespace
      // suffixes the daemon sends (e.g. `event: fleet.peer.online`).
      // Most browsers accept arbitrary event-type strings, so registering
      // by full prefix-glob isn't possible — we fall back to `onmessage`
      // for unknown types AND register a few well-known concrete types
      // below. This double-listen is cheap (a single ingest path).
      es.addEventListener(`${ns}.*`, (ev) =>
        this.ingest((ev as MessageEvent).data),
      );
    }
    for (const t of CONCRETE_EVENT_TYPES) {
      es.addEventListener(t, (ev) => this.ingest((ev as MessageEvent).data));
    }

    es.onerror = () => {
      try {
        es.close();
      } catch {
        // already closed
      }
      this.es = null;
      if (this.closed) return;
      this.scheduleReconnect();
    };
  }

  private ingest(raw: string): void {
    let evt: FleetEnvelope;
    try {
      evt = JSON.parse(raw) as FleetEnvelope;
    } catch {
      return; // malformed frame — ignore
    }
    if (!evt || typeof evt.type !== 'string') return;

    const bus = getEventBus();

    // 1) Typed dispatch for high-value events (panels can `useIDEEvent('fleet:peer-online', …)`).
    const typedName = TYPED_MAPPING[evt.type];
    if (typedName) {
      // We trust the Python envelope shape here — the typed payload is a
      // looser superset. The cast is safe because TypedEventBus emits the
      // payload through its middleware chain unchanged.
      bus.emit(
        typedName,
        (evt.payload ?? {}) as IDEEvents[typeof typedName],
      );
    }

    // 2) Generic dispatch by namespace — always fires.
    const generic = namespaceToGeneric(evt.type);
    bus.emit(generic, {
      type: evt.type,
      payload: evt.payload ?? {},
      source: evt.source,
      timestamp: evt.timestamp,
      correlation_id: evt.correlation_id,
      session_id: evt.session_id,
    } as IDEEvents[typeof generic]);
  }

  private scheduleReconnect(): void {
    this.retry += 1;
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** (this.retry - 1),
      RECONNECT_MAX_MS,
    );
    const bus = getEventBus();
    bus.emit('fleet:bridge-disconnected', {
      endpoint: this.url,
      retryDelayMs: delay,
    });
    this.timer = setTimeout(() => this.open(), delay);
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor — one bridge per browser tab.
// ---------------------------------------------------------------------------

let _bridge: EventBridge | null = null;

export function getEventBridge(opts?: EventBridgeOptions): EventBridge {
  if (!_bridge) {
    _bridge = new EventBridge(opts);
  }
  return _bridge;
}

/** Reset for tests. */
export function _resetEventBridge(): void {
  if (_bridge) {
    _bridge.stop();
    _bridge = null;
  }
}

// ---------------------------------------------------------------------------
// Auto-start helper — call once at app boot (e.g. in DashboardShell or root
// layout `useEffect`). Idempotent.
// ---------------------------------------------------------------------------

export function startEventBridge(opts?: EventBridgeOptions): EventBridge {
  const bridge = getEventBridge(opts);
  bridge.start();
  return bridge;
}
