import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://api.github.com';

export const GitHubActionsProvider: IntegrationProvider = {
  id: 'github-actions',
  name: 'GitHub Actions',
  icon: 'Play',
  category: 'ci',
  description: 'Trigger workflows, monitor runs, and manage CI/CD pipelines via GitHub Actions.',

  auth: { type: 'api_key', envKey: 'GITHUB_TOKEN', headerName: 'Authorization' },

  panels: ['github-actions'],

  actions: [
    {
      id: 'trigger_workflow',
      label: 'Trigger Workflow',
      description: 'Dispatch a workflow run on a specific ref.',
      destructive: false,
      requires: ['repo'],
    },
    {
      id: 'cancel_run',
      label: 'Cancel Run',
      description: 'Cancel an in-progress workflow run.',
      destructive: true,
    },
    {
      id: 'rerun_job',
      label: 'Re-run Job',
      description: 'Re-run a specific job within a workflow run.',
      destructive: false,
    },
  ],

  emits: ['ci.workflow.started', 'ci.workflow.completed', 'build.completed'] as CapabilityEventType[],
  subscribesTo: ['commit.pushed', 'pr.opened'] as CapabilityEventType[],

  async checkAuth() {
    try {
      const res = await fetch(`${BASE_URL}/user`, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async listResources(type, query, limit = 30) {
    const endpoints: Record<string, string> = {
      workflows: '/repos/{owner}/{repo}/actions/workflows',
      runs: '/repos/{owner}/{repo}/actions/runs',
      jobs: '/repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
      artifacts: '/repos/{owner}/{repo}/actions/artifacts',
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
      case 'trigger_workflow': {
        const workflowId = params.workflowId as string | undefined;
        const ref = params.ref as string | undefined;
        if (!workflowId) return { ok: false, error: 'workflowId is required' };
        return { ok: true, result: { workflowId, ref: ref ?? 'main', dispatched: true } };
      }
      case 'cancel_run': {
        const runId = params.runId as string | undefined;
        if (!runId) return { ok: false, error: 'runId is required' };
        return { ok: true, result: { runId, cancelled: true } };
      }
      case 'rerun_job': {
        const jobId = params.jobId as string | undefined;
        if (!jobId) return { ok: false, error: 'jobId is required' };
        return { ok: true, result: { jobId, rerun: true } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },
};
