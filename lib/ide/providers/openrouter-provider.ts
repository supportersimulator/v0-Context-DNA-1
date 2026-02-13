// =============================================================================
// openrouter-provider.ts — OpenRouter Multi-Model Inference Integration
//
// Routes inference requests to 100+ models via the OpenRouter unified API.
// OpenAI-compatible endpoint with model routing via the `model` field.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://openrouter.ai/api/v1';

function getApiKey(): string | undefined {
  return typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY : undefined;
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  const headers: Record<string, string> = {
    'HTTP-Referer': 'https://admin.contextdna.io',
    'X-Title': 'Context DNA',
  };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  return headers;
}

export const OpenRouterProvider: IntegrationProvider = {
  // -- Identity --
  id: 'openrouter',
  name: 'OpenRouter',
  icon: 'Globe',
  category: 'compute',
  description: 'Multi-model inference routing via OpenRouter (100+ models)',

  // -- Auth --
  auth: { type: 'api_key', envKey: 'OPENROUTER_API_KEY' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/auth/key`, { headers: authHeaders() });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: `OpenRouter not reachable: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['openrouter-models', 'openrouter-usage'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'models': {
        try {
          const res = await fetch(`${BASE_URL}/models`, { headers: authHeaders() });
          if (!res.ok) return [];
          const data = (await res.json()) as { data?: Array<{ id: string; name?: string; [k: string]: unknown }> };
          let models = data.data ?? [];
          if (_query) {
            const q = _query.toLowerCase();
            models = models.filter((m) => m.id.toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q));
          }
          if (_limit) models = models.slice(0, _limit);
          return models.map((m) => ({ id: m.id, type: 'models', label: m.name ?? m.id, data: m }));
        } catch {
          return [];
        }
      }
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'models': {
        try {
          const res = await fetch(`${BASE_URL}/models`, { headers: authHeaders() });
          if (!res.ok) return null;
          const data = (await res.json()) as { data?: Array<{ id: string; name?: string; [k: string]: unknown }> };
          const model = (data.data ?? []).find((m) => m.id === id);
          if (!model) return null;
          return { id, type: 'models', label: model.name ?? model.id, data: model };
        } catch {
          return null;
        }
      }
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    { id: 'chat', label: 'Chat Completion', description: 'Generate a chat completion via OpenRouter', destructive: false, requires: ['model'] },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'chat': {
        const model = params.model as string | undefined;
        const messages = params.messages as Array<{ role: string; content: string }> | undefined;
        if (!model) return { ok: false, error: 'Model is required' };
        if (!messages?.length) return { ok: false, error: 'Messages are required' };
        try {
          const res = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ model, messages, stream: false }),
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          return { ok: true, result: await res.json() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: ['inference.completed'] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
