'use client';

// =============================================================================
// useLogs — polls /api/logs every <intervalMs> with a cursor, accumulates new
// entries client-side, and exposes filter/clear helpers for the LogViewerPanel.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  source: string;
  msg: string;
  detail?: unknown;
}

interface LogsResponse {
  logs: LogEntry[];
  cursor: number;
}

const MAX_CLIENT_ENTRIES = 1000;

export interface UseLogsOptions {
  /** Polling interval in milliseconds. Default: 2000 */
  intervalMs?: number;
  /** Skip polling entirely (for tests). Default: false */
  paused?: boolean;
}

export interface UseLogsResult {
  logs: LogEntry[];
  /** True until the first response lands. */
  isLoading: boolean;
  /** Last fetch error, or null. */
  error: string | null;
  /** POSTs to /api/logs/clear and resets local state. */
  clear: () => Promise<void>;
  /** Force an immediate poll (e.g. on focus). */
  refresh: () => Promise<void>;
}

export function useLogs(opts: UseLogsOptions = {}): UseLogsResult {
  const { intervalMs = 2000, paused = false } = opts;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<number>(0);

  const poll = useCallback(async () => {
    try {
      const url = cursorRef.current > 0
        ? `/api/logs?since=${cursorRef.current}&limit=200`
        : '/api/logs?limit=200';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as LogsResponse;
      if (data.cursor > cursorRef.current) {
        cursorRef.current = data.cursor;
      }
      if (data.logs.length > 0) {
        setLogs((prev) => {
          const merged = prev.concat(data.logs);
          return merged.length > MAX_CLIENT_ENTRIES
            ? merged.slice(-MAX_CLIENT_ENTRIES)
            : merged;
        });
      }
      setError(null);
    } catch (e) {
      setError((e as Error)?.message || String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await poll();
    };
    void tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [poll, intervalMs, paused]);

  const clear = useCallback(async () => {
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
    } catch (e) {
      setError((e as Error)?.message || String(e));
    }
    cursorRef.current = 0;
    setLogs([]);
  }, []);

  return {
    logs,
    isLoading,
    error,
    clear,
    refresh: poll,
  };
}
