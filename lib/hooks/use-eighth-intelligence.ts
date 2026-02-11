'use client';

// =============================================================================
// useEighthIntelligence — on-demand Synaptic queries
// Pure REST: POST /contextdna/8th-intelligence
// =============================================================================

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { queryEighthIntelligence, getEighthIntelligenceStatus } from '@/lib/api/eighth-intelligence';
import type { EighthIntelligenceResponse, EighthIntelligenceStatus } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// useEighthIntelligenceQuery — on-demand query
// ---------------------------------------------------------------------------

export function useEighthIntelligenceQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EighthIntelligenceResponse | null>(null);

  const query = useCallback(async (subtask: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await queryEighthIntelligence({ subtask });
      setResult(res);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '8th Intelligence query failed';
      setError(msg);
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { query, result, loading, error };
}

// ---------------------------------------------------------------------------
// useEighthIntelligenceStatus — poll status (is Synaptic active?)
// ---------------------------------------------------------------------------

export function useEighthIntelligenceStatus() {
  const { data, error } = useSWR<EighthIntelligenceStatus>(
    'eighth-intelligence-status',
    getEighthIntelligenceStatus,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
    },
  );

  return {
    active: data?.status === 'active',
    mode: data?.mode ?? 'unknown',
    isLoading: !data && !error,
    error: error?.message ?? null,
  };
}
