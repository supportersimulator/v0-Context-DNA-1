'use client';

// =============================================================================
// useReceipts — React hook for 3-Surgeons audit receipts
// Fetches /api/receipts on mount, optional polling, exposes refresh + purge.
// Schema mirrors three_surgeons.receipts.store.ReceiptRecord.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types — mirrors three_surgeons.receipts.store.ReceiptRecord
// ---------------------------------------------------------------------------

export type ReceiptMode = 'consult' | 'cross-exam' | 'consensus' | string;

export interface ReceiptAuditor {
  id: string;
  status?: string;
  model?: string;
  [extra: string]: unknown;
}

export interface ReceiptFindings {
  items?: unknown[];
  consensus?: number;
  contested?: number;
  unique?: number;
  [extra: string]: unknown;
}

export interface ReceiptCacheStats {
  cache_eligible?: boolean;
  cache_eligible_reason?: string;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  [extra: string]: unknown;
}

export interface Receipt {
  mode?: ReceiptMode;
  timestamp?: string;
  auditors?: ReceiptAuditor[];
  findings?: ReceiptFindings;
  duration_ms?: number;
  cache_stats?: ReceiptCacheStats;
  /** Present when format=rendered. */
  rendered?: string;
  /** Receipts may carry arbitrary extras (target, run_stamp, v, etc.). */
  [extra: string]: unknown;
}

export interface ReceiptsApiResponse {
  ok: boolean;
  receipts: Receipt[];
  count: number;
  file: string;
  error?: string;
}

export interface PurgeApiResponse {
  ok: boolean;
  purged: number;
  file: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Hook options + return shape
// ---------------------------------------------------------------------------

export interface UseReceiptsOptions {
  projectDir?: string;
  limit?: number;
  format?: 'raw' | 'rendered';
  /** Poll interval in milliseconds. 0 (default) disables polling. */
  pollMs?: number;
}

export interface UseReceiptsResult {
  receipts: Receipt[];
  count: number;
  file: string;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  purge: () => Promise<number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQuery(opts: UseReceiptsOptions): string {
  const params = new URLSearchParams();
  if (opts.projectDir) params.set('project_dir', opts.projectDir);
  if (typeof opts.limit === 'number' && opts.limit > 0) params.set('limit', String(opts.limit));
  if (opts.format) params.set('format', opts.format);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// useReceipts
// ---------------------------------------------------------------------------

export function useReceipts(opts: UseReceiptsOptions = {}): UseReceiptsResult {
  const { projectDir, limit, format, pollMs = 0 } = opts;

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [count, setCount] = useState(0);
  const [file, setFile] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable ref for current opts so refresh() doesn't get new identity on every render.
  const optsRef = useRef<UseReceiptsOptions>(opts);
  optsRef.current = opts;

  // Track unmount so we don't setState after teardown.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const current = optsRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/receipts${buildQuery(current)}`, { cache: 'no-store' });
      const json = (await res.json()) as ReceiptsApiResponse;
      if (!aliveRef.current) return;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setReceipts(Array.isArray(json.receipts) ? json.receipts : []);
      setCount(typeof json.count === 'number' ? json.count : 0);
      setFile(json.file || '');
    } catch (e) {
      if (!aliveRef.current) return;
      const msg = e instanceof Error ? e.message : 'receipts fetch failed';
      setError(msg);
      setReceipts([]);
      setCount(0);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  const purge = useCallback(async (): Promise<number> => {
    const current = optsRef.current;
    const params = new URLSearchParams();
    if (current.projectDir) params.set('project_dir', current.projectDir);
    const qs = params.toString();
    try {
      const res = await fetch(`/api/receipts/purge${qs ? `?${qs}` : ''}`, {
        method: 'POST',
        cache: 'no-store',
      });
      const json = (await res.json()) as PurgeApiResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await refresh();
      return json.purged ?? 0;
    } catch (e) {
      if (aliveRef.current) {
        setError(e instanceof Error ? e.message : 'receipts purge failed');
      }
      return 0;
    }
  }, [refresh]);

  // Initial fetch + re-fetch when query-defining options change. Wrapped in
  // queueMicrotask so we don't trigger setState synchronously inside the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [projectDir, limit, format, refresh]);

  // Polling (only when pollMs > 0).
  useEffect(() => {
    if (!pollMs || pollMs <= 0) return;
    const id = setInterval(() => {
      refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refresh]);

  return { receipts, count, file, loading, error, refresh, purge };
}
