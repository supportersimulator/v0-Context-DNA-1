// =============================================================================
// stackblitz-provider.ts — StackBlitz / CodeSandbox Live Sandbox Integration
//
// Provides instant cloud-based code sandboxes for prototyping and sharing.
// No auth required — sandboxes are created anonymously.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

export const StackBlitzProvider: IntegrationProvider = {
  // -- Identity --
  id: 'stackblitz',
  name: 'StackBlitz',
  icon: 'Zap',
  category: 'compute',
  description: 'Live code sandbox for prototyping and sharing',

  // -- Auth --
  auth: { type: 'none' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  },

  // -- Panels --
  panels: ['live-sandbox'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'projects':
        // Stub: would list user's StackBlitz projects
        return [];
      case 'templates':
        // Stub: would list available starter templates
        return [];
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'projects':
        return { id, type: 'projects', label: `Project ${id}`, data: {} };
      case 'templates':
        return { id, type: 'templates', label: `Template ${id}`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'create_sandbox',
      label: 'Create Sandbox',
      description: 'Create a new live sandbox from a template',
      destructive: false,
    },
    {
      id: 'fork_repo',
      label: 'Fork Repository',
      description: 'Open a GitHub repository in a live sandbox',
      destructive: false,
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'create_sandbox': {
        const _template = params.template as string | undefined;
        // Stub: would call StackBlitz SDK to create sandbox
        return { ok: true, result: { sandboxId: 'stub-sandbox-id', template: _template } };
      }
      case 'fork_repo': {
        const _repoUrl = params.repoUrl as string | undefined;
        // Stub: would open repo in StackBlitz WebContainer
        return { ok: true, result: { sandboxId: 'stub-fork-id', repoUrl: _repoUrl } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
