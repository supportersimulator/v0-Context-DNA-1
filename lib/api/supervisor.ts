// =============================================================================
// Supervisor API client — bridges to Swift BridgeServer on 127.0.0.1:9090
//
// Two access paths:
//   1. Electron IPC (preferred) — window.electron.supervisor.*
//   2. Direct HTTP (fallback)   — fetch('http://127.0.0.1:9090/api/...')
//
// The IPC path goes: renderer → main process → supervisor HTTP → response
// The direct path is for non-Electron environments (dev server, tests).
// =============================================================================

import {
  API_BASE,
  type SupervisorHealth,
  type SupervisorServiceState,
  type SupervisorModeState,
  type SupervisorActionResult,
  type SupervisorPing,
} from './types';

const BASE = API_BASE.supervisor;
const TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Electron bridge detection
// ---------------------------------------------------------------------------

function getElectronSupervisor(): any | null {
  if (typeof window !== 'undefined' && (window as any).electron?.supervisor) {
    return (window as any).electron.supervisor;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getSupervisorHealth(): Promise<SupervisorHealth> {
  const electron = getElectronSupervisor();
  if (electron) {
    return electron.health();
  }

  try {
    const res = await fetch(`${BASE}/api/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch {
    return {
      timestamp: new Date().toISOString(),
      status: 'unknown',
      healthy_count: 0,
      total_count: 0,
      mode: {
        current: 'unknown',
        intended: 'unknown',
        scheduler: 'unknown',
        transitioning: false,
        celery_locked: false,
      },
      services: [],
      _source: 'unavailable',
    };
  }
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function getSupervisorServices(): Promise<SupervisorServiceState[]> {
  const electron = getElectronSupervisor();
  if (electron) {
    const result = await electron.services();
    return result.services || [];
  }

  try {
    const res = await fetch(`${BASE}/api/services`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.services || [];
  } catch {
    return [];
  }
}

export async function supervisorServiceAction(
  serviceId: string,
  action: 'start' | 'stop' | 'restart'
): Promise<SupervisorActionResult> {
  const electron = getElectronSupervisor();
  if (electron) {
    return electron.serviceAction(serviceId, action);
  }

  try {
    const res = await fetch(`${BASE}/api/services/${serviceId}/${action}`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.json();
  } catch (err: any) {
    return { ok: false, action, service: serviceId, error: err.message };
  }
}

export async function supervisorBulkAction(
  action: 'start-all' | 'stop-all'
): Promise<SupervisorActionResult> {
  const electron = getElectronSupervisor();
  if (electron) {
    return electron.bulkAction(action);
  }

  try {
    const res = await fetch(`${BASE}/api/services/${action}`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.json();
  } catch (err: any) {
    return { ok: false, action, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

export async function getSupervisorMode(): Promise<SupervisorModeState> {
  const electron = getElectronSupervisor();
  if (electron) {
    return electron.mode();
  }

  try {
    const res = await fetch(`${BASE}/api/mode`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch {
    return {
      current: 'unknown',
      intended: 'unknown',
      scheduler: 'unknown',
      transitioning: false,
      celery_locked: false,
    };
  }
}

export async function setSupervisorMode(
  mode: 'lite' | 'heavy'
): Promise<SupervisorActionResult> {
  const electron = getElectronSupervisor();
  if (electron) {
    return electron.mode(mode);
  }

  try {
    const res = await fetch(`${BASE}/api/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.json();
  } catch (err: any) {
    return { ok: false, action: 'set-mode', error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Ping — check if supervisor is reachable
// ---------------------------------------------------------------------------

export async function pingSupervisor(): Promise<SupervisorPing> {
  const electron = getElectronSupervisor();
  if (electron) {
    return electron.ping();
  }

  try {
    await fetch(`${BASE}/api/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { reachable: true, url: BASE };
  } catch {
    return { reachable: false, url: BASE };
  }
}
