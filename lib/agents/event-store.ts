// =============================================================================
// event-store.ts — EventStore Interface Abstraction
//
// Defines the contract for ProjectDialogue backends.
// Current: InMemoryEventStore (in project-dialogue.ts)
// Future: SQLiteEventStore, RedisEventStore
//
// Spec: Dashboard-Workspace-Live-Spec.md Section 10
// =============================================================================

import type { ProjectDialogueEvent, EventFilter, Unsubscribe } from './project-dialogue';

// ---------------------------------------------------------------------------
// Interface — all backends must implement this
// ---------------------------------------------------------------------------

export interface EventStore {
  /** Emit an event to all matching subscribers and persist. */
  emit(event: ProjectDialogueEvent): void;

  /** Subscribe to events matching a filter. */
  subscribe(filter: EventFilter, callback: (event: ProjectDialogueEvent) => void): Unsubscribe;

  /** Get events since a timestamp. */
  getHistory(since: number): ProjectDialogueEvent[];

  /** Get the last N events (most recent). */
  getRecent(count: number): ProjectDialogueEvent[];

  /** Clear all history. */
  clear(): void;
}

// ---------------------------------------------------------------------------
// EventStore mode
// ---------------------------------------------------------------------------

export type EventStoreMode = 'memory' | 'sqlite' | 'redis';

export interface EventStoreConfig {
  mode: EventStoreMode;
  /** Max events to retain (ring buffer). Default: 500 */
  maxHistory?: number;
  /** SQLite database path (sqlite mode only) */
  dbPath?: string;
  /** Redis URL (redis mode only) */
  redisUrl?: string;
}

// ---------------------------------------------------------------------------
// Factory — creates the right backend based on config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: EventStoreConfig = {
  mode: 'memory',
  maxHistory: 500,
};

let currentConfig: EventStoreConfig = DEFAULT_CONFIG;

/**
 * Configure the EventStore backend.
 * Must be called before first getProjectDialogue() if changing from default.
 */
export function configureEventStore(config: Partial<EventStoreConfig>): void {
  currentConfig = { ...DEFAULT_CONFIG, ...config };
}

/**
 * Get the current EventStore configuration.
 */
export function getEventStoreConfig(): Readonly<EventStoreConfig> {
  return currentConfig;
}

/**
 * Check if current mode supports persistence.
 */
export function isEventStorePersistent(): boolean {
  return currentConfig.mode !== 'memory';
}

// ---------------------------------------------------------------------------
// Factory — instantiates the correct backend
// ---------------------------------------------------------------------------

/**
 * Create an EventStore instance based on current config.
 *
 * - 'memory' → ProjectDialogueStore (in-process, no persistence)
 * - 'sqlite' → IndexedDBEventStore (browser IndexedDB persistence)
 * - 'redis'  → not yet implemented, falls back to memory
 *
 * Import is dynamic to avoid pulling IndexedDB code into SSR bundles.
 */
export async function createEventStore(): Promise<EventStore> {
  const config = getEventStoreConfig();
  const maxHistory = config.maxHistory ?? 500;

  if (config.mode === 'sqlite') {
    // Dynamic import — keeps IndexedDB code out of server bundles
    const { IndexedDBEventStore } = await import('./indexeddb-event-store');
    const store = new IndexedDBEventStore(maxHistory);
    await store.whenReady();
    return store;
  }

  // Default: in-memory (also covers 'redis' until implemented)
  const { getInMemoryStore } = await import('./project-dialogue');
  return getInMemoryStore(maxHistory);
}
