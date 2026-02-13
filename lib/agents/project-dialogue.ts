// =============================================================================
// project-dialogue.ts — ProjectDialogue EventStore (Lite mode)
//
// Shared event stream for agent coordination. All agents read/write to the same
// stream. Lite mode uses in-process pub/sub (no Redis, no SQLite).
//
// Spec: Dashboard-Workspace-Live-Plans.md Section 5.4
// =============================================================================

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
// EventStore — Lite mode (in-process pub/sub, bounded history)
// ---------------------------------------------------------------------------

const MAX_HISTORY = 500;

interface Subscription {
  id: number;
  filter: EventFilter;
  callback: EventCallback;
}

let nextSubId = 0;

class ProjectDialogueStore {
  private history: ProjectDialogueEvent[] = [];
  private subscriptions: Map<number, Subscription> = new Map();

  /** Emit an event to all matching subscribers and append to history. */
  emit(event: ProjectDialogueEvent): void {
    this.history.push(event);
    // Bounded ring: drop oldest when over limit
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
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
// Singleton — one store per app
// ---------------------------------------------------------------------------

let instance: ProjectDialogueStore | null = null;

export function getProjectDialogue(): ProjectDialogueStore {
  if (!instance) {
    instance = new ProjectDialogueStore();
  }
  return instance;
}

export type { ProjectDialogueStore };
