// =============================================================================
// Session API Client
// Backend: memory/agent_service.py /api/session/briefing
// Session briefing: recent wins, failure patterns, evidence health, warnings
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type SessionBriefing,
} from './types';

const BASE = API_BASE.helper;

export async function getSessionBriefing(): Promise<SessionBriefing> {
  const res = await fetch(`${BASE}/api/session/briefing`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getSessionHistory(limit = 20): Promise<{
  sessions: Array<{
    session_id: string;
    summary: string;
    started_at: string;
    ended_at: string | null;
  }>;
}> {
  const res = await fetch(`${BASE}/api/session/history?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}
