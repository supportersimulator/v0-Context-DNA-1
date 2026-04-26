'use client';

// =============================================================================
// useErSimStatus — polls /api/er-sim/status on an interval.
//
// Cross-product status surface for the ER Simulator. Consumers:
//   - StatusBar (small pill in the IDE chrome)
//   - HomeView Launch card (replaces the stale launchMessage)
//   - Future: a dedicated ER Sim panel
//
// Designed to mirror useFleetStatus' lifecycle conventions:
//   - First load: loading=true until first response (ok or err)
//   - data === null only during the initial fetch; afterwards always a payload
//   - Transport-level errors set `error`; daemon-down comes back as ok:false
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ErSimStatusResponse } from '@/app/api/er-sim/status/route';

export type ErSimStatus = ErSimStatusResponse;

export interface UseErSimStatusResult {
  data: ErSimStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const DEFAULT_INTERVAL_MS = 5000;

export function useErSimStatus(intervalMs = DEFAULT_INTERVAL_MS): UseErSimStatusResult {
  const [data, setData] = useState<ErSimStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch('/api/er-sim/status', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as ErSimStatus;
      if (cancelledRef.current) return;
      setData(json);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    queueMicrotask(() => {
      if (cancelledRef.current) return;
      void fetchOnce();
    });
    const id = setInterval(() => {
      void fetchOnce();
    }, intervalMs);
    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, [fetchOnce, intervalMs]);

  const refresh = useCallback(() => {
    setLoading(true);
    void fetchOnce();
  }, [fetchOnce]);

  return { data, loading, error, refresh };
}
