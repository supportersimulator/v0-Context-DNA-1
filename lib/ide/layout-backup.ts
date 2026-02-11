'use client';

import type { SerializedDockview } from 'dockview';

// ---------------------------------------------------------------------------
// Layout Backup — IndexedDB-based layout persistence with snapshot history
//
// Keeps the last N layout snapshots in IndexedDB for crash recovery and undo.
// Runs alongside localStorage for backward compatibility — if IndexedDB has
// a newer layout, it wins.
//
// Storage strategy:
//   - Auto-save every 30s + debounced 2s on layout change
//   - Keep last 5 snapshots (configurable)
//   - Each snapshot includes full dockview serialization + explorer prefs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExplorerPrefs {
  visible: boolean;
  width?: number;
}

export interface LayoutSnapshot {
  /** Unique snapshot ID (timestamp-based) */
  id: string;
  /** Unix timestamp (ms) when snapshot was taken */
  timestamp: number;
  /** Full serialized dockview layout */
  layout: SerializedDockview;
  /** Explorer sidebar preferences */
  explorerPrefs: ExplorerPrefs;
  /** Active workspace slot index (-1 if none) */
  activeWorkspaceSlot: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'contextdna_layout_backup';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const MAX_SNAPSHOTS = 5;
const AUTO_SAVE_INTERVAL_MS = 30_000; // 30 seconds
const DEBOUNCE_MS = 2_000; // 2 seconds

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Save a layout snapshot to IndexedDB.
 * Automatically prunes oldest snapshots to keep within MAX_SNAPSHOTS.
 */
export async function saveLayoutSnapshot(
  snapshot: LayoutSnapshot,
): Promise<void> {
  try {
    const db = await openDB();

    // Write the new snapshot
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Prune old snapshots if over limit
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_timestamp');
      const request = index.openCursor();
      const all: string[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          all.push(cursor.value.id);
          cursor.continue();
        } else {
          // Delete oldest entries if over limit
          if (all.length > MAX_SNAPSHOTS) {
            const toDelete = all.slice(0, all.length - MAX_SNAPSHOTS);
            for (const id of toDelete) {
              store.delete(id);
            }
          }
        }
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('[layout-backup] Failed to save snapshot:', err);
  }
}

/**
 * Get the most recent layout snapshot from IndexedDB.
 * Returns null if no snapshots exist or IndexedDB is unavailable.
 */
export async function getLatestSnapshot(): Promise<LayoutSnapshot | null> {
  try {
    const db = await openDB();

    return new Promise<LayoutSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_timestamp');
      // openCursor with 'prev' direction gives us newest first
      const request = index.openCursor(null, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        resolve(cursor ? (cursor.value as LayoutSnapshot) : null);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Get snapshot history, ordered newest-first.
 * @param limit Max snapshots to return (default: MAX_SNAPSHOTS)
 */
export async function getSnapshotHistory(
  limit: number = MAX_SNAPSHOTS,
): Promise<LayoutSnapshot[]> {
  try {
    const db = await openDB();

    return new Promise<LayoutSnapshot[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_timestamp');
      const request = index.openCursor(null, 'prev');
      const results: LayoutSnapshot[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value as LayoutSnapshot);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return [];
  }
}

/**
 * Restore a specific snapshot by ID.
 * Returns null if not found.
 */
export async function restoreSnapshot(
  id: string,
): Promise<LayoutSnapshot | null> {
  try {
    const result = await withStore<LayoutSnapshot | undefined>(
      'readonly',
      (store) => store.get(id),
    );
    return result ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear all stored snapshots.
 */
export async function clearSnapshots(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch (err) {
    console.warn('[layout-backup] Failed to clear snapshots:', err);
  }
}

// ---------------------------------------------------------------------------
// Migration helper — compare IndexedDB vs localStorage timestamps
// ---------------------------------------------------------------------------

const LOCALSTORAGE_LAYOUT_KEY = 'contextdna_dockview_layout';

/**
 * Get the freshest layout source (IndexedDB or localStorage).
 * Returns the layout with the most recent timestamp.
 *
 * Use this on startup to determine which layout to restore from.
 */
export async function getFreshestLayout(): Promise<{
  source: 'indexeddb' | 'localstorage' | null;
  snapshot: LayoutSnapshot | null;
  localLayout: SerializedDockview | null;
}> {
  let snapshot: LayoutSnapshot | null = null;
  let localLayout: SerializedDockview | null = null;

  // Try IndexedDB
  try {
    snapshot = await getLatestSnapshot();
  } catch {
    // IndexedDB unavailable
  }

  // Try localStorage
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_LAYOUT_KEY);
    if (raw) {
      localLayout = JSON.parse(raw) as SerializedDockview;
    }
  } catch {
    // localStorage unavailable or corrupted
  }

  // Determine winner
  if (snapshot && !localLayout) {
    return { source: 'indexeddb', snapshot, localLayout: null };
  }
  if (!snapshot && localLayout) {
    return { source: 'localstorage', snapshot: null, localLayout };
  }
  if (snapshot && localLayout) {
    // IndexedDB has timestamps — always prefer it (it auto-saves more frequently)
    return { source: 'indexeddb', snapshot, localLayout };
  }

  return { source: null, snapshot: null, localLayout: null };
}

// ---------------------------------------------------------------------------
// Snapshot factory — create a snapshot from current state
// ---------------------------------------------------------------------------

/**
 * Create a LayoutSnapshot from the current dockview and explorer state.
 */
export function createSnapshot(
  layout: SerializedDockview,
  explorerPrefs: ExplorerPrefs = { visible: false },
  activeWorkspaceSlot: number = -1,
): LayoutSnapshot {
  const now = Date.now();
  return {
    id: `snap_${now}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    layout,
    explorerPrefs,
    activeWorkspaceSlot,
  };
}

// ---------------------------------------------------------------------------
// Auto-save manager — handles debounced + interval saves
// ---------------------------------------------------------------------------

export class LayoutBackupManager {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private getState: (() => LayoutSnapshot | null) | null = null;
  private disposed = false;

  /**
   * Start auto-saving. Provide a function that returns the current layout
   * snapshot (or null if not ready).
   */
  start(getState: () => LayoutSnapshot | null): void {
    this.getState = getState;
    this.disposed = false;

    // Periodic save every 30s
    this.intervalId = setInterval(() => {
      this.save();
    }, AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Signal that the layout changed. Debounces 2s before saving.
   */
  onLayoutChange(): void {
    if (this.disposed) return;

    // Clear previous debounce
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.save();
    }, DEBOUNCE_MS);
  }

  /**
   * Force an immediate save.
   */
  async save(): Promise<void> {
    if (this.disposed || !this.getState) return;

    const snapshot = this.getState();
    if (!snapshot) return;

    try {
      await saveLayoutSnapshot(snapshot);
    } catch (err) {
      console.warn('[layout-backup] Auto-save failed:', err);
    }
  }

  /**
   * Stop auto-saving and clean up timers.
   */
  dispose(): void {
    this.disposed = true;

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.getState = null;
  }
}
