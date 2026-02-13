// =============================================================================
// lm-studio-provider.ts — LM Studio Local LLM Integration
//
// Manages locally-running LLM models via the LM Studio OpenAI-compatible API.
// Supports model listing, chat completions, and embeddings generation.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'http://127.0.0.1:1234';

export const LMStudioProvider: IntegrationProvider = {
  // -- Identity --
  id: 'lm-studio',
  name: 'LM Studio',
  icon: 'Cpu',
  category: 'compute',
  description: 'Local LLM inference and model management via LM Studio',

  // -- Auth --
  auth: { type: 'local_socket', socketPath: 'http://127.0.0.1:1234' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/v1/models`);
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: `LM Studio not reachable at ${BASE_URL}: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['lm-studio-models', 'lm-studio-chat'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'models': {
        try {
          const res = await fetch(`${BASE_URL}/v1/models`);
          if (!res.ok) return [];
          const data = (await res.json()) as { data?: Array<{ id: string; [k: string]: unknown }> };
          return (data.data ?? []).map((m) => ({
            id: m.id,
            type: 'models',
            label: m.id,
            data: m,
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
    switch (type) {
      case 'models': {
        try {
          const res = await fetch(`${BASE_URL}/v1/models`);
          if (!res.ok) return null;
          const data = (await res.json()) as { data?: Array<{ id: string; [k: string]: unknown }> };
          const model = (data.data ?? []).find((m) => m.id === id);
          if (!model) return null;
          return { id, type: 'models', label: model.id, data: model };
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
    { id: 'chat', label: 'Chat Completion', description: 'Generate a chat completion using a loaded model', destructive: false, requires: ['model'] },
    { id: 'embeddings', label: 'Generate Embeddings', description: 'Generate embeddings for input text', destructive: false, requires: ['model'] },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'chat': {
        const model = params.model as string | undefined;
        const messages = params.messages as Array<{ role: string; content: string }> | undefined;
        if (!model) return { ok: false, error: 'Model is required' };
        if (!messages?.length) return { ok: false, error: 'Messages are required' };
        try {
          const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages, stream: false }),
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          return { ok: true, result: await res.json() };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'embeddings': {
        const model = params.model as string | undefined;
        const input = params.input as string | string[] | undefined;
        if (!model) return { ok: false, error: 'Model is required' };
        if (!input) return { ok: false, error: 'Input text is required' };
        try {
          const res = await fetch(`${BASE_URL}/v1/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input }),
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
  emits: ['model.loaded', 'model.unloaded'] satisfies CapabilityEventType[],
  subscribesTo: ['model.benchmark.completed'] satisfies CapabilityEventType[],
};
