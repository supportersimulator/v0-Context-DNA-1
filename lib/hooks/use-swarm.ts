'use client';

// =============================================================================
// useSwarm — React hooks for Swarm Controller
// SWR for initial data, WebSocket for real-time agent progress
// =============================================================================

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { submitSwarmTask, getSwarmStatus, getSwarmHistory } from '@/lib/api/swarm';
import { useWSChannel } from '@/lib/ide/ws-manager';
import type { SwarmRun, SwarmRunRequest, SwarmRunResponse, SwarmRunStatus } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// useSwarmSubmit — submit a task to the swarm
// ---------------------------------------------------------------------------

export function useSwarmSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<SwarmRunResponse | null>(null);

  const submit = useCallback(async (req: SwarmRunRequest) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitSwarmTask(req);
      setLastResponse(res);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Swarm submission failed';
      setError(msg);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error, lastResponse };
}

// ---------------------------------------------------------------------------
// useSwarmStatus — track a running swarm by run_id
// Polls via SWR + real-time via WebSocket channel swarm:status:{runId}
// ---------------------------------------------------------------------------

const swarmStatusFetcher = async (url: string) => {
  const runId = url.split('/').pop();
  if (!runId) throw new Error('Missing run_id');
  return getSwarmStatus(runId);
};

export function useSwarmStatus(runId: string | null) {
  const { data, error, mutate } = useSWR(
    runId ? `/v1/swarm/run/${runId}` : null,
    swarmStatusFetcher,
    {
      refreshInterval: runId ? 3000 : 0, // Poll every 3s while active
      revalidateOnFocus: false,
    },
  );

  // WebSocket upgrade — stop polling when WS provides updates
  useWSChannel<SwarmRun>(
    runId ? `swarm:status:${runId}` : '',
    (msg) => {
      if (msg.data) {
        mutate(msg.data as SwarmRun, { revalidate: false });
      }
    },
  );

  const isTerminal = data?.status === 'complete' || data?.status === 'failed';

  return {
    run: data ?? null,
    status: (data?.status ?? 'pending') as SwarmRunStatus,
    isLoading: !data && !error && !!runId,
    isTerminal,
    error: error?.message ?? data?.error ?? null,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// useSwarmHistory — list recent swarm runs
// ---------------------------------------------------------------------------

const historyFetcher = () => getSwarmHistory(10);

export function useSwarmHistory() {
  const { data, error, mutate } = useSWR('swarm-history', historyFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });

  return {
    runs: data ?? [],
    isLoading: !data && !error,
    error: error?.message ?? null,
    refresh: mutate,
  };
}
