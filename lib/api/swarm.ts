// =============================================================================
// Swarm API Client — POST /v1/swarm/run, GET /v1/swarm/run/{id}
// Backend: memory/swarm_controller.py (agent_service port 8080)
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type SwarmRunRequest,
  type SwarmRunResponse,
  type SwarmRun,
} from './types';

const BASE = API_BASE.helper;

export async function submitSwarmTask(req: SwarmRunRequest): Promise<SwarmRunResponse> {
  const res = await fetch(`${BASE}/v1/swarm/run`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getSwarmStatus(runId: string): Promise<SwarmRun> {
  const res = await fetch(`${BASE}/v1/swarm/run/${runId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getSwarmHistory(limit = 10): Promise<SwarmRun[]> {
  const res = await fetch(`${BASE}/v1/swarm/runs?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  const data = await res.json();
  return data.runs ?? [];
}

export async function cancelSwarmRun(runId: string): Promise<{ cancelled: boolean }> {
  void runId;
  throw new Error('Swarm cancellation is not implemented by the backend yet');
}
