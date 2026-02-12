import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://api.vercel.com';

export const VercelProvider: IntegrationProvider = {
  id: 'vercel',
  name: 'Vercel',
  icon: 'Triangle',
  category: 'deploy',
  description: 'Deploy, preview, and promote builds via Vercel platform.',

  auth: { type: 'api_key', envKey: 'VERCEL_TOKEN', headerName: 'Authorization' },

  panels: ['vercel-deploy', 'vercel-logs'],

  actions: [
    {
      id: 'deploy',
      label: 'Deploy',
      description: 'Trigger a new deployment for a project.',
      destructive: false,
      requires: ['repo'],
      produces: ['build'],
    },
    {
      id: 'promote',
      label: 'Promote to Production',
      description: 'Promote a preview deployment to production.',
      destructive: false,
    },
    {
      id: 'rollback',
      label: 'Rollback',
      description: 'Rollback production to a previous deployment.',
      destructive: true,
    },
  ],

  emits: ['deploy.started', 'deploy.ready', 'deploy.failed'] as CapabilityEventType[],
  subscribesTo: ['commit.pushed', 'ci.workflow.completed'] as CapabilityEventType[],

  async checkAuth() {
    try {
      const res = await fetch(`${BASE_URL}/v2/user`, {
        headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async listResources(type, query, limit = 20) {
    const endpoints: Record<string, string> = {
      deployments: '/v6/deployments',
      projects: '/v9/projects',
      domains: '/v5/domains',
    };
    const path = endpoints[type];
    if (!path) return [];
    void query; void limit;
    return [];
  },

  async getResource(type, id) {
    void type; void id;
    return null;
  },

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'deploy': {
        const projectId = params.projectId as string | undefined;
        if (!projectId) return { ok: false, error: 'projectId is required' };
        return { ok: true, result: { deploymentId: `dpl_stub_${Date.now()}` } };
      }
      case 'promote': {
        const deploymentId = params.deploymentId as string | undefined;
        if (!deploymentId) return { ok: false, error: 'deploymentId is required' };
        return { ok: true, result: { promoted: deploymentId } };
      }
      case 'rollback': {
        const deploymentId = params.deploymentId as string | undefined;
        if (!deploymentId) return { ok: false, error: 'deploymentId is required' };
        return { ok: true, result: { rolledBack: deploymentId } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },
};
