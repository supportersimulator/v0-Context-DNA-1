// =============================================================================
// docker-hub-provider.ts — Docker Hub / GHCR Integration
//
// Manages container image repositories, tags, and push/pull operations.
// Listens for build completion events to auto-push images.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://hub.docker.com/v2';

export const DockerHubProvider: IntegrationProvider = {
  // -- Identity --
  id: 'docker-hub',
  name: 'Docker Hub',
  icon: 'Container',
  category: 'registry',
  description: 'Container image registry for Docker Hub and GHCR',

  // -- Auth --
  auth: { type: 'api_key', envKey: 'DOCKER_TOKEN' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/repositories/`, {
        headers: { Authorization: `Bearer ${process.env.DOCKER_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // -- Panels --
  panels: ['docker-images', 'docker-builds'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'repositories':
        // Stub: GET /v2/repositories/{namespace}/
        return [];
      case 'images':
        // Stub: GET /v2/repositories/{namespace}/{repo}/images
        return [];
      case 'tags':
        // Stub: GET /v2/repositories/{namespace}/{repo}/tags
        return [];
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'repositories':
        return { id, type: 'repositories', label: `Repository ${id}`, data: {} };
      case 'images':
        return { id, type: 'images', label: `Image ${id}`, data: {} };
      case 'tags':
        return { id, type: 'tags', label: `Tag ${id}`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'pull_image',
      label: 'Pull Image',
      description: 'Pull a container image from the registry',
      destructive: false,
      produces: ['artifact'],
    },
    {
      id: 'push_image',
      label: 'Push Image',
      description: 'Push a local container image to the registry',
      destructive: false,
      requires: ['artifact'],
    },
    {
      id: 'delete_tag',
      label: 'Delete Tag',
      description: 'Remove a specific tag from a repository',
      destructive: true,
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'pull_image': {
        const _image = params.image as string | undefined;
        const _tag = params.tag as string | undefined;
        // Stub: docker pull equivalent via API
        return { ok: true, result: { pulled: true, image: _image, tag: _tag ?? 'latest' } };
      }
      case 'push_image': {
        const _image = params.image as string | undefined;
        // Stub: docker push equivalent via API
        return { ok: true, result: { pushed: true, image: _image } };
      }
      case 'delete_tag': {
        const _tag = params.tag as string | undefined;
        // Stub: DELETE /v2/repositories/{namespace}/{repo}/tags/{tag}
        return { ok: true, result: { deleted: true, tag: _tag } };
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [
    'image.pushed',
  ] satisfies CapabilityEventType[],

  subscribesTo: [
    'build.completed',
  ] satisfies CapabilityEventType[],
};
