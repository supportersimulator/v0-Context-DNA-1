'use client';

// =============================================================================
// useMode — React hook for operating mode detection (lite vs heavy)
// Fetched once on mount, cached via SWR
// =============================================================================

import useSWR from 'swr';
import { getModeStatus } from '@/lib/api/mode';
import type { ModeStatus, OperatingMode } from '@/lib/api/types';

export function useMode() {
  const { data, error, mutate } = useSWR<ModeStatus>(
    'mode-status',
    getModeStatus,
    {
      refreshInterval: 60_000, // Re-check every 60s (mode changes are rare)
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    },
  );

  const mode: OperatingMode = data?.mode ?? 'lite';
  const isHeavy = mode === 'heavy';
  const isLite = mode === 'lite';

  return {
    mode,
    isHeavy,
    isLite,
    features: data?.features ?? {
      redis: false,
      postgresql: false,
      docker: false,
      websocket: false,
      swarm: false,
      evidence_pipeline: false,
      real_time_sync: false,
    },
    services: data?.services ?? {
      context_dna_api: false,
      agent_service: false,
      vllm_mlx: false,
      redis: false,
      postgresql: false,
    },
    isLoading: !data && !error,
    error: error?.message ?? null,
    refresh: mutate,
  };
}
