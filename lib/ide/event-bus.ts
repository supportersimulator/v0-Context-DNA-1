'use client';

import { useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Disposable — returned from subscriptions for deterministic cleanup
// ---------------------------------------------------------------------------

export interface Disposable {
  dispose(): void;
}

// ---------------------------------------------------------------------------
// IDE Event Map — every event in the system, strongly typed
//
// Convention: 'namespace:action' naming.
// Payloads are plain objects (no class instances, no functions).
// ---------------------------------------------------------------------------

export interface IDEEvents {
  // -- Panel lifecycle ------------------------------------------------------
  'panel:opened': { panelId: string; title: string };
  'panel:closed': { panelId: string };
  'panel:focused': { panelId: string; previousId: string | null };
  'panel:blurred': { panelId: string };
  'panel:resized': { panelId: string; width: number; height: number };
  'panel:error': {
    panelId: string;
    error: string;
    retryCount: number;
    fatal: boolean;
  };

  // -- Explorer -------------------------------------------------------------
  'explorer:toggled': { visible: boolean };
  'explorer:file-selected': { path: string; type: 'file' | 'directory' };
  'explorer:visibility-changed': { visible: boolean };

  // -- Editor -----------------------------------------------------------------
  'editor:file-opened': { path: string; language: string };
  'editor:file-closed': { path: string };
  'editor:file-changed': { path: string; isDirty: boolean };
  'editor:active-changed': { path: string | null; previous: string | null };

  // -- Git --------------------------------------------------------------------
  'git:status-updated': { branch: string; changedFiles: number; stagedFiles: number };
  'git:commit-created': { message: string; hash: string };

  // -- Navigation -----------------------------------------------------------
  'navigation:page-changed': {
    page: 'dashboard' | 'workspace' | 'live';
    previous: string;
  };

  // -- Command palette ------------------------------------------------------
  'command:executed': { commandId: string; args?: unknown[] };

  // -- Theme ----------------------------------------------------------------
  'theme:changed': { theme: string; mode: 'dark' | 'light' };

  // -- Backend connectivity -------------------------------------------------
  'connection:status-changed': {
    connected: boolean;
    endpoint: string;
    /** Service ID from ServiceRegistry (e.g. 'context-dna', 'vllm-mlx') */
    serviceId?: string;
  };
  'connection:latency': { ms: number; endpoint: string };

  // -- Notifications --------------------------------------------------------
  'notification:new': {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
  };
  'notification:dismissed': { id: string };
  'notification:added': {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message?: string;
  };

  // -- Keyboard shortcuts (keybinding registry) -----------------------------
  'keybinding:triggered': { keys: string; commandId: string };

  // -- Service health -------------------------------------------------------
  'service:health-changed': { serviceId: string; status: string };

  // -- Learning / Context DNA -----------------------------------------------
  'learning:new': { id: string; title: string; domain: string };
  'injection:started': { sessionId: string };
  'injection:completed': {
    sessionId: string;
    sections: number;
    durationMs: number;
  };

  // -- Keyboard shortcuts ---------------------------------------------------
  'shortcut:executed': { commandId: string; shortcut: string };

  // -- Layout persistence ---------------------------------------------------
  'layout:saved': { timestamp: number };
  'layout:restored': { timestamp: number };
  'layout:reset': Record<string, never>;

  // -- Workspace slots ------------------------------------------------------
  'workspace:switched': { slot: number };

  // -- AI / Agent -----------------------------------------------------------
  'agent:task-started': { agentId: string; task: string };
  'agent:task-completed': {
    agentId: string;
    task: string;
    success: boolean;
  };
  'agent:stream-token': { agentId: string; token: string };

  // -- Settings -------------------------------------------------------------
  'settings:changed': { key: string; value: unknown; previous: unknown };
}

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

type Handler<T> = (data: T) => void;
type WildcardHandler = (event: string, data: unknown) => void;

export type MiddlewareFn<EventMap> = (
  event: keyof EventMap,
  data: unknown,
  next: () => void,
) => void;

interface HistoryEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const HISTORY_CAPACITY = 10;

// ---------------------------------------------------------------------------
// TypedEventBus — zero-dependency, generic, strongly typed event emitter
//
// Design decisions:
//   - Handlers stored in Set<Handler> per event key  -> no duplicate registrations
//   - Synchronous emission                           -> predictable ordering
//   - Max listener cap (configurable)                -> memory leak detection
//   - onAny() wildcard for devtools/debug            -> observability
//   - dispose() tears down everything                -> safe shutdown
//   - SSR-safe (no window/document access)           -> works in Next.js RSC
// ---------------------------------------------------------------------------

export class TypedEventBus<EventMap extends { [K in keyof EventMap]: EventMap[K] }> {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();
  private wildcardHandlers = new Set<WildcardHandler>();
  private prefixHandlers = new Map<string, Set<WildcardHandler>>();
  private middlewares: MiddlewareFn<EventMap>[] = [];
  private history = new Map<keyof EventMap, HistoryEntry[]>();
  private maxListeners: number;
  private disposed = false;

  constructor(opts?: { maxListeners?: number }) {
    this.maxListeners = opts?.maxListeners ?? 50;
  }

  // -----------------------------------------------------------------------
  // on — subscribe to an event, returns Disposable for cleanup
  // -----------------------------------------------------------------------

  on<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): Disposable {
    this.assertNotDisposed();

    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }

    // Warn if approaching max listeners (likely a leak)
    if (
      set.size >= this.maxListeners &&
      typeof console !== 'undefined'
    ) {
      console.warn(
        `[EventBus] Max listener count (${this.maxListeners}) reached for "${String(event)}". ` +
          'This may indicate a memory leak — check for missing dispose() calls.',
      );
    }

    set.add(handler as Handler<never>);

    return {
      dispose: () => {
        set!.delete(handler as Handler<never>);
        // Clean up the map entry if the set is now empty
        if (set!.size === 0) {
          this.handlers.delete(event);
        }
      },
    };
  }

  // -----------------------------------------------------------------------
  // once — subscribe to an event, auto-unsubscribe after first emission
  // -----------------------------------------------------------------------

  once<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): Disposable {
    const disposable = this.on(event, ((data: EventMap[K]) => {
      disposable.dispose();
      handler(data);
    }) as Handler<EventMap[K]>);

    return disposable;
  }

  // -----------------------------------------------------------------------
  // onPrefix — subscribe to all events matching a prefix (namespace wildcard)
  //
  // Usage:
  //   bus.onPrefix('panel:', handler)
  //   bus.onPrefix('panel:*', handler)  // trailing * is stripped
  // -----------------------------------------------------------------------

  onPrefix(prefix: string, handler: WildcardHandler): Disposable {
    this.assertNotDisposed();
    const normalizedPrefix = prefix.endsWith('*') ? prefix.slice(0, -1) : prefix;

    let set = this.prefixHandlers.get(normalizedPrefix);
    if (!set) {
      set = new Set();
      this.prefixHandlers.set(normalizedPrefix, set);
    }
    set.add(handler);

    return {
      dispose: () => {
        set!.delete(handler);
        if (set!.size === 0) {
          this.prefixHandlers.delete(normalizedPrefix);
        }
      },
    };
  }

  // -----------------------------------------------------------------------
  // use — register middleware that intercepts events before delivery
  //
  // Middleware runs in registration order. Each MUST call next() to continue.
  // If next() is not called, the event is swallowed.
  // -----------------------------------------------------------------------

  use(middleware: MiddlewareFn<EventMap>): Disposable {
    this.assertNotDisposed();
    this.middlewares.push(middleware);

    return {
      dispose: () => {
        const idx = this.middlewares.indexOf(middleware);
        if (idx !== -1) this.middlewares.splice(idx, 1);
      },
    };
  }

  // -----------------------------------------------------------------------
  // emit — fire an event synchronously to all registered handlers
  // Events pass through the middleware chain first.
  // -----------------------------------------------------------------------

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.assertNotDisposed();
    this.recordHistory(event, data);

    if (this.middlewares.length > 0) {
      let idx = 0;
      const chain = () => {
        if (idx < this.middlewares.length) {
          const mw = this.middlewares[idx++];
          mw(event, data, chain);
        } else {
          this.deliver(event, data);
        }
      };
      chain();
    } else {
      this.deliver(event, data);
    }
  }

  // -----------------------------------------------------------------------
  // replay — get last N events of a type (for late subscribers)
  //
  // Returns array of { data, timestamp }, oldest first.
  // Default count: all stored (up to HISTORY_CAPACITY = 10).
  // -----------------------------------------------------------------------

  replay<K extends keyof EventMap>(
    event: K,
    count?: number,
  ): HistoryEntry<EventMap[K]>[] {
    const entries = this.history.get(event) as HistoryEntry<EventMap[K]>[] | undefined;
    if (!entries || entries.length === 0) return [];
    if (count === undefined || count >= entries.length) return [...entries];
    return entries.slice(-count);
  }

  // -----------------------------------------------------------------------
  // off — unsubscribe a specific handler from an event
  // -----------------------------------------------------------------------

  off<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler as Handler<never>);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  // -----------------------------------------------------------------------
  // onAny — wildcard subscription (receives ALL events)
  // Used for devtools, debug logging, analytics, etc.
  // -----------------------------------------------------------------------

  onAny(handler: WildcardHandler): Disposable {
    this.assertNotDisposed();
    this.wildcardHandlers.add(handler);

    return {
      dispose: () => {
        this.wildcardHandlers.delete(handler);
      },
    };
  }

  // -----------------------------------------------------------------------
  // listenerCount — number of handlers for a specific event (diagnostic)
  // -----------------------------------------------------------------------

  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  // -----------------------------------------------------------------------
  // eventNames — list of events with at least one handler (diagnostic)
  // -----------------------------------------------------------------------

  eventNames(): (keyof EventMap)[] {
    return Array.from(this.handlers.keys());
  }

  // -----------------------------------------------------------------------
  // dispose — tear down every subscription, prevent further usage
  // -----------------------------------------------------------------------

  dispose(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.prefixHandlers.clear();
    this.middlewares.length = 0;
    this.history.clear();
    this.disposed = true;
  }

  // -----------------------------------------------------------------------
  // Internal: guard against use-after-dispose
  // -----------------------------------------------------------------------

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error(
        '[EventBus] Cannot use a disposed event bus. Create a new instance.',
      );
    }
  }

  // -----------------------------------------------------------------------
  // Internal: deliver event to exact-match, prefix, and wildcard handlers
  // -----------------------------------------------------------------------

  private deliver<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    // Exact-match handlers
    const set = this.handlers.get(event);
    if (set) {
      const snapshot = Array.from(set) as Handler<EventMap[K]>[];
      for (let i = 0; i < snapshot.length; i++) {
        try {
          snapshot[i](data);
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.error(`[EventBus] Handler error for "${String(event)}":`, err);
          }
        }
      }
    }

    const eventStr = event as string;

    // Prefix handlers (namespace wildcards like 'panel:*')
    if (this.prefixHandlers.size > 0) {
      for (const [prefix, prefixSet] of this.prefixHandlers) {
        if (eventStr.startsWith(prefix)) {
          const pfSnapshot = Array.from(prefixSet);
          for (let i = 0; i < pfSnapshot.length; i++) {
            try {
              pfSnapshot[i](eventStr, data);
            } catch (err) {
              if (typeof console !== 'undefined') {
                console.error(`[EventBus] Prefix handler error for "${prefix}*" on "${eventStr}":`, err);
              }
            }
          }
        }
      }
    }

    // Wildcard handlers (for devtools / debug logging)
    if (this.wildcardHandlers.size > 0) {
      const wcSnapshot = Array.from(this.wildcardHandlers);
      for (let i = 0; i < wcSnapshot.length; i++) {
        try {
          wcSnapshot[i](eventStr, data);
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.error('[EventBus] Wildcard handler error:', err);
          }
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal: record event in per-type circular buffer (max 10 entries)
  // -----------------------------------------------------------------------

  private recordHistory<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    let entries = this.history.get(event);
    if (!entries) {
      entries = [];
      this.history.set(event, entries);
    }
    entries.push({ data, timestamp: Date.now() });
    if (entries.length > HISTORY_CAPACITY) {
      entries.shift();
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton — one bus for the entire IDE
//
// Lazy initialization. SSR-safe (no window access).
// The bus is a plain TypeScript object — framework-agnostic.
// ---------------------------------------------------------------------------

let _bus: TypedEventBus<IDEEvents> | null = null;

export function getEventBus(): TypedEventBus<IDEEvents> {
  if (!_bus) {
    _bus = new TypedEventBus<IDEEvents>();

    // Dev-mode debug logging — log every event to console
    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'development'
    ) {
      _bus.onAny((event, data) => {
        console.debug(
          `%c[EventBus] %c${event}`,
          'color: #6b6b75; font-weight: bold',
          'color: #22c55e; font-weight: bold',
          data,
        );
      });
    }
  }
  return _bus;
}

/**
 * Reset the singleton (for testing only).
 * Disposes the current bus and allows a fresh one to be created on next access.
 */
export function _resetEventBus(): void {
  if (_bus) {
    _bus.dispose();
    _bus = null;
  }
}

// ---------------------------------------------------------------------------
// React Hooks — framework integration layer
// ---------------------------------------------------------------------------

/**
 * useEventBus — returns the singleton IDE event bus.
 *
 * Usage:
 *   const bus = useEventBus();
 *   bus.emit('panel:opened', { panelId: 'terminal', title: 'Terminal' });
 */
export function useEventBus(): TypedEventBus<IDEEvents> {
  // Singleton accessor; getEventBus() already returns a stable instance.
  return getEventBus();
}

/**
 * useIDEEvent — subscribe to a specific IDE event with automatic cleanup.
 *
 * The handler is stable-referenced: if the handler identity changes between
 * renders, the subscription is updated without creating duplicate listeners.
 *
 * Usage:
 *   useIDEEvent('panel:opened', (data) => {
 *     console.log('Panel opened:', data.panelId);
 *   });
 */
export function useIDEEvent<K extends keyof IDEEvents>(
  event: K,
  handler: Handler<IDEEvents[K]>,
): void {
  const bus = useEventBus();
  // Store latest handler in a ref to avoid re-subscribing on every render
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const disposable = bus.on(event, ((data: IDEEvents[K]) => {
      handlerRef.current(data);
    }) as Handler<IDEEvents[K]>);

    return () => disposable.dispose();
    // Only re-subscribe if the event name changes (string identity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, event]);
}

/**
 * useEmitEvent — returns a stable function for emitting IDE events.
 *
 * Usage:
 *   const emit = useEmitEvent();
 *   emit('theme:changed', { theme: 'nord', mode: 'dark' });
 */
export function useEmitEvent(): <K extends keyof IDEEvents>(
  event: K,
  data: IDEEvents[K],
) => void {
  const bus = useEventBus();

  return useCallback(
    <K extends keyof IDEEvents>(event: K, data: IDEEvents[K]) => {
      bus.emit(event, data);
    },
    [bus],
  );
}

/**
 * useIDEEventOnce — subscribe to a specific IDE event, auto-unsubscribe
 * after the first emission. Cleans up on unmount if never fired.
 *
 * Usage:
 *   useIDEEventOnce('layout:restored', (data) => {
 *     console.log('Layout restored at:', data.timestamp);
 *   });
 */
export function useIDEEventOnce<K extends keyof IDEEvents>(
  event: K,
  handler: Handler<IDEEvents[K]>,
): void {
  const bus = useEventBus();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const disposable = bus.once(event, ((data: IDEEvents[K]) => {
      handlerRef.current(data);
    }) as Handler<IDEEvents[K]>);

    return () => disposable.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, event]);
}

/**
 * useIDEEventPrefix — subscribe to all events matching a namespace prefix,
 * with automatic cleanup on unmount.
 *
 * Usage:
 *   useIDEEventPrefix('panel:*', (event, data) => {
 *     console.log('Panel event:', event, data);
 *   });
 */
export function useIDEEventPrefix(
  prefix: string,
  handler: WildcardHandler,
): void {
  const bus = useEventBus();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const disposable = bus.onPrefix(prefix, (event, data) => {
      handlerRef.current(event, data);
    });

    return () => disposable.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, prefix]);
}
