'use client';

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// IndexedDB wrapper for panel state persistence
//
// Database: 'contextdna-ide'
// Object stores:
//   - layouts       — named layout configurations (serialized dockview state)
//   - panel-state   — per-panel state (scroll position, form values, etc.)
//   - crash-recover — auto-saved state for crash recovery
// ---------------------------------------------------------------------------

const DB_NAME = 'contextdna-ide';
const DB_VERSION = 1;

const STORE_LAYOUTS = 'layouts';
const STORE_PANEL_STATE = 'panel-state';
const STORE_CRASH = 'crash-recover';

/** Auto-save interval for crash recovery (ms). */
const AUTO_SAVE_INTERVAL = 30_000;

/** Key used for the crash recovery entry. */
const CRASH_KEY = '__crash_recovery__';
const CRASH_DIRTY_KEY = '__crash_dirty__';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NamedLayout {
  name: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface PanelStateEntry<T = unknown> {
  panelId: string;
  state: T;
  updatedAt: number;
}

export interface CrashRecoveryEntry {
  layoutData: unknown;
  panelStates: Record<string, unknown>;
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_LAYOUTS)) {
        db.createObjectStore(STORE_LAYOUTS, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(STORE_PANEL_STATE)) {
        db.createObjectStore(STORE_PANEL_STATE, { keyPath: 'panelId' });
      }
      if (!db.objectStoreNames.contains(STORE_CRASH)) {
        db.createObjectStore(STORE_CRASH);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      _dbPromise = null;
      reject(request.error);
    };
  });

  return _dbPromise;
}

// ---------------------------------------------------------------------------
// Generic IDB helpers
// ---------------------------------------------------------------------------

async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  try {
    const db = await openDB();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbPut(storeName: string, value: unknown, key?: IDBValidKey): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = key !== undefined ? store.put(value, key) : store.put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB not available — degrade silently
  }
}

async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // silent
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// PanelStore — singleton managing all panel state persistence
// ---------------------------------------------------------------------------

type PanelStoreListener = () => void;

class PanelStore {
  private static _instance: PanelStore | null = null;

  // In-memory cache of panel states (avoids async reads on every render)
  private cache = new Map<string, unknown>();
  private listeners = new Set<PanelStoreListener>();
  private version = 0;

  // Layout getter for crash recovery
  private layoutGetter: (() => unknown) | null = null;

  // Auto-save timer
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  static getInstance(): PanelStore {
    if (!PanelStore._instance) {
      PanelStore._instance = new PanelStore();
    }
    return PanelStore._instance;
  }

  // -----------------------------------------------------------------------
  // Panel state CRUD
  // -----------------------------------------------------------------------

  get<T>(panelId: string): T | undefined {
    return this.cache.get(panelId) as T | undefined;
  }

  set<T>(panelId: string, state: T): void {
    this.cache.set(panelId, state);
    this.dirty = true;
    this.version++;
    this.notify();

    // Persist to IndexedDB (fire-and-forget)
    const entry: PanelStateEntry<T> = {
      panelId,
      state,
      updatedAt: Date.now(),
    };
    idbPut(STORE_PANEL_STATE, entry);
  }

  remove(panelId: string): void {
    if (!this.cache.has(panelId)) return;
    this.cache.delete(panelId);
    this.version++;
    this.notify();
    idbDelete(STORE_PANEL_STATE, panelId);
  }

  /** Load all panel states from IndexedDB into memory cache. */
  async hydrate(): Promise<void> {
    const entries = await idbGetAll<PanelStateEntry>(STORE_PANEL_STATE);
    for (const entry of entries) {
      this.cache.set(entry.panelId, entry.state);
    }
    this.version++;
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Layout persistence
  // -----------------------------------------------------------------------

  async saveLayout(name: string, data: unknown): Promise<void> {
    const entry: NamedLayout = {
      name,
      data,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Check if layout already exists (preserve createdAt)
    const existing = await idbGet<NamedLayout>(STORE_LAYOUTS, name);
    if (existing) {
      entry.createdAt = existing.createdAt;
    }

    await idbPut(STORE_LAYOUTS, entry);
  }

  async loadLayout(name: string): Promise<unknown | undefined> {
    const entry = await idbGet<NamedLayout>(STORE_LAYOUTS, name);
    return entry?.data;
  }

  async deleteLayout(name: string): Promise<void> {
    await idbDelete(STORE_LAYOUTS, name);
  }

  async listLayouts(): Promise<NamedLayout[]> {
    return idbGetAll<NamedLayout>(STORE_LAYOUTS);
  }

  // -----------------------------------------------------------------------
  // Crash recovery
  // -----------------------------------------------------------------------

  /** Register a function that returns the current layout serialization. */
  setLayoutGetter(getter: () => unknown): void {
    this.layoutGetter = getter;
  }

  /** Save current state for crash recovery. */
  async saveCrashState(): Promise<void> {
    const layoutData = this.layoutGetter ? this.layoutGetter() : null;
    const panelStates: Record<string, unknown> = {};
    for (const [id, state] of this.cache) {
      panelStates[id] = state;
    }

    const entry: CrashRecoveryEntry = {
      layoutData,
      panelStates,
      savedAt: Date.now(),
    };

    await idbPut(STORE_CRASH, entry, CRASH_KEY);
    await idbPut(STORE_CRASH, true, CRASH_DIRTY_KEY);
    this.dirty = false;
  }

  /** Check if there's a crash recovery state available. */
  async hasCrashState(): Promise<boolean> {
    const dirty = await idbGet<boolean>(STORE_CRASH, CRASH_DIRTY_KEY);
    return dirty === true;
  }

  /** Load crash recovery state. */
  async loadCrashState(): Promise<CrashRecoveryEntry | undefined> {
    return idbGet<CrashRecoveryEntry>(STORE_CRASH, CRASH_KEY);
  }

  /** Clear crash recovery state (call after successful restore or discard). */
  async clearCrashState(): Promise<void> {
    await idbDelete(STORE_CRASH, CRASH_DIRTY_KEY);
  }

  // -----------------------------------------------------------------------
  // Auto-save lifecycle
  // -----------------------------------------------------------------------

  startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      if (this.dirty) {
        this.saveCrashState();
      }
    }, AUTO_SAVE_INTERVAL);

    // Also save on beforeunload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  private handleBeforeUnload = (): void => {
    // Synchronous save attempt — IndexedDB transactions may survive unload
    if (this.dirty) {
      this.saveCrashState();
    }
  };

  // -----------------------------------------------------------------------
  // useSyncExternalStore support
  // -----------------------------------------------------------------------

  subscribe(listener: PanelStoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getVersion(): number {
    return this.version;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

export function getPanelStore(): PanelStore {
  return PanelStore.getInstance();
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * Persist and restore per-panel state via IndexedDB.
 *
 * Usage:
 *   const [scrollY, setScrollY] = usePanelState<number>('explorer', 0);
 *   // scrollY persists across page reloads and crash recovery
 */
export function usePanelState<T>(
  panelId: string,
  defaultState: T,
): [T, (state: T) => void] {
  const store = getPanelStore();

  const state = useSyncExternalStore(
    useCallback((cb: () => void) => store.subscribe(cb), [store]),
    () => store.get<T>(panelId) ?? defaultState,
    () => defaultState,
  );

  const setState = useCallback(
    (newState: T) => {
      store.set(panelId, newState);
    },
    [store, panelId],
  );

  return [state, setState];
}

/**
 * Initialize panel lifecycle: hydrate from IndexedDB, start auto-save,
 * and optionally restore crash recovery state.
 *
 * Call ONCE in your root layout/shell.
 *
 * Usage:
 *   function IDEShell() {
 *     const { hasCrashRecovery, restoreCrash, discardCrash } = usePanelLifecycle();
 *
 *     if (hasCrashRecovery) {
 *       return <CrashRecoveryPrompt onRestore={restoreCrash} onDiscard={discardCrash} />;
 *     }
 *
 *     return <DockviewReact ... />;
 *   }
 */
export function usePanelLifecycle(): {
  ready: boolean;
  hasCrashRecovery: boolean;
  restoreCrash: () => Promise<CrashRecoveryEntry | undefined>;
  discardCrash: () => Promise<void>;
} {
  const store = getPanelStore();
  const readyRef = useRef(false);
  const crashRef = useRef(false);
  const forceUpdate = useRef(0);

  // Subscribe to force re-renders
  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );

  const getSnapshot = useCallback(() => {
    return {
      ready: readyRef.current,
      hasCrash: crashRef.current,
      v: forceUpdate.current,
    };
  }, []);

  const snap = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => ({ ready: false, hasCrash: false, v: 0 }),
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Hydrate panel states from IndexedDB
      await store.hydrate();

      // Check for crash recovery
      const hasCrash = await store.hasCrashState();

      if (!cancelled) {
        readyRef.current = true;
        crashRef.current = hasCrash;
        forceUpdate.current++;
        // Trigger re-render through the store's notify
        store.set('__lifecycle_ready__', true);
        store.remove('__lifecycle_ready__');
      }

      // Start auto-save
      store.startAutoSave();
    }

    init();

    return () => {
      cancelled = true;
      store.stopAutoSave();
    };
  }, [store]);

  const restoreCrash = useCallback(async () => {
    const entry = await store.loadCrashState();
    await store.clearCrashState();
    crashRef.current = false;
    return entry;
  }, [store]);

  const discardCrash = useCallback(async () => {
    await store.clearCrashState();
    crashRef.current = false;
  }, [store]);

  return {
    ready: snap.ready,
    hasCrashRecovery: snap.hasCrash,
    restoreCrash,
    discardCrash,
  };
}

/**
 * Hook for dockview layout persistence. Connects layout serialization
 * to the PanelStore for crash recovery and named layout save/load.
 *
 * Usage:
 *   function IDEShell() {
 *     const apiRef = useRef<DockviewApi>(null);
 *     useLayoutPersistence(apiRef);
 *
 *     return <DockviewReact onReady={(e) => { apiRef.current = e.api; }} />;
 *   }
 */
export function useLayoutPersistence(
  apiRef: React.RefObject<{ toJSON(): unknown } | null>,
): {
  saveLayout: (name: string) => Promise<void>;
  loadLayout: (name: string) => Promise<unknown | undefined>;
  deleteLayout: (name: string) => Promise<void>;
  listLayouts: () => Promise<NamedLayout[]>;
} {
  const store = getPanelStore();

  // Register layout getter for crash recovery
  useEffect(() => {
    store.setLayoutGetter(() => {
      if (apiRef.current) {
        try {
          return apiRef.current.toJSON();
        } catch {
          return null;
        }
      }
      return null;
    });

    return () => store.setLayoutGetter(null!);
  }, [store, apiRef]);

  const saveLayout = useCallback(
    async (name: string) => {
      if (!apiRef.current) return;
      const data = apiRef.current.toJSON();
      await store.saveLayout(name, data);
    },
    [store, apiRef],
  );

  const loadLayout = useCallback(
    (name: string) => store.loadLayout(name),
    [store],
  );

  const deleteLayout = useCallback(
    (name: string) => store.deleteLayout(name),
    [store],
  );

  const listLayouts = useCallback(
    () => store.listLayouts(),
    [store],
  );

  return { saveLayout, loadLayout, deleteLayout, listLayouts };
}
