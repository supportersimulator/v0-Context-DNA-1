// =============================================================================
// capability-bus.ts — Cross-Panel Capability Bus
//
// Extends the IDE EventBus with typed cross-panel events, shared entities,
// and action dispatching. This is the "nervous system" that lets panels
// talk to each other without hard-coupling.
//
// Key difference from EventBus:
//   EventBus  = IDE-internal events (panel:opened, theme:changed)
//   CapBus    = Integration events (build.completed, deploy.ready, crash.spike)
//
// Panels publish capabilities and subscribe to triggers:
//   GitHub panel publishes: commit.merged(main)
//   EAS panel subscribes  → triggers eas.build(prod)
//   On success, EAS publishes: eas.build.ready
//   TestFlight panel subscribes → submit to TestFlight
// =============================================================================

import type { Disposable } from './event-bus';
import type {
  CapabilityEvents,
  CapabilityEventType,
  SharedEntities,
  EntityType,
} from './integration-manifest';

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

type CapHandler<K extends CapabilityEventType> = (data: CapabilityEvents[K]) => void;
type WildcardCapHandler = (event: string, data: unknown) => void;

// ---------------------------------------------------------------------------
// Action Request — dispatched between panels
// ---------------------------------------------------------------------------

export interface ActionRequest {
  id: string;
  sourcePanel: string;
  targetProvider: string;
  actionId: string;
  params: Record<string, unknown>;
  timestamp: number;
}

export interface ActionResult {
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  timestamp: number;
}

type ActionHandler = (request: ActionRequest) => Promise<ActionResult>;

// ---------------------------------------------------------------------------
// Entity Store — shared entity state between panels
// ---------------------------------------------------------------------------

type EntityStoreEntry<T extends EntityType = EntityType> = {
  type: T;
  data: SharedEntities[T];
  source: string;      // provider ID that set it
  timestamp: number;
};

// ---------------------------------------------------------------------------
// CapabilityBus
// ---------------------------------------------------------------------------

export class CapabilityBus {
  private handlers = new Map<CapabilityEventType, Set<CapHandler<never>>>();
  private wildcardHandlers = new Set<WildcardCapHandler>();
  private actionHandlers = new Map<string, ActionHandler>();
  private entityStore = new Map<string, EntityStoreEntry>();
  private eventLog: Array<{ event: string; data: unknown; timestamp: number }> = [];
  private maxLog = 100;
  private disposed = false;

  // -----------------------------------------------------------------------
  // Event subscription
  // -----------------------------------------------------------------------

  on<K extends CapabilityEventType>(
    event: K,
    handler: CapHandler<K>,
  ): Disposable {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as CapHandler<never>);
    return {
      dispose: () => {
        set!.delete(handler as CapHandler<never>);
        if (set!.size === 0) this.handlers.delete(event);
      },
    };
  }

  once<K extends CapabilityEventType>(
    event: K,
    handler: CapHandler<K>,
  ): Disposable {
    const d = this.on(event, ((data: CapabilityEvents[K]) => {
      d.dispose();
      handler(data);
    }) as CapHandler<K>);
    return d;
  }

  onAny(handler: WildcardCapHandler): Disposable {
    this.wildcardHandlers.add(handler);
    return { dispose: () => this.wildcardHandlers.delete(handler) };
  }

  // -----------------------------------------------------------------------
  // Event emission
  // -----------------------------------------------------------------------

  emit<K extends CapabilityEventType>(event: K, data: CapabilityEvents[K]): void {
    if (this.disposed) return;

    // Log
    this.eventLog.push({ event, data, timestamp: Date.now() });
    if (this.eventLog.length > this.maxLog) this.eventLog.shift();

    // Exact handlers
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of Array.from(set)) {
        try {
          (handler as CapHandler<K>)(data);
        } catch (err) {
          console.error(`[CapBus] Handler error for "${event}":`, err);
        }
      }
    }

    // Wildcard
    for (const handler of Array.from(this.wildcardHandlers)) {
      try {
        handler(event, data);
      } catch (err) {
        console.error('[CapBus] Wildcard handler error:', err);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Action dispatch — request/response between panels
  // -----------------------------------------------------------------------

  registerAction(providerId: string, actionId: string, handler: ActionHandler): Disposable {
    const key = `${providerId}:${actionId}`;
    this.actionHandlers.set(key, handler);
    return { dispose: () => this.actionHandlers.delete(key) };
  }

  async dispatchAction(request: Omit<ActionRequest, 'id' | 'timestamp'>): Promise<ActionResult> {
    const fullRequest: ActionRequest = {
      ...request,
      id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };

    const key = `${request.targetProvider}:${request.actionId}`;
    const handler = this.actionHandlers.get(key);

    if (!handler) {
      return {
        requestId: fullRequest.id,
        ok: false,
        error: `No handler for action ${key}`,
        timestamp: Date.now(),
      };
    }

    try {
      return await handler(fullRequest);
    } catch (err) {
      return {
        requestId: fullRequest.id,
        ok: false,
        error: err instanceof Error ? err.message : 'Action failed',
        timestamp: Date.now(),
      };
    }
  }

  // -----------------------------------------------------------------------
  // Entity Store — shared state between panels
  // -----------------------------------------------------------------------

  setEntity<T extends EntityType>(
    type: T,
    key: string,
    data: SharedEntities[T],
    source: string,
  ): void {
    this.entityStore.set(`${type}:${key}`, {
      type,
      data,
      source,
      timestamp: Date.now(),
    });
  }

  getEntity<T extends EntityType>(
    type: T,
    key: string,
  ): SharedEntities[T] | undefined {
    const entry = this.entityStore.get(`${type}:${key}`);
    if (!entry || entry.type !== type) return undefined;
    return entry.data as SharedEntities[T];
  }

  listEntities<T extends EntityType>(type: T): Array<{ key: string; data: SharedEntities[T]; source: string }> {
    const result: Array<{ key: string; data: SharedEntities[T]; source: string }> = [];
    const prefix = `${type}:`;
    for (const [fullKey, entry] of this.entityStore) {
      if (fullKey.startsWith(prefix)) {
        result.push({
          key: fullKey.slice(prefix.length),
          data: entry.data as SharedEntities[T],
          source: entry.source,
        });
      }
    }
    return result;
  }

  // -----------------------------------------------------------------------
  // Event log (for debugging / timeline panel)
  // -----------------------------------------------------------------------

  getEventLog(): Array<{ event: string; data: unknown; timestamp: number }> {
    return [...this.eventLog];
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  dispose(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
    this.actionHandlers.clear();
    this.entityStore.clear();
    this.eventLog.length = 0;
    this.disposed = true;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _capBus: CapabilityBus | null = null;

export function getCapabilityBus(): CapabilityBus {
  if (!_capBus) {
    _capBus = new CapabilityBus();

    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      _capBus.onAny((event, data) => {
        console.debug(
          `%c[CapBus] %c${event}`,
          'color: #6b6b75; font-weight: bold',
          'color: #e5c07b; font-weight: bold',
          data,
        );
      });
    }
  }
  return _capBus;
}

export function _resetCapabilityBus(): void {
  if (_capBus) {
    _capBus.dispose();
    _capBus = null;
  }
}
