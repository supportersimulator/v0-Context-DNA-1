// =============================================================================
// eas-provider.ts — Expo Application Services (EAS) Integration
//
// Provides access to EAS Build and EAS Update pipelines.
// Listens for commit events to auto-trigger builds.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://api.expo.dev/v2';

export const EASProvider: IntegrationProvider = {
  // -- Identity --
  id: 'eas',
  name: 'Expo Application Services',
  icon: 'Smartphone',
  category: 'appdev',
  description: 'EAS Build & Update pipelines for React Native / Expo apps',

  // -- Auth --
  auth: { type: 'api_key', envKey: 'EXPO_TOKEN' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/projects`, {
        headers: { Authorization: `Bearer ${process.env.EXPO_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // -- Panels --
  panels: ['eas-build', 'eas-update'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'builds':
        // Stub: would call GET /v2/projects/{id}/builds
        return [];
      case 'updates':
        // Stub: would call GET /v2/projects/{id}/updates
        return [];
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'builds':
        return { id, type: 'builds', label: `Build ${id}`, data: {} };
      case 'updates':
        return { id, type: 'updates', label: `Update ${id}`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'start_build',
      label: 'Start Build',
      description: 'Queue a new EAS build for the given platform and profile',
      destructive: false,
      produces: ['build'],
    },
    {
      id: 'publish_update',
      label: 'Publish Update',
      description: 'Publish an OTA update to the specified channel',
      destructive: false,
      produces: ['release'],
    },
    {
      id: 'cancel_build',
      label: 'Cancel Build',
      description: 'Cancel a running or queued EAS build',
      destructive: true,
      requires: ['build'],
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'start_build': {
        const _platform = params.platform as string | undefined;
        const _profile = params.profile as string | undefined;
        // Stub: would POST to EAS Build API
        return { ok: true, result: { buildId: 'stub-build-id', status: 'queued' } };
      }
      case 'publish_update': {
        const _channel = params.channel as string | undefined;
        // Stub: would POST to EAS Update API
        return { ok: true, result: { updateId: 'stub-update-id', channel: _channel } };
      }
      case 'cancel_build':
        return { ok: true, result: { cancelled: true } };
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [
    'eas.build.started',
    'eas.build.ready',
    'eas.update.published',
  ] satisfies CapabilityEventType[],

  subscribesTo: [
    'commit.merged',
    'commit.pushed',
  ] satisfies CapabilityEventType[],
};
