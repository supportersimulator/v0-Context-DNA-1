// =============================================================================
// Librarian API Client — POST /v1/context/query
// Backend: memory/librarian.py (agent_service port 8080)
// 8 intents: locate, explain, trace, impact, tests, deps, docs, decision
// =============================================================================

import {
  API_BASE,
  getAuthHeaders,
  APIError,
  type LibrarianQueryRequest,
  type LibrarianQueryResponse,
} from './types';

const BASE = API_BASE.helper;

export async function queryLibrarian(
  req: LibrarianQueryRequest,
): Promise<LibrarianQueryResponse> {
  const res = await fetch(`${BASE}/v1/context/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}

export async function getLibrarianHealth(): Promise<{
  status: string;
  graph_loaded: boolean;
  sqlite_ok: boolean;
}> {
  const res = await fetch(`${BASE}/v1/context/health`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new APIError(res.status, await res.text());
  return res.json();
}
