// =============================================================================
// project-dialogue.ts — ProjectDialogue EventStore (Lite mode)
//
// Shared event stream for agent coordination. All agents read/write to the same
// stream. Lite mode uses in-process pub/sub (no Redis, no SQLite).
//
// Spec: Dashboard-Workspace-Live-Plans.md Section 5.4
// =============================================================================

import type { EventStore } from './event-store';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type ProjectDialogueEventType =
  | 'user_message'
  | 'agent_response'
  | 'file_change'
  | 'test_result'
  | 'plan_update'
  | 'context_handoff'
  | 'agent_status';

export interface ProjectDialogueEvent {
  type: ProjectDialogueEventType;
  agent_id: string;
  timestamp: number;
  payload: unknown;
}

export interface EventFilter {
  types?: ProjectDialogueEventType[];
  agent_ids?: string[];
  since?: number;
}

export type Unsubscribe = () => void;

type EventCallback = (event: ProjectDialogueEvent) => void;

// ---------------------------------------------------------------------------
// ProjectDialogueStore — In-memory EventStore (Lite mode)
// ---------------------------------------------------------------------------

interface Subscription {
  id: number;
  filter: EventFilter;
  callback: EventCallback;
}

let nextSubId = 0;

class ProjectDialogueStore implements EventStore {
  private history: ProjectDialogueEvent[] = [];
  private subscriptions: Map<number, Subscription> = new Map();
  private maxHistory: number;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
  }

  /** Emit an event to all matching subscribers and append to history. */
  emit(event: ProjectDialogueEvent): void {
    this.history.push(event);
    // Bounded ring: drop oldest when over limit
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    for (const sub of this.subscriptions.values()) {
      if (this.matches(event, sub.filter)) {
        try {
          sub.callback(event);
        } catch {
          // Subscriber errors don't break the bus
        }
      }
    }
  }

  /** Subscribe to events matching a filter. Returns an unsubscribe function. */
  subscribe(filter: EventFilter, callback: EventCallback): Unsubscribe {
    const id = nextSubId++;
    this.subscriptions.set(id, { id, filter, callback });
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /** Get history since a timestamp. */
  getHistory(since: number): ProjectDialogueEvent[] {
    return this.history.filter((e) => e.timestamp >= since);
  }

  /** Get the last N events (most recent first). */
  getRecent(count: number): ProjectDialogueEvent[] {
    return this.history.slice(-count);
  }

  /** Clear all history (testing / reset). */
  clear(): void {
    this.history = [];
  }

  // ---- internal ----

  private matches(event: ProjectDialogueEvent, filter: EventFilter): boolean {
    if (filter.types && !filter.types.includes(event.type)) return false;
    if (filter.agent_ids && !filter.agent_ids.includes(event.agent_id)) return false;
    if (filter.since && event.timestamp < filter.since) return false;
    return true;
  }
}

// ---------------------------------------------------------------------------
// In-memory singleton factory (used by createEventStore for 'memory' mode)
// ---------------------------------------------------------------------------

let inMemoryInstance: ProjectDialogueStore | null = null;

/**
 * Get (or create) the in-memory ProjectDialogueStore singleton.
 * Called by createEventStore() in event-store.ts for 'memory' mode.
 */
export function getInMemoryStore(maxHistory = 500): EventStore {
  if (!inMemoryInstance) {
    inMemoryInstance = new ProjectDialogueStore(maxHistory);
  }
  return inMemoryInstance;
}

// ---------------------------------------------------------------------------
// Singleton — one store per app (delegates to createEventStore)
// ---------------------------------------------------------------------------

let instance: EventStore | null = null;
let instancePromise: Promise<EventStore> | null = null;

/**
 * Get the ProjectDialogue singleton.
 *
 * On first call, reads config from event-store.ts and creates the appropriate
 * backend (memory or IndexedDB). Returns synchronously if already initialized,
 * otherwise returns the in-memory store immediately and upgrades in background
 * when a persistent backend finishes loading.
 */
export function getProjectDialogue(): EventStore {
  if (instance) return instance;

  // Start async creation if not already in flight
  if (!instancePromise) {
    // Return in-memory immediately for synchronous callers
    instance = new ProjectDialogueStore();

    instancePromise = (async () => {
      const { createEventStore } = await import('./event-store');
      const store = await createEventStore();
      instance = store;
      return store;
    })();

    // If createEventStore fails, keep the in-memory fallback
    instancePromise.catch(() => {});
  }

  // Always return something synchronously (in-memory until upgrade completes)
  return instance!;
}

/**
 * Async version — awaits full initialization including IDB hydration.
 * Prefer this in useEffect or other async contexts.
 */
export async function getProjectDialogueAsync(): Promise<EventStore> {
  if (instance && instancePromise) {
    return instancePromise;
  }
  // Trigger init via sync path, then await the promise
  getProjectDialogue();
  return instancePromise!;
}

export type { ProjectDialogueStore };
