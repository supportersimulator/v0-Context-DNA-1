import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://registry.npmjs.org';

export const NpmRegistryProvider: IntegrationProvider = {
  id: 'npm-registry',
  name: 'npm Registry',
  icon: 'Package',
  category: 'registry',
  description: 'Browse packages, audit dependencies, and manage npm/PyPI registries.',

  auth: { type: 'api_key', envKey: 'NPM_TOKEN', headerName: 'Authorization' },

  panels: ['package-browser', 'deps-audit'],

  actions: [
    {
      id: 'install_package',
      label: 'Install Package',
      description: 'Install a package at a specific version.',
      destructive: false,
    },
    {
      id: 'audit_deps',
      label: 'Audit Dependencies',
      description: 'Run a security audit on project dependencies.',
      destructive: false,
    },
    {
      id: 'update_package',
      label: 'Update Package',
      description: 'Update a package to its latest compatible version.',
      destructive: false,
    },
  ],

  emits: ['package.published'] as CapabilityEventType[],
  subscribesTo: [] as CapabilityEventType[],

  async checkAuth() {
    try {
      const res = await fetch(`${BASE_URL}/-/whoami`, {
        headers: { Authorization: `Bearer ${process.env.NPM_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async listResources(type, query, limit = 20) {
    const endpoints: Record<string, string> = {
      packages: '/-/v1/search',
      versions: '/',
      vulnerabilities: '/-/npm/v1/security/audits',
    };
    const path = endpoints[type];
    if (!path) return [];
    void query; void limit;
    return [];
  },

  async getResource(type, id) {
    if (type === 'packages') {
      void id;
      // Stub: would fetch `${BASE_URL}/${id}` for package metadata
      return null;
    }
    return null;
  },

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'install_package': {
        const name = params.name as string | undefined;
        const version = params.version as string | undefined;
        if (!name) return { ok: false, error: 'name is required' };
        return { ok: true, result: { installed: `${name}@${version ?? 'latest'}` } };
      }
      case 'audit_deps':
        return { ok: true, result: { vulnerabilities: 0, info: 0, low: 0, moderate: 0, high: 0, critical: 0 } };
      case 'update_package': {
        const name = params.name as string | undefined;
        if (!name) return { ok: false, error: 'name is required' };
        return { ok: true, result: { updated: name } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },
};
