// =============================================================================
// launchagent-manager-provider.ts — macOS LaunchAgent Service Manager
//
// Manages user-scope LaunchAgents via launchctl CLI.
// Only manages ~/Library/LaunchAgents (user scope — no sudo required).
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';
import { execFile as _execFile } from 'child_process';
import { promisify } from 'util';
import { readdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const execFile = promisify(_execFile);

const LAUNCH_AGENTS_DIR = join(homedir(), 'Library', 'LaunchAgents');

/** Validate label/path to prevent injection */
const SAFE_LABEL = /^[a-zA-Z0-9._-]+$/;

function validateLabel(label: string): boolean {
  return SAFE_LABEL.test(label) && label.length < 256;
}

async function getUid(): Promise<string> {
  const { stdout } = await execFile('id', ['-u']);
  return stdout.trim();
}

export const LaunchAgentManagerProvider: IntegrationProvider = {
  // -- Identity --
  id: 'launchagent-manager',
  name: 'LaunchAgent Manager',
  icon: 'Settings',
  category: 'system',
  description: 'macOS user LaunchAgent service management via launchctl',

  // -- Auth --
  auth: { type: 'none' as const },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      await execFile('launchctl', ['list'], { timeout: 5000 });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `launchctl not available: ${String(e)}` };
    }
  },

  // -- Panels --
  panels: ['launchagent-services', 'launchagent-logs'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'agents': {
        try {
          const { stdout } = await execFile('launchctl', ['list'], { timeout: 10000 });
          const lines = stdout.split('\n').slice(1).filter(Boolean); // skip header
          let agents = lines.map((line) => {
            const [pid, status, label] = line.split('\t');
            return {
              id: label ?? 'unknown',
              type: 'agents',
              label: `${label} (pid: ${pid}, status: ${status})`,
              data: { pid: pid === '-' ? null : Number(pid), status: Number(status), label },
            };
          });
          if (_query) {
            const q = _query.toLowerCase();
            agents = agents.filter((a) => a.id.toLowerCase().includes(q));
          }
          if (_limit) agents = agents.slice(0, _limit);
          return agents;
        } catch {
          return [];
        }
      }
      case 'plist_files': {
        try {
          const files = await readdir(LAUNCH_AGENTS_DIR);
          let plists = files
            .filter((f) => f.endsWith('.plist'))
            .map((f) => ({
              id: f.replace('.plist', ''),
              type: 'plist_files',
              label: f,
              data: { path: join(LAUNCH_AGENTS_DIR, f) },
            }));
          if (_query) {
            const q = _query.toLowerCase();
            plists = plists.filter((p) => p.label.toLowerCase().includes(q));
          }
          if (_limit) plists = plists.slice(0, _limit);
          return plists;
        } catch {
          return [];
        }
      }
      default:
        return [];
    }
  },

  async getResource(type, id) {
    if (!validateLabel(id)) return null;
    switch (type) {
      case 'agents': {
        try {
          const { stdout } = await execFile('launchctl', ['list', id], { timeout: 5000 });
          return { id, type: 'agents', label: id, data: { raw: stdout } };
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
    { id: 'load', label: 'Load Agent', description: 'Load a LaunchAgent plist', destructive: false },
    { id: 'unload', label: 'Unload Agent', description: 'Unload a running LaunchAgent', destructive: true },
    { id: 'kickstart', label: 'Kickstart Agent', description: 'Force-restart a LaunchAgent', destructive: false },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'load': {
        const label = params.label as string | undefined;
        const plistPath = params.plistPath as string | undefined;
        const path = plistPath ?? (label ? join(LAUNCH_AGENTS_DIR, `${label}.plist`) : undefined);
        if (!path) return { ok: false, error: 'Plist path or label is required' };
        try {
          const { stdout } = await execFile('launchctl', ['load', path], { timeout: 10000 });
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'unload': {
        const label = params.label as string | undefined;
        const plistPath = params.plistPath as string | undefined;
        const path = plistPath ?? (label ? join(LAUNCH_AGENTS_DIR, `${label}.plist`) : undefined);
        if (!path) return { ok: false, error: 'Plist path or label is required' };
        try {
          const { stdout } = await execFile('launchctl', ['unload', path], { timeout: 10000 });
          return { ok: true, result: { output: stdout } };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      }
      case 'kickstart': {
        const label = params.label as string | undefined;
        if (!label || !validateLabel(label)) return { ok: false, error: 'Valid service label is required' };
        try {
          const uid = await getUid();
          const { stdout } = await execFile('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`], { timeout: 10000 });
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
  emits: ['service.loaded', 'service.unloaded', 'service.error'] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
