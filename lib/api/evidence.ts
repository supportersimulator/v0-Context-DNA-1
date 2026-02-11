// =============================================================================
// Evidence Pipeline API Client
// Backend: memory/agent_service.py (embedded in session briefing + observability)
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type EvidencePipelineStats,
  type EvidenceClaim,
  type EvidencePromotion,
} from './types';

const BASE = API_BASE.helper;

export async function getEvidencePipelineStats(): Promise<EvidencePipelineStats> {
  const res = await fetch(`${BASE}/api/evidence/stats`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getEvidenceClaims(
  limit = 50,
  status?: string,
): Promise<{ claims: EvidenceClaim[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/api/evidence/claims?${params}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getEvidencePromotions(
  limit = 20,
): Promise<{ promotions: EvidencePromotion[] }> {
  const res = await fetch(`${BASE}/api/evidence/promotions?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}
