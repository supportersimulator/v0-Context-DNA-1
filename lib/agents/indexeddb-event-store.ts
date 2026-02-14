'use client';

// =============================================================================
// indexeddb-event-store.ts — IndexedDB-backed EventStore for ProjectDialogue
//
// Persists events to IndexedDB so they survive page refresh. Maintains an
// in-memory cache for synchronous getHistory/getRecent reads (required by the
// EventStore interface). Falls back to pure in-memory mode during SSR or when
// IndexedDB is unavailable.
//
// Follows the pattern established in lib/cache/config-cache.ts.
// Spec: Dashboard-Workspace-Live-Spec.md Section 10
// =============================================================================

import type {
  ProjectDialogueEvent,
  EventFilter,
  Unsubscribe,
} from './project-dialogue';
import type { EventStore } from './event-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'contextdna_project_dialogue';
const DB_VERSION = 1;
const STORE_EVENTS = 'events';

/** How often we prune IDB to maxHistory (ms). */
const PRUNE_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// IndexedDB promise helpers (same thin wrapper as config-cache.ts)
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, {
          keyPath: '_idb_id',
          autoIncrement: true,
        });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
        store.createIndex('by_type', 'type', { unique: false });
        store.createIndex('by_agent_id', 'agent_id', { unique: false });
      }
    };
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

// ---------------------------------------------------------------------------
// Subscription bookkeeping
// ---------------------------------------------------------------------------

interface Subscription {
  id: number;
  filter: EventFilter;
  callback: (event: ProjectDialogueEvent) => void;
}

let nextSubId = 0;

// ---------------------------------------------------------------------------
// IndexedDBEventStore
// ---------------------------------------------------------------------------

/**
 * EventStore backed by IndexedDB for browser persistence.
 *
 * - Synchronous reads served from an in-memory cache (loaded on init).
 * - Writes go to both in-memory cache and IDB (fire-and-forget persist).
 * - Ring buffer: prunes IDB periodically to stay under maxHistory.
 * - Graceful degradation: pure in-memory if IndexedDB is unavailable (SSR).
 */
export class IndexedDBEventStore implements EventStore {
  private cache: ProjectDialogueEvent[] = [];
  private subscriptions: Map<number, Subscription> = new Map();
  private maxHistory: number;
  private db: IDBDatabase | null = null;
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private memoryOnly = false;

  constructor(maxHistory = 500) {
    this.maxHistory = maxHistory;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.init();
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Whether the IDB backing store has finished loading. */
  isReady(): boolean {
    return this.ready;
  }

  /** Resolves once IDB init + cache hydration is complete. */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Tear down timers and close IDB connection. */
  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ---- EventStore interface ------------------------------------------------

  /** Emit an event: cache it, persist to IDB, notify subscribers. */
  emit(event: ProjectDialogueEvent): void {
    this.cache.push(event);
    this.trimCache();
    this.persistEvent(event);
    this.notifySubscribers(event);
  }

  /** Subscribe to events matching a filter. Returns unsubscribe function. */
  subscribe(
    filter: EventFilter,
    callback: (event: ProjectDialogueEvent) => void,
  ): Unsubscribe {
    const id = nextSubId++;
    this.subscriptions.set(id, { id, filter, callback });
    return () => {
      this.subscriptions.delete(id);
    };
  }

  /** Get events since a timestamp (synchronous, from cache). */
  getHistory(since: number): ProjectDialogueEvent[] {
    return this.cache.filter((e) => e.timestamp >= since);
  }

  /** Get the last N events (synchronous, from cache). */
  getRecent(count: number): ProjectDialogueEvent[] {
    return this.cache.slice(-count);
  }

  /** Clear all history (cache + IDB). */
  clear(): void {
    this.cache = [];
    this.clearIDB();
  }

  // ---- internal: init ------------------------------------------------------

  private async init(): Promise<void> {
    // SSR guard
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      this.memoryOnly = true;
      this.ready = true;
      this.readyResolve();
      return;
    }

    try {
      this.db = await openDB();
      await this.hydrateCache();
      this.pruneTimer = setInterval(() => this.pruneIDB(), PRUNE_INTERVAL_MS);
    } catch {
      // IndexedDB not available — degrade to memory-only
      this.memoryOnly = true;
    }

    this.ready = true;
    this.readyResolve();
  }

  /**
   * Load the most recent maxHistory events from IDB into the in-memory cache.
   * Uses the by_timestamp index in reverse order.
   */
  private async hydrateCache(): Promise<void> {
    if (!this.db) return;

    const events: ProjectDialogueEvent[] = await new Promise(
      (resolve, reject) => {
        const t = this.db!.transaction(STORE_EVENTS, 'readonly');
        const index = t.objectStore(STORE_EVENTS).index('by_timestamp');
        const results: ProjectDialogueEvent[] = [];

        const cursorReq = index.openCursor(null, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || results.length >= this.maxHistory) {
            resolve(results);
            return;
          }
          // Strip the IDB auto-increment key before caching
          const { _idb_id, ...event } = cursor.value as ProjectDialogueEvent & {
            _idb_id?: number;
          };
          results.push(event as ProjectDialogueEvent);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      },
    );

    // Reverse so oldest is first (cursor walked newest-first)
    this.cache = events.reverse();
  }

  // ---- internal: persist ---------------------------------------------------

  /** Fire-and-forget write of a single event to IDB. */
  private persistEvent(event: ProjectDialogueEvent): void {
    if (this.memoryOnly || !this.db) return;

    try {
      const t = this.db.transaction(STORE_EVENTS, 'readwrite');
      t.objectStore(STORE_EVENTS).add({ ...event });
      // No await — fire-and-forget for performance
    } catch {
      // IDB write failed — event is still in memory cache
    }
  }

  /** Clear all events from IDB. */
  private clearIDB(): void {
    if (this.memoryOnly || !this.db) return;

    try {
      const t = this.db.transaction(STORE_EVENTS, 'readwrite');
      t.objectStore(STORE_EVENTS).clear();
    } catch {
      // Swallow — cache is already cleared
    }
  }

  /**
   * Prune IDB to maxHistory events.
   * Counts total, then deletes oldest (total - maxHistory) via cursor.
   */
  private async pruneIDB(): Promise<void> {
    if (this.memoryOnly || !this.db) return;

    try {
      const t = this.db.transaction(STORE_EVENTS, 'readwrite');
      const store = t.objectStore(STORE_EVENTS);
      const total = await req<number>(store.count());

      if (total <= this.maxHistory) return;

      const deleteCount = total - this.maxHistory;
      let deleted = 0;

      await new Promise<void>((resolve, reject) => {
        const index = store.index('by_timestamp');
        const cursorReq = index.openCursor(null, 'next'); // oldest first
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || deleted >= deleteCount) {
            resolve();
            return;
          }
          cursor.delete();
          deleted++;
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });

      await txDone(t);
    } catch {
      // Prune failure is non-fatal — IDB just grows a bit until next cycle
    }
  }

  // ---- internal: subscriptions ---------------------------------------------

  private notifySubscribers(event: ProjectDialogueEvent): void {
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

  private matches(event: ProjectDialogueEvent, filter: EventFilter): boolean {
    if (filter.types && !filter.types.includes(event.type)) return false;
    if (filter.agent_ids && !filter.agent_ids.includes(event.agent_id))
      return false;
    if (filter.since && event.timestamp < filter.since) return false;
    return true;
  }

  // ---- internal: cache management ------------------------------------------

  private trimCache(): void {
    if (this.cache.length > this.maxHistory) {
      this.cache = this.cache.slice(-this.maxHistory);
    }
  }
}
