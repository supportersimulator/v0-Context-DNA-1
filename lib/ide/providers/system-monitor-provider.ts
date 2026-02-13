// =============================================================================
// system-monitor-provider.ts — OS Resource Monitoring Integration
//
// Monitors CPU, memory, disk, and system load via Node.js built-in APIs.
// Emits alerts when resource thresholds are exceeded.
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';
import * as os from 'os';

export const SystemMonitorProvider: IntegrationProvider = {
  // -- Identity --
  id: 'system-monitor',
  name: 'System Monitor',
  icon: 'Activity',
  category: 'system',
  description: 'OS resource monitoring — CPU, memory, disk, and process health',

  // -- Auth --
  auth: { type: 'none' as const },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  },

  // -- Panels --
  panels: ['sys-cpu', 'sys-memory', 'sys-disk', 'sys-processes'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'cpu': {
        const cpus = os.cpus();
        return cpus.map((cpu, i) => ({
          id: `cpu-${i}`,
          type: 'cpu',
          label: `${cpu.model} (${cpu.speed} MHz)`,
          data: cpu,
        }));
      }
      case 'memory': {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return [{
          id: 'system-memory',
          type: 'memory',
          label: `${Math.round(used / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB (${Math.round(used / total * 100)}%)`,
          data: { totalMB: Math.round(total / 1024 / 1024), freeMB: Math.round(free / 1024 / 1024), usedPercent: Math.round(used / total * 100) },
        }];
      }
      case 'loadavg': {
        const [min1, min5, min15] = os.loadavg();
        return [{
          id: 'system-load',
          type: 'loadavg',
          label: `Load: ${min1.toFixed(2)} / ${min5.toFixed(2)} / ${min15.toFixed(2)}`,
          data: { '1min': min1, '5min': min5, '15min': min15, cpuCount: os.cpus().length },
        }];
      }
      case 'uptime': {
        const uptime = os.uptime();
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        return [{
          id: 'system-uptime',
          type: 'uptime',
          label: `Uptime: ${hours}h ${mins}m`,
          data: { seconds: uptime, hours, minutes: mins },
        }];
      }
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'memory': {
        const total = os.totalmem();
        const free = os.freemem();
        return {
          id: 'system-memory',
          type: 'memory',
          label: 'System Memory',
          data: { totalMB: Math.round(total / 1024 / 1024), freeMB: Math.round(free / 1024 / 1024) },
        };
      }
      case 'loadavg': {
        const [min1, min5, min15] = os.loadavg();
        return {
          id: 'system-load',
          type: 'loadavg',
          label: 'System Load',
          data: { '1min': min1, '5min': min5, '15min': min15 },
        };
      }
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'kill_process',
      label: 'Kill Process',
      description: 'Send SIGTERM to a process by PID (requires confirmation)',
      destructive: true,
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'kill_process': {
        const pid = params.pid as number | undefined;
        if (!pid || typeof pid !== 'number') return { ok: false, error: 'Numeric PID is required' };
        try {
          process.kill(pid, 'SIGTERM');
          return { ok: true, result: { killed: pid } };
        } catch (e) {
          return { ok: false, error: `Failed to kill PID ${pid}: ${String(e)}` };
        }
      }
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: ['system.high_cpu', 'system.low_disk', 'system.high_memory'] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
