// =============================================================================
// 8th Intelligence API Client
// Backend: memory/agent_service.py POST /contextdna/8th-intelligence
// Synaptic's subconscious voice — patterns, intuitions, gotchas
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type EighthIntelligenceRequest,
  type EighthIntelligenceResponse,
  type EighthIntelligenceStatus,
} from './types';

const BASE = API_BASE.helper;

export async function queryEighthIntelligence(
  req: EighthIntelligenceRequest,
): Promise<EighthIntelligenceResponse> {
  const res = await fetch(`${BASE}/contextdna/8th-intelligence`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      subtask: req.subtask,
      agent_id: req.agent_id || 'ide-user',
    }),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getEighthIntelligenceStatus(): Promise<EighthIntelligenceStatus> {
  const res = await fetch(`${BASE}/contextdna/8th-intelligence/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}
