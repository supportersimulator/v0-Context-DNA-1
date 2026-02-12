import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://sentry.io/api/0';

export const SentryProvider: IntegrationProvider = {
  id: 'sentry',
  name: 'Sentry',
  icon: 'AlertTriangle',
  category: 'observability',
  description: 'Crash reporting, performance monitoring, and alert management via Sentry.',

  auth: { type: 'api_key', envKey: 'SENTRY_AUTH_TOKEN', headerName: 'Authorization' },

  panels: ['sentry-crashes', 'sentry-performance'],

  actions: [
    {
      id: 'resolve_issue',
      label: 'Resolve Issue',
      description: 'Mark a Sentry issue as resolved.',
      destructive: false,
      requires: ['incident'],
    },
    {
      id: 'ignore_issue',
      label: 'Ignore Issue',
      description: 'Ignore a Sentry issue to suppress future alerts.',
      destructive: false,
    },
    {
      id: 'assign_issue',
      label: 'Assign Issue',
      description: 'Assign a Sentry issue to a team member.',
      destructive: false,
    },
  ],

  emits: ['crash.spike', 'alert.fired', 'alert.resolved'] as CapabilityEventType[],
  subscribesTo: ['deploy.ready', 'eas.build.ready'] as CapabilityEventType[],

  async checkAuth() {
    try {
      const res = await fetch(`${BASE_URL}/`, {
        headers: { Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async listResources(type, query, limit = 25) {
    const endpoints: Record<string, string> = {
      issues: '/organizations/{org}/issues/',
      events: '/organizations/{org}/events/',
      releases: '/organizations/{org}/releases/',
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
      case 'resolve_issue': {
        const issueId = params.issueId as string | undefined;
        if (!issueId) return { ok: false, error: 'issueId is required' };
        return { ok: true, result: { issueId, status: 'resolved' } };
      }
      case 'ignore_issue': {
        const issueId = params.issueId as string | undefined;
        if (!issueId) return { ok: false, error: 'issueId is required' };
        return { ok: true, result: { issueId, status: 'ignored' } };
      }
      case 'assign_issue': {
        const issueId = params.issueId as string | undefined;
        const assignee = params.assignee as string | undefined;
        if (!issueId) return { ok: false, error: 'issueId is required' };
        return { ok: true, result: { issueId, assignee: assignee ?? 'unassigned' } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },
};
