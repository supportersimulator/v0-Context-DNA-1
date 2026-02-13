// =============================================================================
// huggingface-provider.ts — HuggingFace Hub Integration
//
// Manages models, spaces, and datasets via the HuggingFace REST API.
// Supports model search, space creation/deletion, and dataset browsing.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://huggingface.co/api';

function getToken(): string | undefined {
  return typeof process !== 'undefined' ? process.env.HF_TOKEN : undefined;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const HuggingFaceProvider: IntegrationProvider = {
  // -- Identity --
  id: 'huggingface',
  name: 'HuggingFace',
  icon: 'Brain',
  category: 'ml',
  description: 'Model hub, Spaces, and dataset management via HuggingFace',

  // -- Auth --
  auth: { type: 'api_key', envKey: 'HF_TOKEN' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/whoami-v2`, { headers: authHeaders() });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: `HuggingFace not reachable: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['hf-models', 'hf-spaces', 'hf-datasets'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    const query = _query ?? '';
    const limit = _limit ?? 20;
    switch (type) {
      case 'models': {
        try {
          const res = await fetch(
            `${BASE_URL}/models?search=${encodeURIComponent(query)}&limit=${limit}`,
            { headers: authHeaders() },
          );
          if (!res.ok) return [];
          const data = (await res.json()) as Array<{ modelId?: string; id?: string; [k: string]: unknown }>;
          return data.map((m) => ({
            id: m.modelId ?? m.id ?? 'unknown',
            type: 'models',
            label: m.modelId ?? m.id ?? 'unknown',
            data: m,
          }));
        } catch {
          return [];
        }
      }
      case 'spaces': {
        try {
          const res = await fetch(
            `${BASE_URL}/spaces?search=${encodeURIComponent(query)}&limit=${limit}`,
            { headers: authHeaders() },
          );
          if (!res.ok) return [];
          const data = (await res.json()) as Array<{ id?: string; [k: string]: unknown }>;
          return data.map((s) => ({
            id: s.id ?? 'unknown',
            type: 'spaces',
            label: s.id ?? 'unknown',
            data: s,
          }));
        } catch {
          return [];
        }
      }
      case 'datasets': {
        try {
          const res = await fetch(
            `${BASE_URL}/datasets?search=${encodeURIComponent(query)}&limit=${limit}`,
            { headers: authHeaders() },
          );
          if (!res.ok) return [];
          const data = (await res.json()) as Array<{ id?: string; [k: string]: unknown }>;
          return data.map((d) => ({
            id: d.id ?? 'unknown',
            type: 'datasets',
            label: d.id ?? 'unknown',
            data: d,
          }));
        } catch {
          return [];
        }
      }
      default:
        return [];
    }
  },

  async getResource(type, id) {
    const endpoint = type === 'models' ? 'models' : type === 'spaces' ? 'spaces' : type === 'datasets' ? 'datasets' : null;
    if (!endpoint) return null;
    try {
      const res = await fetch(`${BASE_URL}/${endpoint}/${id}`, { headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      return { id, type, label: id, data };
    } catch {
      return null;
    }
  },

  // -- Actions --
  actions: [
    { id: 'search_models', label: 'Search Models', description: 'Search the HuggingFace model hub', destructive: false },
    { id: 'create_space', label: 'Create Space', description: 'Create a new HuggingFace Space', destructive: false, produces: ['model'] },
    { id: 'delete_repo', label: 'Delete Repository', description: 'Delete a model, space, or dataset repository', destructive: true, requires: ['model'] },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'search_models': {
        const query = (params.query as string) ?? '';
        const limit = (params.limit as number) ?? 10;
        try {
          const res = await fetch(`${BASE_URL}/models?search=${encodeURIComponent(query)}&limit=${limit}`, { headers: authHeaders() });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          return { ok: true, result: await res.json() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'create_space': {
        const name = params.name as string | undefined;
        const sdk = (params.sdk as string) ?? 'gradio';
        if (!name) return { ok: false, error: 'Space name is required' };
        try {
          const res = await fetch(`${BASE_URL}/repos/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ name, type: 'space', sdk, private: false }),
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          return { ok: true, result: await res.json() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'delete_repo': {
        const repoId = params.repoId as string | undefined;
        const repoType = (params.type as string) ?? 'model';
        if (!repoId) return { ok: false, error: 'Repository ID is required' };
        try {
          const res = await fetch(`${BASE_URL}/repos/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ name: repoId, type: repoType }),
          });
          return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: ['model.downloaded', 'space.deployed'] satisfies CapabilityEventType[],
  subscribesTo: ['model.benchmark.completed'] satisfies CapabilityEventType[],
};
