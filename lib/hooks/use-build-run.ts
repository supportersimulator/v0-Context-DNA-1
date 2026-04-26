'use client';

// =============================================================================
// useBuildRun — POST /api/build/run + poll /api/build/status
//
// Provides:
//   - run(target): triggers a build via /api/build/run; resolves with the
//     completed response.
//   - status: most recent /api/build/status snapshot ({running, target, ...})
//   - lastResult: last completed POST body (exit_code, stdout, stderr, etc.)
//   - running: convenience boolean from status
//
// Polling cadence is short (1.5s) only while running:true, then backs off
// to 10s when idle so we don't burn CPU on a healthy clean repo.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export type BuildTarget = 'web' | 'build' | 'test' | 'lint';

export interface BuildRunResponse {
  ok: boolean;
  target: string;
  cwd: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  pid: number | null;
  error?: string;
}

export interface BuildStatusResponse {
  ok: boolean;
  running: boolean;
  target?: string;
  started_at?: number;
  finished_at?: number;
  pid?: number | null;
  exit_code?: number | null;
}

export interface UseBuildRunResult {
  run: (target: BuildTarget, cwd?: string) => Promise<BuildRunResponse>;
  status: BuildStatusResponse | null;
  lastResult: BuildRunResponse | null;
  running: boolean;
  inFlight: boolean;
  error: string | null;
}

const RUNNING_POLL_MS = 1500;
const IDLE_POLL_MS = 10000;

export function useBuildRun(): UseBuildRunResult {
  const [status, setStatus] = useState<BuildStatusResponse | null>(null);
  const [lastResult, setLastResult] = useState<BuildRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/build/status', { cache: 'no-store' });
      const json = (await res.json()) as BuildStatusResponse;
      setStatus(json);
      return json;
    } catch (e) {
      setError((e as Error).message || 'status fetch failed');
      return null;
    }
  }, []);

  // Self-scheduling poll loop (cadence depends on running state).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const s = await fetchStatus();
      const next = s?.running ? RUNNING_POLL_MS : IDLE_POLL_MS;
      timerRef.current = setTimeout(tick, next);
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchStatus]);

  const run = useCallback(
    async (target: BuildTarget, cwd?: string): Promise<BuildRunResponse> => {
      setInFlight(true);
      setError(null);
      try {
        const res = await fetch('/api/build/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target, cwd }),
        });
        const json = (await res.json()) as BuildRunResponse;
        setLastResult(json);
        // Refresh status immediately so UI reflects finished state.
        fetchStatus();
        return json;
      } catch (e) {
        const msg = (e as Error).message || 'build run failed';
        setError(msg);
        const errResult: BuildRunResponse = {
          ok: false,
          target,
          cwd: cwd ?? '',
          exit_code: null,
          stdout: '',
          stderr: msg,
          duration_ms: 0,
          timed_out: false,
          pid: null,
          error: msg,
        };
        setLastResult(errResult);
        return errResult;
      } finally {
        setInFlight(false);
      }
    },
    [fetchStatus],
  );

  return {
    run,
    status,
    lastResult,
    running: !!status?.running,
    inFlight,
    error,
  };
}
