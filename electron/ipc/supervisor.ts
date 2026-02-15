import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { readFile } from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Swift Supervisor Bridge — HTTP API on 127.0.0.1:9090
//
// The native macOS supervisor manages 4 services (LLM, Agent, Scheduler, Voice)
// and exposes a local REST API. This IPC handler bridges Electron renderer ↔
// main process ↔ supervisor.
//
// Fallback: if supervisor is unreachable, reads .supervisor_health.json directly.
// ---------------------------------------------------------------------------

const SUPERVISOR_URL =
  process.env.SUPERVISOR_URL || 'http://127.0.0.1:9090';

const REPO_ROOT =
  process.env.REPO_ROOT ||
  path.join(process.env.HOME || '', 'Documents/er-simulator-superrepo');

const HEALTH_JSON_PATH = path.join(REPO_ROOT, 'memory/.supervisor_health.json');

// Timeout for supervisor API calls (supervisor is local, should be fast)
const TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function supervisorFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPERVISOR_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supervisor ${res.status}: ${body}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function readHealthJSON(): Promise<any> {
  try {
    const data = await readFile(HEALTH_JSON_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSupervisorHandlers() {
  // -------------------------------------------------------------------------
  // GET /api/health — overall health + all service states
  // Fallback: read .supervisor_health.json if bridge unreachable
  // -------------------------------------------------------------------------
  ipcMain.handle('supervisor:health', async () => {
    try {
      return await supervisorFetch('/api/health');
    } catch {
      // Fallback: read JSON file directly
      const fileData = await readHealthJSON();
      if (fileData) {
        return { ...fileData, _source: 'file_fallback' };
      }
      return {
        error: 'Supervisor unreachable',
        status: 'unknown',
        services: [],
        _source: 'unavailable',
      };
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/services — full service details
  // -------------------------------------------------------------------------
  ipcMain.handle('supervisor:services', async () => {
    try {
      return await supervisorFetch('/api/services');
    } catch (err: any) {
      // Fallback: extract services from health JSON
      const fileData = await readHealthJSON();
      if (fileData?.services) {
        return { services: fileData.services, _source: 'file_fallback' };
      }
      return { error: err.message, services: [] };
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/services/:id/:action — start/stop/restart a service
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'supervisor:serviceAction',
    async (
      _event: IpcMainInvokeEvent,
      serviceId: string,
      action: 'start' | 'stop' | 'restart'
    ) => {
      try {
        return await supervisorFetch(
          `/api/services/${serviceId}/${action}`,
          { method: 'POST' }
        );
      } catch (err: any) {
        return { error: err.message, ok: false };
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/services/start-all | stop-all
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'supervisor:bulkAction',
    async (_event: IpcMainInvokeEvent, action: 'start-all' | 'stop-all') => {
      try {
        return await supervisorFetch(`/api/services/${action}`, {
          method: 'POST',
        });
      } catch (err: any) {
        return { error: err.message, ok: false };
      }
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/mode — current mode state
  // POST /api/mode — set intended mode (triggers lite↔heavy transition)
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'supervisor:mode',
    async (_event: IpcMainInvokeEvent, mode?: 'lite' | 'heavy') => {
      try {
        if (mode) {
          // POST — set mode
          return await supervisorFetch('/api/mode', {
            method: 'POST',
            body: JSON.stringify({ mode }),
          });
        }
        // GET — read mode
        return await supervisorFetch('/api/mode');
      } catch (err: any) {
        // Fallback: extract mode from health JSON
        const fileData = await readHealthJSON();
        if (fileData?.mode) {
          return { ...fileData.mode, _source: 'file_fallback' };
        }
        return {
          error: err.message,
          current: 'unknown',
          intended: 'unknown',
          transitioning: false,
        };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Check if supervisor is reachable
  // -------------------------------------------------------------------------
  ipcMain.handle('supervisor:ping', async () => {
    try {
      await supervisorFetch('/api/health');
      return { reachable: true, url: SUPERVISOR_URL };
    } catch {
      // Check if health JSON exists (supervisor running but bridge not up)
      const fileData = await readHealthJSON();
      return {
        reachable: false,
        url: SUPERVISOR_URL,
        healthJsonAvailable: fileData !== null,
      };
    }
  });
}
