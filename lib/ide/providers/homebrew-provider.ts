// =============================================================================
// homebrew-provider.ts — Homebrew Package Manager Integration
//
// Manages macOS packages and services via the Homebrew CLI.
// Uses execFile (NOT exec) to prevent command injection.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(_execFile);

/** Validate package names to prevent command injection */
const SAFE_NAME = /^[a-z0-9@._+/-]+$/;

function validateName(name: string): boolean {
  return SAFE_NAME.test(name) && name.length < 128;
}

async function brew(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFile('brew', args, { timeout: 30_000 });
}

export const HomebrewProvider: IntegrationProvider = {
  // -- Identity --
  id: 'homebrew',
  name: 'Homebrew',
  icon: 'Package',
  category: 'system',
  description: 'macOS package and service management via Homebrew',

  // -- Auth --
  auth: { type: 'none' as const },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { stdout } = await brew('--version');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Homebrew not installed: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['homebrew-packages', 'homebrew-services'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'packages': {
        try {
          const { stdout } = await brew('list', '--json=v2');
          const data = JSON.parse(stdout) as { formulae?: Array<{ name: string; [k: string]: unknown }>; casks?: Array<{ token: string; [k: string]: unknown }> };
          const formulae = (data.formulae ?? []).map((f) => ({ id: f.name, type: 'packages', label: f.name, data: { ...f, kind: 'formula' } }));
          const casks = (data.casks ?? []).map((c) => ({ id: c.token, type: 'packages', label: `${c.token} (cask)`, data: { ...c, kind: 'cask' } }));
          let result = [...formulae, ...casks];
          if (_query) {
            const q = _query.toLowerCase();
            result = result.filter((r) => r.label.toLowerCase().includes(q));
          }
          if (_limit) result = result.slice(0, _limit);
          return result;
        } catch {
          return [];
        }
      }
      case 'services': {
        try {
          const { stdout } = await brew('services', 'list', '--json');
          const data = JSON.parse(stdout) as Array<{ name: string; status: string; user?: string; file?: string }>;
          return data.map((s) => ({ id: s.name, type: 'services', label: `${s.name} (${s.status})`, data: s }));
        } catch {
          return [];
        }
      }
      case 'outdated': {
        try {
          const { stdout } = await brew('outdated', '--json=v2');
          const data = JSON.parse(stdout) as { formulae?: Array<{ name: string; [k: string]: unknown }> };
          return (data.formulae ?? []).map((f) => ({ id: f.name, type: 'outdated', label: f.name, data: f }));
        } catch {
          return [];
        }
      }
      default:
        return [];
    }
  },

  async getResource(type, id) {
    if (!validateName(id)) return null;
    switch (type) {
      case 'packages': {
        try {
          const { stdout } = await brew('info', '--json=v2', id);
          const data = JSON.parse(stdout);
          return { id, type: 'packages', label: id, data };
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
    { id: 'install', label: 'Install Package', description: 'Install a Homebrew formula or cask', destructive: false },
    { id: 'uninstall', label: 'Uninstall Package', description: 'Remove an installed package', destructive: true, requires: ['model'] },
    { id: 'upgrade', label: 'Upgrade Package', description: 'Upgrade an installed package to latest version', destructive: false },
    { id: 'start_service', label: 'Start Service', description: 'Start a Homebrew-managed service', destructive: false },
    { id: 'stop_service', label: 'Stop Service', description: 'Stop a Homebrew-managed service', destructive: true },
  ],

  async executeAction(actionId, params) {
    const name = params.name as string | undefined;
    if (actionId !== 'start_service' && actionId !== 'stop_service') {
      if (!name) return { ok: false, error: 'Package name is required' };
      if (!validateName(name)) return { ok: false, error: `Invalid package name: ${name}` };
    }

    switch (actionId) {
      case 'install': {
        try {
          const { stdout } = await brew('install', name!);
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'uninstall': {
        try {
          const { stdout } = await brew('uninstall', name!);
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'upgrade': {
        try {
          const { stdout } = await brew('upgrade', name!);
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'start_service': {
        const svcName = (params.name ?? params.service) as string | undefined;
        if (!svcName || !validateName(svcName)) return { ok: false, error: 'Valid service name is required' };
        try {
          const { stdout } = await brew('services', 'start', svcName);
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'stop_service': {
        const svcName = (params.name ?? params.service) as string | undefined;
        if (!svcName || !validateName(svcName)) return { ok: false, error: 'Valid service name is required' };
        try {
          const { stdout } = await brew('services', 'stop', svcName);
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: ['package.installed', 'service.started', 'service.stopped'] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
