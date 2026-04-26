'use client';

// =============================================================================
// settings-sync.ts — Backend persistence layer for the IDE Settings store
//
// Today's `lib/ide/settings-store.ts` persists overrides to localStorage only.
// That's fine for a single-machine session but loses everything on a fresh
// install and doesn't travel with workspace switches.
//
// This module wraps the SettingsStore singleton with two helpers that talk to
// the new `/api/settings` route, plus a tiny React hook for UIs that want a
// "Sync now" button.
//
// We deliberately layer ON TOP of the store rather than mutating it: the
// store's localStorage logic stays the canonical client cache; the backend
// file is the source-of-truth that survives reinstalls.
//
// Conflict policy: whichever side last wrote wins. The IDE writes the local
// localStorage cache eagerly on every set(), and writes the backend on
// explicit `syncToBackend()` calls (or auto-debounced via the
// `useSettingsAutoSync` hook).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type IDESettings,
  SETTING_DEFAULTS,
  getSettingsStore,
} from './settings-store';
import { append as logAppend } from '@/lib/log/buffer';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface SyncResult {
  ok: boolean;
  path?: string;
  bytes?: number;
  applied?: number;
  error?: string;
}

const FETCH_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Internal: fetch with timeout helper. Returns parsed JSON or `{ ok: false }`.
// ---------------------------------------------------------------------------

async function timedFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown; err?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(input, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      data: null,
      err: (err as Error)?.message ?? String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// syncFromBackend — pull workspace settings file → SettingsStore.
//
// Only known keys (those present in SETTING_DEFAULTS) are imported. Unknown
// keys are silently dropped so a stale file never breaks the IDE.
// ---------------------------------------------------------------------------

export async function syncFromBackend(): Promise<SyncResult> {
  const resp = await timedFetch('/api/settings', { method: 'GET' });

  if (!resp.ok || !resp.data || typeof resp.data !== 'object') {
    const error =
      resp.err ?? (resp.data as { error?: string } | null)?.error ?? `HTTP ${resp.status}`;
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'settings-sync/from',
        msg: `pull failed: ${error}`,
      });
    } catch {
      /* noop */
    }
    return { ok: false, error };
  }

  const body = resp.data as { ok?: boolean; settings?: Partial<IDESettings>; path?: string };
  if (!body.ok || !body.settings || typeof body.settings !== 'object') {
    return { ok: false, error: 'malformed response' };
  }

  // Apply known keys only.
  const store = getSettingsStore();
  let applied = 0;
  for (const [key, value] of Object.entries(body.settings)) {
    if (key in SETTING_DEFAULTS) {
      store.set(key as keyof IDESettings, value as IDESettings[keyof IDESettings]);
      applied++;
    }
  }

  return { ok: true, path: body.path, applied };
}

// ---------------------------------------------------------------------------
// syncToBackend — push current SettingsStore overrides → workspace JSON file.
// ---------------------------------------------------------------------------

export async function syncToBackend(): Promise<SyncResult> {
  const store = getSettingsStore();
  const overrides = store.export();

  const resp = await timedFetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: overrides }),
  });

  if (!resp.ok) {
    const error =
      resp.err ?? (resp.data as { error?: string } | null)?.error ?? `HTTP ${resp.status}`;
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'settings-sync/to',
        msg: `push failed: ${error}`,
      });
    } catch {
      /* noop */
    }
    return { ok: false, error };
  }

  const body = resp.data as { ok?: boolean; path?: string; bytes?: number; error?: string };
  if (!body.ok) {
    return { ok: false, error: body.error ?? 'unknown' };
  }
  return { ok: true, path: body.path, bytes: body.bytes };
}

// ---------------------------------------------------------------------------
// React hook: useSettingsSync
// Returns { lastResult, pulling, pushing, pull, push }. Suitable for the
// Settings panel header (or any component that wants to expose a Sync button).
// ---------------------------------------------------------------------------

export interface UseSettingsSync {
  pulling: boolean;
  pushing: boolean;
  lastResult: SyncResult | null;
  pull: () => Promise<SyncResult>;
  push: () => Promise<SyncResult>;
}

export function useSettingsSync(): UseSettingsSync {
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const pull = useCallback(async (): Promise<SyncResult> => {
    setPulling(true);
    try {
      const res = await syncFromBackend();
      setLastResult(res);
      return res;
    } finally {
      setPulling(false);
    }
  }, []);

  const push = useCallback(async (): Promise<SyncResult> => {
    setPushing(true);
    try {
      const res = await syncToBackend();
      setLastResult(res);
      return res;
    } finally {
      setPushing(false);
    }
  }, []);

  return { pulling, pushing, lastResult, pull, push };
}

// ---------------------------------------------------------------------------
// Optional: useSettingsAutoSync — debounce-pushes on every change.
// 800 ms quiet period before a push fires. Default OFF; opt-in by mounting
// the hook somewhere persistent (e.g., the Settings panel root).
//
// Only mounts a single subscription via a module-level guard so multiple
// component instances can't race for writes.
// ---------------------------------------------------------------------------

let _autoSyncMounted = false;

export function useSettingsAutoSync(enabled: boolean, debounceMs = 800): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (_autoSyncMounted) return;
    _autoSyncMounted = true;

    const store = getSettingsStore();
    const unsubscribe = store.subscribe(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void syncToBackend();
      }, debounceMs);
    });

    return () => {
      _autoSyncMounted = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsubscribe();
    };
  }, [enabled, debounceMs]);
}
