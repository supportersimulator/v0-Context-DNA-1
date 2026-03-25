import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { loadEndpoints } from '../config';

// ---------------------------------------------------------------------------
// 3-Surgeon IPC Bridge — agent_service HTTP API
//
// Bridges Electron renderer to the /contextdna/surgeons/* endpoints on
// agent_service (port 8080). Provides cross-exam, consensus, probe, and
// gains-gate operations for the dashboard.
// ---------------------------------------------------------------------------

const endpoints = loadEndpoints();
const AGENT_URL = endpoints.agentService;

// Probe/status: fast (3s). Cross-exam: slow (up to 300s for 6 LLM calls).
const TIMEOUT_PROBE_MS = 5000;
const TIMEOUT_CROSS_EXAM_MS = 310000; // 300s server + 10s buffer
const TIMEOUT_CONSENSUS_MS = 60000;
const TIMEOUT_GATE_MS = 70000; // 60s server + 10s buffer

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function surgeonFetch(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = TIMEOUT_PROBE_MS
): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${AGENT_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Agent service ${res.status}: ${body}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSurgeonHandlers() {
  // -------------------------------------------------------------------------
  // Probe — health check all 3 surgeons (fast, ~5s)
  // -------------------------------------------------------------------------
  ipcMain.handle('surgeons:probe', async () => {
    try {
      return await surgeonFetch('/contextdna/surgeons/probe');
    } catch (err: any) {
      return {
        error: err.message,
        neurologist: { ok: false },
        cardiologist: { ok: false },
        atlas: { ok: true, note: 'always present' },
        _source: 'unavailable',
      };
    }
  });

  // -------------------------------------------------------------------------
  // Cross-exam — full 3-phase pipeline (slow, 60-300s)
  // Returns: { ok, topic, phases: { initial, cross_exam, exploration }, ... }
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'surgeons:crossExam',
    async (_event: IpcMainInvokeEvent, topic: string) => {
      if (!topic || topic.trim().length < 6) {
        return { ok: false, error: 'Topic must be at least 6 characters' };
      }

      try {
        return await surgeonFetch(
          `/contextdna/surgeons/cross-exam?topic=${encodeURIComponent(topic.trim())}`,
          { method: 'POST' },
          TIMEOUT_CROSS_EXAM_MS
        );
      } catch (err: any) {
        return { ok: false, error: err.message, topic: topic.slice(0, 80) };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Consensus — confidence-weighted vote on a claim (~30s)
  // -------------------------------------------------------------------------
  ipcMain.handle(
    'surgeons:consensus',
    async (_event: IpcMainInvokeEvent, claim: string) => {
      if (!claim || claim.trim().length < 6) {
        return { ok: false, error: 'Claim must be at least 6 characters' };
      }

      try {
        return await surgeonFetch(
          `/contextdna/surgeons/consensus?claim=${encodeURIComponent(claim.trim())}`,
          { method: 'POST' },
          TIMEOUT_CONSENSUS_MS
        );
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    }
  );

  // -------------------------------------------------------------------------
  // Gains gate — run gains-gate.sh via agent_service (~60s)
  // -------------------------------------------------------------------------
  ipcMain.handle('surgeons:gainsGate', async () => {
    try {
      return await surgeonFetch(
        '/contextdna/surgeons/gains-gate',
        { method: 'POST' },
        TIMEOUT_GATE_MS
      );
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  // -------------------------------------------------------------------------
  // Status — recent cross-exams, routing info, surgeon list
  // -------------------------------------------------------------------------
  ipcMain.handle('surgeons:status', async () => {
    try {
      return await surgeonFetch('/contextdna/surgeons/status');
    } catch (err: any) {
      return {
        error: err.message,
        recent_cross_exams: [],
        routing: { error: 'Agent service unreachable' },
        surgeons: {
          atlas: 'claude-opus (this session)',
          cardiologist: 'gpt-4.1-mini (OpenAI)',
          neurologist: 'Qwen3-4B-4bit (local MLX)',
        },
        _source: 'unavailable',
      };
    }
  });
}
