/**
 * Client-side API helpers for benchmark CRUD and leaderboard.
 *
 * All calls go through Next.js API routes (/api/benchmark/*) which proxy
 * to the backend helper service with graceful fallback.
 */

import type { BenchmarkSnapshot } from '@/lib/cache/config-cache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  machine_profile_hash: string;
  model: string;
  runtime: string;
  quantization: string;
  chip_family: string;
  ram_total_gb: number;
  decode_tok_s_avg: number;
  ttft_p50_ms: number;
  created_at: number;
  anonymous: boolean;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Save a benchmark result to the backend. */
export async function saveBenchmarkResult(
  snapshot: BenchmarkSnapshot,
): Promise<{ saved: boolean; id: string }> {
  try {
    const res = await fetch('/api/benchmark/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) return { saved: false, id: snapshot.id };
    return await res.json();
  } catch {
    return { saved: false, id: snapshot.id };
  }
}

/** Fetch benchmark history from the backend. */
export async function getBenchmarkHistory(
  limit?: number,
  suite?: string,
): Promise<BenchmarkSnapshot[]> {
  try {
    const params = new URLSearchParams();
    if (limit != null) params.set('limit', String(limit));
    if (suite) params.set('suite', suite);

    const res = await fetch(`/api/benchmark/results?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

/** Submit a snapshot to the community leaderboard. */
export async function submitToLeaderboard(
  snapshot: BenchmarkSnapshot,
  anonymous = false,
): Promise<{ submitted: boolean; rank?: number }> {
  try {
    const res = await fetch('/api/benchmark/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot, anonymous }),
    });
    if (!res.ok) return { submitted: false };
    const data = await res.json();
    return {
      submitted: data.submitted ?? false,
      rank: data.leaderboard_rank ?? undefined,
    };
  } catch {
    return { submitted: false };
  }
}

/** Fetch community leaderboard entries. */
export async function getLeaderboard(
  params?: { hardware_class?: string; model?: string; limit?: number },
): Promise<LeaderboardEntry[]> {
  try {
    const qs = new URLSearchParams();
    if (params?.hardware_class) qs.set('hardware_class', params.hardware_class);
    if (params?.model) qs.set('model', params.model);
    if (params?.limit != null) qs.set('limit', String(params.limit));

    const res = await fetch(`/api/benchmark/leaderboard?${qs}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.entries ?? [];
  } catch {
    return [];
  }
}
