import { ipcMain, IpcMainInvokeEvent } from 'electron';

// Docker integration via unix socket (dockerode will be optional dependency)
// Falls back gracefully if Docker is not installed

let Docker: any = null;
try {
  Docker = require('dockerode');
} catch {
  // dockerode not installed — docker features disabled
}

function getDockerClient() {
  if (!Docker) return null;
  try {
    return new Docker({ socketPath: '/var/run/docker.sock' });
  } catch {
    return null;
  }
}

export function registerDockerHandlers() {
  ipcMain.handle('docker:listContainers', async () => {
    const docker = getDockerClient();
    if (!docker) return { error: 'Docker not available', containers: [] };

    try {
      const containers = await docker.listContainers({ all: true });
      return {
        containers: containers.map((c: any) => ({
          id: c.Id.substring(0, 12),
          names: c.Names.map((n: string) => n.replace(/^\//, '')),
          image: c.Image,
          state: c.State,
          status: c.Status,
          ports: c.Ports,
          labels: c.Labels,
        })),
      };
    } catch (err: any) {
      return { error: err.message, containers: [] };
    }
  });

  ipcMain.handle('docker:containerStats', async (_event: IpcMainInvokeEvent, id: string) => {
    const docker = getDockerClient();
    if (!docker) return { error: 'Docker not available' };

    try {
      const container = docker.getContainer(id);
      const stats = await container.stats({ stream: false });
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus ?? 1) * 100 : 0;
      const memUsage = stats.memory_stats.usage ?? 0;
      const memLimit = stats.memory_stats.limit ?? 1;

      return {
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: {
          usage: memUsage,
          limit: memLimit,
          percent: Math.round((memUsage / memLimit) * 10000) / 100,
        },
      };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('docker:containerLogs', async (_event: IpcMainInvokeEvent, id: string, tail = 100) => {
    const docker = getDockerClient();
    if (!docker) return { error: 'Docker not available', logs: '' };

    try {
      const container = docker.getContainer(id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });
      return { logs: logs.toString('utf-8') };
    } catch (err: any) {
      return { error: err.message, logs: '' };
    }
  });

  ipcMain.handle('docker:containerAction', async (_event: IpcMainInvokeEvent, id: string, action: string) => {
    const docker = getDockerClient();
    if (!docker) return { error: 'Docker not available' };

    try {
      const container = docker.getContainer(id);
      switch (action) {
        case 'start': await container.start(); break;
        case 'stop': await container.stop(); break;
        case 'restart': await container.restart(); break;
        default: return { error: `Unknown action: ${action}` };
      }
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  });
}
