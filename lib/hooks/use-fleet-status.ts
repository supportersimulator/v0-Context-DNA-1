'use client';

// =============================================================================
// useFleetStatus — polls /api/fleet/status on an interval
// Returns aggregated fleet status for HealthView (and any other consumer).
// Plain useState/useEffect (no SWR) so the component owns lifecycle simply.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FleetNodeStatus {
  id: string;
  healthy: boolean;
  score: string;
  broken_channels: string[];
}

export interface FleetStatusOk {
  ok: true;
  self: string | null;
  nodes: FleetNodeStatus[];
  cascade_mode: string;
  total_active: number;
}

export interface FleetStatusErr {
  ok: false;
  error: string;
  details: string;
}

export type FleetStatus = FleetStatusOk | FleetStatusErr;

export interface UseFleetStatusResult {
  data: FleetStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Subscribes to /api/fleet/status with a polling interval.
 * - First load shows loading=true until the first response (ok or err) arrives.
 * - data === null only during the initial fetch; afterwards it always reflects
 *   the most recent server payload (including the {ok:false, ...} graceful err).
 * - error is set ONLY for transport-level failures (network, parse). Daemon
 *   errors come back as data with ok:false; consumers should branch on that.
 */
export function useFleetStatus(intervalMs = 5000): UseFleetStatusResult {
  const [data, setData] = useState<FleetStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/status', { cache: 'no-store' });
      if (!res.ok) {
        // Route is designed to return 200 even when daemon is down, so a non-2xx
        // here means something else broke (build, deploy, etc).
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as FleetStatus;
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
    void fetchOnce();
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
