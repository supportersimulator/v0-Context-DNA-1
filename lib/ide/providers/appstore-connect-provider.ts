// =============================================================================
// appstore-connect-provider.ts — App Store Connect / TestFlight Integration
//
// Manages TestFlight submissions, beta groups, testers, and App Store review
// status. Listens for EAS build readiness to auto-submit to TestFlight.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://api.appstoreconnect.apple.com/v1';

export const AppStoreConnectProvider: IntegrationProvider = {
  // -- Identity --
  id: 'appstore-connect',
  name: 'App Store Connect',
  icon: 'CircleDot',
  category: 'appdev',
  description: 'TestFlight distribution, beta testing, and App Store review management',

  // -- Auth --
  auth: { type: 'jwt', issuer: 'App Store Connect', keyFile: '.p8' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/apps`, {
        headers: { Authorization: 'Bearer <jwt-stub>' },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // -- Panels --
  panels: ['testflight', 'appstore-review', 'certificates'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'builds':
        // Stub: GET /v1/builds
        return [];
      case 'beta_groups':
        // Stub: GET /v1/betaGroups
        return [];
      case 'testers':
        // Stub: GET /v1/betaTesters
        return [];
      case 'apps':
        // Stub: GET /v1/apps
        return [];
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'builds':
        return { id, type: 'builds', label: `Build ${id}`, data: {} };
      case 'beta_groups':
        return { id, type: 'beta_groups', label: `Beta Group ${id}`, data: {} };
      case 'testers':
        return { id, type: 'testers', label: `Tester ${id}`, data: {} };
      case 'apps':
        return { id, type: 'apps', label: `App ${id}`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'submit_testflight',
      label: 'Submit to TestFlight',
      description: 'Submit a build for TestFlight beta review',
      destructive: false,
      requires: ['build'],
      produces: ['release'],
    },
    {
      id: 'add_to_beta_group',
      label: 'Add to Beta Group',
      description: 'Add a build or tester to a beta testing group',
      destructive: false,
    },
    {
      id: 'create_beta_review',
      label: 'Create Beta Review',
      description: 'Submit beta app review information for TestFlight',
      destructive: false,
      requires: ['build'],
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'submit_testflight': {
        const _buildId = params.buildId as string | undefined;
        // Stub: POST to App Store Connect API
        return { ok: true, result: { submitted: true, buildId: _buildId } };
      }
      case 'add_to_beta_group':
        return { ok: true, result: { added: true } };
      case 'create_beta_review':
        return { ok: true, result: { reviewCreated: true } };
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [
    'testflight.submitted',
    'testflight.approved',
    'testflight.feedback',
    'appstore.review.started',
    'appstore.review.approved',
    'appstore.review.rejected',
  ] satisfies CapabilityEventType[],

  subscribesTo: [
    'eas.build.ready',
  ] satisfies CapabilityEventType[],
};
