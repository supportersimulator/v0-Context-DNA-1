'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigPack {
  id: string;
  title: string;
  author: string;
  version: string;
  config_json: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  installed: boolean;
}

export interface BenchmarkSnapshot {
  id: string;
  suite_name: string;
  model: string;
  runtime: string;
  quantization: string;
  // Latency metrics
  ttft_p50_ms: number;
  ttft_p95_ms: number;
  decode_tok_s_avg: number;
  decode_tok_s_p95: number;
  end_to_end_p50_ms: number;
  end_to_end_p95_ms: number;
  // Resource usage (optional — not all runners report GPU)
  cpu_peak_pct?: number;
  ram_peak_mb?: number;
  gpu_peak_pct?: number;
  // Machine identity
  machine_profile_hash: string;
  run_hash: string;
  // Environment
  power_mode: string;
  os: string;
  chip_family: string;
  ram_total_gb: number;
  // Metadata
  results_json: Record<string, unknown>;
  created_at: number;
  shared: boolean;
}

export interface Integration {
  id: string;
  name: string;
  category: string;
  version: string;
  detected_at: number;
  config_json: Record<string, unknown>;
}

export interface UserPreference {
  key: string;
  value: unknown;
  updated_at: number;
}

export interface ConfigCacheExport {
  benchmarks: BenchmarkSnapshot[];
  config_packs: ConfigPack[];
  exported_at: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'contextdna_config_cache';
const DB_VERSION = 1;
const STORE_CONFIG_PACKS = 'config_packs';
const STORE_BENCHMARKS = 'benchmarks';
const STORE_INTEGRATIONS = 'integrations';
const STORE_USER_PREFERENCES = 'user_preferences';

// ---------------------------------------------------------------------------
// Thin IndexedDB promise wrapper (matches chat-store.ts pattern)
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;

      // config_packs
      if (!db.objectStoreNames.contains(STORE_CONFIG_PACKS)) {
        const packs = db.createObjectStore(STORE_CONFIG_PACKS, { keyPath: 'id' });
        packs.createIndex('by_updated', 'updated_at', { unique: false });
        packs.createIndex('by_installed', 'installed', { unique: false });
      }

      // benchmarks
      if (!db.objectStoreNames.contains(STORE_BENCHMARKS)) {
        const benchmarks = db.createObjectStore(STORE_BENCHMARKS, { keyPath: 'id' });
        benchmarks.createIndex('by_created', 'created_at', { unique: false });
        benchmarks.createIndex('by_suite_created', ['suite_name', 'created_at'], { unique: false });
        benchmarks.createIndex('by_model', 'model', { unique: false });
        benchmarks.createIndex('by_shared', 'shared', { unique: false });
      }

      // integrations
      if (!db.objectStoreNames.contains(STORE_INTEGRATIONS)) {
        const integrations = db.createObjectStore(STORE_INTEGRATIONS, { keyPath: 'id' });
        integrations.createIndex('by_category', 'category', { unique: false });
        integrations.createIndex('by_detected', 'detected_at', { unique: false });
      }

      // user_preferences
      if (!db.objectStoreNames.contains(STORE_USER_PREFERENCES)) {
        db.createObjectStore(STORE_USER_PREFERENCES, { keyPath: 'key' });
      }
    };
  });
}

function tx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
): IDBTransaction {
  return db.transaction(stores, mode);
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
// ConfigCacheStore (singleton)
// ---------------------------------------------------------------------------

export class ConfigCacheStore {
  private static instance: ConfigCacheStore | null = null;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): ConfigCacheStore {
    if (!ConfigCacheStore.instance) {
      ConfigCacheStore.instance = new ConfigCacheStore();
    }
    return ConfigCacheStore.instance;
  }

  // --- lifecycle -----------------------------------------------------------

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      this.db = await openDB();
    })();
    return this.initPromise;
  }

  private getDB(): IDBDatabase {
    if (!this.db) throw new Error('ConfigCacheStore not initialized — call init() first');
    return this.db;
  }

  // --- config packs --------------------------------------------------------

  async saveConfigPack(pack: Omit<ConfigPack, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<ConfigPack, 'id' | 'created_at' | 'updated_at'>>): Promise<ConfigPack> {
    const db = this.getDB();
    const now = Date.now();
    const record: ConfigPack = {
      id: pack.id ?? crypto.randomUUID(),
      title: pack.title,
      author: pack.author,
      version: pack.version,
      config_json: pack.config_json,
      created_at: pack.created_at ?? now,
      updated_at: now,
      installed: pack.installed,
    };
    const t = tx(db, STORE_CONFIG_PACKS, 'readwrite');
    t.objectStore(STORE_CONFIG_PACKS).put(record);
    await txDone(t);
    return record;
  }

  async getConfigPack(id: string): Promise<ConfigPack | null> {
    const db = this.getDB();
    const t = tx(db, STORE_CONFIG_PACKS, 'readonly');
    const result = await req<ConfigPack | undefined>(
      t.objectStore(STORE_CONFIG_PACKS).get(id),
    );
    return result ?? null;
  }

  async listConfigPacks(limit = 100): Promise<ConfigPack[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_CONFIG_PACKS, 'readonly');
      const index = t.objectStore(STORE_CONFIG_PACKS).index('by_updated');
      const results: ConfigPack[] = [];

      const cursorReq = index.openCursor(null, 'prev');
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        results.push(cursor.value as ConfigPack);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async listInstalledPacks(): Promise<ConfigPack[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_CONFIG_PACKS, 'readonly');
      const index = t.objectStore(STORE_CONFIG_PACKS).index('by_installed');
      const range = IDBKeyRange.only(1); // IndexedDB stores booleans; true coerces to 1
      const results: ConfigPack[] = [];

      // Fallback: scan all and filter, since boolean indexing is unreliable
      const cursorReq = t.objectStore(STORE_CONFIG_PACKS).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        const pack = cursor.value as ConfigPack;
        if (pack.installed) {
          results.push(pack);
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  async deleteConfigPack(id: string): Promise<void> {
    const db = this.getDB();
    const t = tx(db, STORE_CONFIG_PACKS, 'readwrite');
    t.objectStore(STORE_CONFIG_PACKS).delete(id);
    await txDone(t);
  }

  // --- benchmarks ----------------------------------------------------------

  async saveBenchmark(
    snapshot: Omit<BenchmarkSnapshot, 'id' | 'created_at'> & Partial<Pick<BenchmarkSnapshot, 'id' | 'created_at'>>,
  ): Promise<BenchmarkSnapshot> {
    const db = this.getDB();
    const record: BenchmarkSnapshot = {
      id: snapshot.id ?? crypto.randomUUID(),
      suite_name: snapshot.suite_name,
      model: snapshot.model,
      runtime: snapshot.runtime,
      quantization: snapshot.quantization,
      ttft_p50_ms: snapshot.ttft_p50_ms,
      ttft_p95_ms: snapshot.ttft_p95_ms,
      decode_tok_s_avg: snapshot.decode_tok_s_avg,
      decode_tok_s_p95: snapshot.decode_tok_s_p95,
      end_to_end_p50_ms: snapshot.end_to_end_p50_ms,
      end_to_end_p95_ms: snapshot.end_to_end_p95_ms,
      cpu_peak_pct: snapshot.cpu_peak_pct,
      ram_peak_mb: snapshot.ram_peak_mb,
      gpu_peak_pct: snapshot.gpu_peak_pct,
      machine_profile_hash: snapshot.machine_profile_hash,
      run_hash: snapshot.run_hash,
      power_mode: snapshot.power_mode,
      os: snapshot.os,
      chip_family: snapshot.chip_family,
      ram_total_gb: snapshot.ram_total_gb,
      results_json: snapshot.results_json,
      created_at: snapshot.created_at ?? Date.now(),
      shared: snapshot.shared,
    };
    const t = tx(db, STORE_BENCHMARKS, 'readwrite');
    t.objectStore(STORE_BENCHMARKS).put(record);
    await txDone(t);
    return record;
  }

  async getBenchmark(id: string): Promise<BenchmarkSnapshot | null> {
    const db = this.getDB();
    const t = tx(db, STORE_BENCHMARKS, 'readonly');
    const result = await req<BenchmarkSnapshot | undefined>(
      t.objectStore(STORE_BENCHMARKS).get(id),
    );
    return result ?? null;
  }

  async getLatestBenchmark(suiteName?: string): Promise<BenchmarkSnapshot | null> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_BENCHMARKS, 'readonly');

      if (suiteName) {
        // Use compound index to get latest for specific suite
        const index = t.objectStore(STORE_BENCHMARKS).index('by_suite_created');
        const range = IDBKeyRange.bound(
          [suiteName, 0],
          [suiteName, Number.MAX_SAFE_INTEGER],
        );
        const cursorReq = index.openCursor(range, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          resolve(cursor ? (cursor.value as BenchmarkSnapshot) : null);
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      } else {
        // Get latest across all suites
        const index = t.objectStore(STORE_BENCHMARKS).index('by_created');
        const cursorReq = index.openCursor(null, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          resolve(cursor ? (cursor.value as BenchmarkSnapshot) : null);
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      }
    });
  }

  async getBenchmarkHistory(limit = 50, suiteName?: string): Promise<BenchmarkSnapshot[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_BENCHMARKS, 'readonly');
      const results: BenchmarkSnapshot[] = [];

      if (suiteName) {
        const index = t.objectStore(STORE_BENCHMARKS).index('by_suite_created');
        const range = IDBKeyRange.bound(
          [suiteName, 0],
          [suiteName, Number.MAX_SAFE_INTEGER],
        );
        const cursorReq = index.openCursor(range, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          results.push(cursor.value as BenchmarkSnapshot);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      } else {
        const index = t.objectStore(STORE_BENCHMARKS).index('by_created');
        const cursorReq = index.openCursor(null, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || results.length >= limit) {
            resolve(results);
            return;
          }
          results.push(cursor.value as BenchmarkSnapshot);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      }
    });
  }

  async deleteBenchmark(id: string): Promise<void> {
    const db = this.getDB();
    const t = tx(db, STORE_BENCHMARKS, 'readwrite');
    t.objectStore(STORE_BENCHMARKS).delete(id);
    await txDone(t);
  }

  // --- integrations --------------------------------------------------------

  async saveIntegration(
    integration: Omit<Integration, 'id' | 'detected_at'> & Partial<Pick<Integration, 'id' | 'detected_at'>>,
  ): Promise<Integration> {
    const db = this.getDB();
    const record: Integration = {
      id: integration.id ?? crypto.randomUUID(),
      name: integration.name,
      category: integration.category,
      version: integration.version,
      detected_at: integration.detected_at ?? Date.now(),
      config_json: integration.config_json,
    };
    const t = tx(db, STORE_INTEGRATIONS, 'readwrite');
    t.objectStore(STORE_INTEGRATIONS).put(record);
    await txDone(t);
    return record;
  }

  async getIntegration(id: string): Promise<Integration | null> {
    const db = this.getDB();
    const t = tx(db, STORE_INTEGRATIONS, 'readonly');
    const result = await req<Integration | undefined>(
      t.objectStore(STORE_INTEGRATIONS).get(id),
    );
    return result ?? null;
  }

  async listIntegrations(category?: string): Promise<Integration[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_INTEGRATIONS, 'readonly');
      const results: Integration[] = [];

      if (category) {
        const index = t.objectStore(STORE_INTEGRATIONS).index('by_category');
        const range = IDBKeyRange.only(category);
        const cursorReq = index.openCursor(range);
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          results.push(cursor.value as Integration);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      } else {
        const index = t.objectStore(STORE_INTEGRATIONS).index('by_detected');
        const cursorReq = index.openCursor(null, 'prev');
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            resolve(results);
            return;
          }
          results.push(cursor.value as Integration);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      }
    });
  }

  async deleteIntegration(id: string): Promise<void> {
    const db = this.getDB();
    const t = tx(db, STORE_INTEGRATIONS, 'readwrite');
    t.objectStore(STORE_INTEGRATIONS).delete(id);
    await txDone(t);
  }

  // --- user preferences ----------------------------------------------------

  async setPreference(key: string, value: unknown): Promise<UserPreference> {
    const db = this.getDB();
    const record: UserPreference = {
      key,
      value,
      updated_at: Date.now(),
    };
    const t = tx(db, STORE_USER_PREFERENCES, 'readwrite');
    t.objectStore(STORE_USER_PREFERENCES).put(record);
    await txDone(t);
    return record;
  }

  async getPreference<T = unknown>(key: string): Promise<T | null> {
    const db = this.getDB();
    const t = tx(db, STORE_USER_PREFERENCES, 'readonly');
    const result = await req<UserPreference | undefined>(
      t.objectStore(STORE_USER_PREFERENCES).get(key),
    );
    return result ? (result.value as T) : null;
  }

  async deletePreference(key: string): Promise<void> {
    const db = this.getDB();
    const t = tx(db, STORE_USER_PREFERENCES, 'readwrite');
    t.objectStore(STORE_USER_PREFERENCES).delete(key);
    await txDone(t);
  }

  async listPreferences(): Promise<UserPreference[]> {
    const db = this.getDB();
    return new Promise((resolve, reject) => {
      const t = tx(db, STORE_USER_PREFERENCES, 'readonly');
      const results: UserPreference[] = [];
      const cursorReq = t.objectStore(STORE_USER_PREFERENCES).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        results.push(cursor.value as UserPreference);
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  // --- export / import -----------------------------------------------------

  async exportForSync(): Promise<ConfigCacheExport> {
    const db = this.getDB();

    // Collect shared benchmarks
    const benchmarks: BenchmarkSnapshot[] = await new Promise((resolve, reject) => {
      const t = tx(db, STORE_BENCHMARKS, 'readonly');
      const results: BenchmarkSnapshot[] = [];
      const cursorReq = t.objectStore(STORE_BENCHMARKS).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        const snap = cursor.value as BenchmarkSnapshot;
        if (snap.shared) {
          results.push(snap);
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    // Collect installed config packs
    const config_packs = await this.listInstalledPacks();

    return {
      benchmarks,
      config_packs,
      exported_at: Date.now(),
    };
  }

  // --- maintenance ---------------------------------------------------------

  async clearAll(): Promise<void> {
    const db = this.getDB();
    const stores = [
      STORE_CONFIG_PACKS,
      STORE_BENCHMARKS,
      STORE_INTEGRATIONS,
      STORE_USER_PREFERENCES,
    ];
    const t = tx(db, stores, 'readwrite');
    for (const store of stores) {
      t.objectStore(store).clear();
    }
    await txDone(t);
  }

  async getStats(): Promise<{
    config_packs: number;
    benchmarks: number;
    integrations: number;
    preferences: number;
  }> {
    const db = this.getDB();
    const stores = [
      STORE_CONFIG_PACKS,
      STORE_BENCHMARKS,
      STORE_INTEGRATIONS,
      STORE_USER_PREFERENCES,
    ];
    const t = tx(db, stores, 'readonly');
    const [packs, benchmarks, integrations, prefs] = await Promise.all([
      req<number>(t.objectStore(STORE_CONFIG_PACKS).count()),
      req<number>(t.objectStore(STORE_BENCHMARKS).count()),
      req<number>(t.objectStore(STORE_INTEGRATIONS).count()),
      req<number>(t.objectStore(STORE_USER_PREFERENCES).count()),
    ]);
    return {
      config_packs: packs,
      benchmarks: benchmarks,
      integrations: integrations,
      preferences: prefs,
    };
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

const isServer = typeof window === 'undefined';

/** Lazy-init singleton. Returns null during SSR. */
export function useConfigCache(): ConfigCacheStore | null {
  const [store, setStore] = useState<ConfigCacheStore | null>(null);

  useEffect(() => {
    if (isServer) return;
    const instance = ConfigCacheStore.getInstance();
    instance.init().then(() => setStore(instance));
  }, []);

  return store;
}
