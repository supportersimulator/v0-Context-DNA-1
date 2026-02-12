// =============================================================================
// ollama-provider.ts — Ollama Local Model Management Integration
//
// Manages locally-running LLM models via the Ollama REST API.
// Supports model pulling, deletion, and inference execution.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'http://127.0.0.1:11434';

export const OllamaProvider: IntegrationProvider = {
  // -- Identity --
  id: 'ollama',
  name: 'Ollama',
  icon: 'Bot',
  category: 'compute',
  description: 'Local LLM model management and inference via Ollama',

  // -- Auth --
  auth: { type: 'local_socket', socketPath: 'http://127.0.0.1:11434' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/api/version`);
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: `Ollama not reachable at ${BASE_URL}: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['ollama-models', 'ollama-chat'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'models': {
        // Stub: GET /api/tags returns locally available models
        try {
          const res = await fetch(`${BASE_URL}/api/tags`);
          if (!res.ok) return [];
          const data = (await res.json()) as { models?: Array<{ name: string; size: number; digest: string }> };
          return (data.models ?? []).map((m) => ({
            id: m.name,
            type: 'models',
            label: m.name,
            data: m,
          }));
        } catch {
          return [];
        }
      }
      case 'running': {
        // Stub: GET /api/ps returns running models
        try {
          const res = await fetch(`${BASE_URL}/api/ps`);
          if (!res.ok) return [];
          const data = (await res.json()) as { models?: Array<{ name: string; size: number }> };
          return (data.models ?? []).map((m) => ({
            id: m.name,
            type: 'running',
            label: `${m.name} (running)`,
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
          const res = await fetch(`${BASE_URL}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: id }),
          });
          if (!res.ok) return null;
          const data = await res.json();
          return { id, type: 'models', label: id, data };
        } catch {
          return null;
        }
      }
      case 'running':
        return { id, type: 'running', label: `${id} (running)`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'pull_model',
      label: 'Pull Model',
      description: 'Download a model from the Ollama library',
      destructive: false,
      produces: ['model'],
    },
    {
      id: 'delete_model',
      label: 'Delete Model',
      description: 'Remove a locally cached model',
      destructive: true,
      requires: ['model'],
    },
    {
      id: 'run_inference',
      label: 'Run Inference',
      description: 'Generate a completion using a local model',
      destructive: false,
      requires: ['model'],
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'pull_model': {
        const name = params.name as string | undefined;
        if (!name) return { ok: false, error: 'Model name is required' };
        try {
          const res = await fetch(`${BASE_URL}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, stream: false }),
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          const data = await res.json();
          return { ok: true, result: data };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'delete_model': {
        const name = params.name as string | undefined;
        if (!name) return { ok: false, error: 'Model name is required' };
        try {
          const res = await fetch(`${BASE_URL}/api/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'run_inference': {
        const model = params.model as string | undefined;
        const prompt = params.prompt as string | undefined;
        if (!model || !prompt) return { ok: false, error: 'Model and prompt are required' };
        try {
          const res = await fetch(`${BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false }),
          });
          if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
          const data = await res.json();
          return { ok: true, result: data };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [
    'model.downloaded',
    'model.deployed',
  ] satisfies CapabilityEventType[],

  subscribesTo: [
    'model.benchmark.completed',
  ] satisfies CapabilityEventType[],
};
