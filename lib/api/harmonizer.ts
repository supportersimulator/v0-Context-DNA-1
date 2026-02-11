// =============================================================================
// Harmonizer API Client — POST /v1/harmonizer/check
// Backend: memory/harmonizer.py (agent_service port 8080)
// 7 gates: syntax, style, security, logic, dependency, test, architecture
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type HarmonizerCheckRequest,
  type HarmonizerCheckResponse,
} from './types';

const BASE = API_BASE.helper;

export async function checkCode(
  req: HarmonizerCheckRequest,
): Promise<HarmonizerCheckResponse> {
  const res = await fetch(`${BASE}/v1/harmonizer/check`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getHarmonizerHealth(): Promise<{
  status: string;
  categories: string[];
  llm_available: boolean;
}> {
  const res = await fetch(`${BASE}/v1/harmonizer/health`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}
