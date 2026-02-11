// =============================================================================
// Mode API Client — GET /api/mode/status
// Backend: memory/agent_service.py
// Detects lite (SQLite only) vs heavy (PG + Redis + Docker)
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type ModeStatus,
} from './types';

const BASE = API_BASE.helper;

export async function getModeStatus(): Promise<ModeStatus> {
  try {
    const res = await fetch(`${BASE}/api/mode/status`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new APIError(res.status, await res.text());
    return res.json();
  } catch {
    // Backend unreachable — assume lite mode
    return {
      mode: 'lite',
      features: {
        redis: false,
        postgresql: false,
        docker: false,
        websocket: false,
        swarm: false,
        evidence_pipeline: false,
        real_time_sync: false,
      },
      services: {
        context_dna_api: false,
        agent_service: false,
        vllm_mlx: false,
        redis: false,
        postgresql: false,
      },
    };
  }
}
