'use client';

// =============================================================================
// useEvidence — React hooks for Evidence Pipeline
// SWR for stats + WebSocket for real-time claim/promotion events
// =============================================================================

import useSWR from 'swr';
import { getEvidencePipelineStats, getEvidenceClaims, getEvidencePromotions } from '@/lib/api/evidence';
import { useWSChannel } from '@/lib/ide/ws-manager';
import type { EvidencePipelineStats, EvidenceClaim, EvidencePromotion } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// useEvidencePipeline — pipeline stats (claims, outcomes, quarantine, promotions)
// ---------------------------------------------------------------------------

export function useEvidencePipeline() {
  const { data, error, mutate } = useSWR<EvidencePipelineStats>(
    'evidence-pipeline-stats',
    getEvidencePipelineStats,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
    },
  );

  // Real-time updates via WebSocket
  useWSChannel<Partial<EvidencePipelineStats>>('evidence:update', (msg) => {
    if (msg.data) {
      mutate((prev) => (prev ? { ...prev, ...msg.data } : prev), { revalidate: false });
    }
  });

  return {
    stats: data ?? null,
    isLoading: !data && !error,
    error: error?.message ?? null,
    refresh: mutate,
  };
}

// ---------------------------------------------------------------------------
// useEvidenceClaims — list claims with optional status filter
// ---------------------------------------------------------------------------

export function useEvidenceClaims(status?: string) {
  const key = status ? `evidence-claims-${status}` : 'evidence-claims';
  const { data, error, mutate } = useSWR<{ claims: EvidenceClaim[]; total: number }>(
    key,
    () => getEvidenceClaims(50, status),
    {
      refreshInterval: 30_000,
      revalidateOnFocus: false,
    },
  );

  return {
    claims: data?.claims ?? [],
    total: data?.total ?? 0,
    isLoading: !data && !error,
    error: error?.message ?? null,
    refresh: mutate,
  };
}

// ---------------------------------------------------------------------------
// useEvidencePromotions — recently promoted claims
// ---------------------------------------------------------------------------

export function useEvidencePromotions() {
  const { data, error, mutate } = useSWR<{ promotions: EvidencePromotion[] }>(
    'evidence-promotions',
    () => getEvidencePromotions(20),
    {
      refreshInterval: 60_000,
      revalidateOnFocus: false,
    },
  );

  return {
    promotions: data?.promotions ?? [],
    isLoading: !data && !error,
    error: error?.message ?? null,
    refresh: mutate,
  };
}
