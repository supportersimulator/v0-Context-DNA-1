'use client';

// =============================================================================
// useGitStatus — polls /api/git/status every 5s for a given repo cwd.
// Mirrors the FleetStatus-style hook contract: useState/useEffect, no SWR.
// Defaults to simulator-core/er-sim-monitor server-side; pass cwd to override.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GitFileEntry {
  path: string;
  status: string;
}

export interface GitUntrackedEntry {
  path: string;
}

export interface GitLastCommit {
  hash: string;
  subject: string;
  when: string;
  author: string;
}

export interface GitStatusOk {
  ok: true;
  cwd: string;
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
  untracked: GitUntrackedEntry[];
  last_commit: GitLastCommit | null;
}

export interface GitStatusErr {
  ok: false;
  error: string;
  cwd?: string;
}

export type GitStatus = GitStatusOk | GitStatusErr;

export interface UseGitStatusResult {
  data: GitStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Subscribes to /api/git/status with a polling interval.
 * - data is null only during the initial fetch.
 * - error reflects transport-level failures only; daemon errors arrive as
 *   data with ok:false (consumers should branch on that).
 */
export function useGitStatus(cwd?: string, intervalMs = 5000): UseGitStatusResult {
  const [data, setData] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // hasFetched flips true only after the first response (success OR error)
  // arrives. Derived `loading` avoids setState-in-effect lint and gives the
  // same UX: loading=true until first reply.
  const [hasFetched, setHasFetched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const url = cwd
        ? `/api/git/status?cwd=${encodeURIComponent(cwd)}`
        : '/api/git/status';
      const res = await fetch(url, { cache: 'no-store' });
      const json = (await res.json()) as GitStatus;
      setData(json);
      setError(null);
    } catch (e) {
      setError((e as Error).message || 'fetch failed');
    } finally {
      setHasFetched(true);
      inFlight.current = false;
    }
  }, [cwd]);

  useEffect(() => {
    fetchOnce();
    timerRef.current = setInterval(fetchOnce, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchOnce, intervalMs]);

  return { data, loading: !hasFetched, error, refresh: fetchOnce };
}
