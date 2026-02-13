// =============================================================================
// nodered-provider.ts — Node-RED Flow Editor Integration
//
// Manages flows, nodes, and runtime via the Node-RED Admin API.
// Supports flow deployment, node injection, and module installation.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'http://127.0.0.1:1880';

export const NodeREDProvider: IntegrationProvider = {
  // -- Identity --
  id: 'nodered',
  name: 'Node-RED',
  icon: 'Workflow',
  category: 'automation',
  description: 'Flow-based automation via the Node-RED Admin API',

  // -- Auth --
  auth: { type: 'local_socket', socketPath: 'http://127.0.0.1:1880' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/settings`);
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: `Node-RED not reachable at ${BASE_URL}: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['nodered-flows', 'nodered-editor'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'flows': {
        try {
          const res = await fetch(`${BASE_URL}/flows`);
          if (!res.ok) return [];
          const data = (await res.json()) as Array<{ id: string; label?: string; type?: string; [k: string]: unknown }>;
          return data
            .filter((f) => f.type === 'tab')
            .map((f) => ({ id: f.id, type: 'flows', label: f.label ?? f.id, data: f }));
        } catch {
          return [];
        }
      }
      case 'nodes': {
        try {
          const res = await fetch(`${BASE_URL}/nodes`);
          if (!res.ok) return [];
          const data = (await res.json()) as Array<{ id: string; types?: string[]; [k: string]: unknown }>;
          return data.map((n) => ({ id: n.id, type: 'nodes', label: n.id, data: n }));
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
      case 'flows': {
        try {
          const res = await fetch(`${BASE_URL}/flow/${id}`);
          if (!res.ok) return null;
          const data = await res.json();
          return { id, type: 'flows', label: (data as { label?: string }).label ?? id, data };
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
    { id: 'deploy_flows', label: 'Deploy Flows', description: 'Deploy all flows to the Node-RED runtime', destructive: false },
    { id: 'inject_node', label: 'Inject Node', description: 'Trigger an inject node by ID', destructive: false },
    { id: 'install_node', label: 'Install Node Module', description: 'Install a node-red-contrib module', destructive: false },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'deploy_flows': {
        const flows = params.flows as unknown;
        if (!flows) return { ok: false, error: 'Flows payload is required' };
        try {
          const res = await fetch(`${BASE_URL}/flows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Node-RED-Deployment-Type': 'full' },
            body: JSON.stringify(flows),
          });
          return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'inject_node': {
        const nodeId = params.nodeId as string | undefined;
        if (!nodeId) return { ok: false, error: 'Node ID is required' };
        try {
          const res = await fetch(`${BASE_URL}/inject/${nodeId}`, { method: 'POST' });
          return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'install_node': {
        const module = params.module as string | undefined;
        if (!module) return { ok: false, error: 'Module name is required' };
        try {
          const res = await fetch(`${BASE_URL}/nodes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ module }),
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
  emits: ['nodered.flow.deployed', 'nodered.error'] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
