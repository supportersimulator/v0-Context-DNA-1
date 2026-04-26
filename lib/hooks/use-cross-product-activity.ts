'use client';

// =============================================================================
// useCrossProductActivity — polls /api/cross-product/activity
//
// Cross-product activity stream consumed by the unified Activity panel.
// Backend aggregates fleet daemon + 3-Surgeons agent_service + ER Sim probe.
// Mirrors useFleetStatus' lifecycle conventions (initial-load loading, graceful
// transport-error handling, refresh fn).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CrossProductActivityResponse,
  CrossProductEvent,
  CrossProductSource,
} from '@/app/api/cross-product/activity/route';

export type { CrossProductActivityResponse, CrossProductEvent, CrossProductSource };

export interface UseCrossProductActivityResult {
  data: CrossProductActivityResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const DEFAULT_INTERVAL_MS = 7000;

export function useCrossProductActivity(
  intervalMs = DEFAULT_INTERVAL_MS,
  limit = 50,
): UseCrossProductActivityResult {
  const [data, setData] = useState<CrossProductActivityResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(`/api/cross-product/activity?limit=${limit}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as CrossProductActivityResponse;
      if (cancelledRef.current) return;
      setData(json);
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [limit]);

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
