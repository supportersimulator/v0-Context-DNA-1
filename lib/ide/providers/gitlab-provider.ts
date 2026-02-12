// =============================================================================
// gitlab-provider.ts — GitLab Repos & CI/CD Integration
//
// Provides access to GitLab projects, pipelines, merge requests, and issues.
// Emits VCS and CI events for cross-panel coordination.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://gitlab.com/api/v4';

export const GitLabProvider: IntegrationProvider = {
  // -- Identity --
  id: 'gitlab',
  name: 'GitLab',
  icon: 'GitBranch',
  category: 'vcs',
  description: 'GitLab repositories, CI/CD pipelines, and merge requests',

  // -- Auth --
  auth: { type: 'api_key', envKey: 'GITLAB_TOKEN', headerName: 'PRIVATE-TOKEN' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/user`, {
        headers: { 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN ?? '' },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // -- Panels --
  panels: ['gitlab-repos', 'gitlab-ci'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'projects':
        // Stub: would call GET /projects
        return [];
      case 'pipelines':
        // Stub: would call GET /projects/:id/pipelines
        return [];
      case 'merge_requests':
        // Stub: would call GET /merge_requests
        return [];
      case 'issues':
        // Stub: would call GET /issues
        return [];
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'projects':
        return { id, type: 'projects', label: `Project ${id}`, data: {} };
      case 'pipelines':
        return { id, type: 'pipelines', label: `Pipeline ${id}`, data: {} };
      case 'merge_requests':
        return { id, type: 'merge_requests', label: `MR !${id}`, data: {} };
      case 'issues':
        return { id, type: 'issues', label: `Issue #${id}`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'trigger_pipeline',
      label: 'Trigger Pipeline',
      description: 'Trigger a CI/CD pipeline for a project ref',
      destructive: false,
    },
    {
      id: 'approve_mr',
      label: 'Approve Merge Request',
      description: 'Approve a merge request',
      destructive: false,
    },
    {
      id: 'create_issue',
      label: 'Create Issue',
      description: 'Create a new issue in a GitLab project',
      destructive: false,
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'trigger_pipeline': {
        const _projectId = params.projectId as string | undefined;
        const _ref = params.ref as string | undefined;
        // Stub: would POST /projects/:id/pipeline
        return { ok: true, result: { pipelineId: 'stub-pipeline-id', ref: _ref, status: 'created' } };
      }
      case 'approve_mr': {
        const _mrId = params.mrId as string | undefined;
        // Stub: would POST /projects/:id/merge_requests/:mr_iid/approve
        return { ok: true, result: { mrId: _mrId, approved: true } };
      }
      case 'create_issue': {
        const _title = params.title as string | undefined;
        const _description = params.description as string | undefined;
        // Stub: would POST /projects/:id/issues
        return { ok: true, result: { issueId: 'stub-issue-id', title: _title } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [
    'commit.pushed',
    'pr.opened',
    'pr.merged',
    'ci.workflow.started',
    'ci.workflow.completed',
  ] satisfies CapabilityEventType[],

  subscribesTo: [] satisfies CapabilityEventType[],
};
