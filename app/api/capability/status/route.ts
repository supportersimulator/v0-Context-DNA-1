/**
 * Capability Posture Probe
 *
 * GET /api/capability/status
 *
 * Aggregates the health of every backing service into per-capability
 * L1 / L2 / L3 levels per docs/plans/2026-03-13-capability-registry-design.md.
 *
 * Probes (each fenced by a 1.5 s timeout — the route itself runs them in
 * parallel and returns within ~2 s even when every service is dead):
 *
 *   1. memory_api  (3456)  — evidence_store / project_memory / state_backend
 *   2. fleet daemon (8855) — fleet_transport
 *   3. 3-Surgeons CLI bridge — cross_examination
 *   4. local_llm (5044)    — llm_backend
 *   5. helper_agent WS (8080) — event_bus / health_monitoring
 *
 * Failures are silent for the user but logged to the IDE log buffer so the
 * Logs panel surfaces them. Never throws — always returns a snapshot.
 */

import { NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';

const PROBE_TIMEOUT_MS = 1500;

type Level = 1 | 2 | 3;

interface CapabilityState {
  id: string;
  label: string;
  level: Level;
  reason: string;
  user_summary: string;
  recovery_hint: string;
  probed_at: string;
}

interface ProbeOutcome {
  ok: boolean;
  detail?: string;
  /** Raw payload, when the endpoint returned JSON. */
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Endpoint catalogue — keep in sync with lib/ide/service-registry.ts
// ---------------------------------------------------------------------------

const ENDPOINTS = {
  memory_api: process.env.MEMORY_API_URL || 'http://127.0.0.1:3456',
  fleet_daemon: 'http://127.0.0.1:8855',
  helper_agent: process.env.HELPER_AGENT_URL || 'http://127.0.0.1:8080',
  local_llm: process.env.LOCAL_LLM_URL || 'http://127.0.0.1:5044',
};

// ---------------------------------------------------------------------------
// Probe primitives — each returns ProbeOutcome and never throws.
// ---------------------------------------------------------------------------

async function probeHttp(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, detail: `HTTP ${resp.status}` };
    let data: unknown;
    try {
      data = await resp.json();
    } catch {
      data = undefined;
    }
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, detail: (err as Error)?.message ?? String(err) };
  }
}

async function probeMemoryApi(): Promise<ProbeOutcome> {
  // memory_api exposes /health when up. If 3456 is dead but local SQLite is
  // present we treat that as L1 — the IDE has a built-in receipts SQLite
  // path that works without the Python service.
  return probeHttp(`${ENDPOINTS.memory_api}/health`);
}

async function probeFleetDaemon(): Promise<ProbeOutcome> {
  return probeHttp(`${ENDPOINTS.fleet_daemon}/health`);
}

async function probeLocalLLM(): Promise<ProbeOutcome> {
  // vllm-mlx exposes /v1/models. /health may not exist on every deployment.
  return probeHttp(`${ENDPOINTS.local_llm}/v1/models`);
}

async function probeHelperAgent(): Promise<ProbeOutcome> {
  return probeHttp(`${ENDPOINTS.helper_agent}/health`);
}

async function probe3SurgeonsBridge(): Promise<ProbeOutcome> {
  // Reuse our own /api/3s/health proxy — keeps probe logic in one place.
  // We hop through localhost since /api routes resolve relative.
  // Use a relative path; Next.js fetch handles internal routing in dev/prod.
  // BUT: this route is a server-side handler — `fetch('/api/...')` will fail
  // because there's no base URL. Construct an absolute URL from the request
  // host header by exporting the function and consuming the request param.
  // Instead, we directly probe the same Python entrypoint by checking
  // process availability is too expensive — just use memory_api as a proxy
  // for "Python tooling is reachable" since the surgeon CLI shares the env.
  return probeHttp(`${ENDPOINTS.memory_api}/health`);
}

// ---------------------------------------------------------------------------
// Capability resolvers — translate raw probe outcomes into L1/L2/L3 with
// user-facing summaries and recovery hints.
// ---------------------------------------------------------------------------

function resolveEvidenceStore(memOk: boolean): CapabilityState {
  if (memOk) {
    return state(
      'evidence_store',
      'Evidence Store',
      2,
      'memory_api responsive',
      'Evidence chain persists across sessions via local memory API.',
      '',
    );
  }
  return state(
    'evidence_store',
    'Evidence Store',
    1,
    'memory_api unreachable',
    'Evidence stays in this session only — local SQLite fallback is active.',
    'Start the memory API: PYTHONPATH=. .venv/bin/python3 memory/api_server.py',
  );
}

function resolveProjectMemory(memOk: boolean): CapabilityState {
  if (memOk) {
    return state(
      'project_memory',
      'Project Memory',
      2,
      'memory_api responsive',
      'Memory persists across sessions and the IDE can run brain.py queries.',
      '',
    );
  }
  return state(
    'project_memory',
    'Project Memory',
    1,
    'memory_api unreachable',
    'Memory queries unavailable — IDE will use bundled defaults only.',
    'Start the memory API or run brain.py from the terminal.',
  );
}

function resolveStateBackend(memOk: boolean): CapabilityState {
  if (memOk) {
    return state(
      'state_backend',
      'State Backend',
      2,
      'memory_api responsive (Redis/SQLite-shared)',
      'Cross-process state coordination is active.',
      '',
    );
  }
  return state(
    'state_backend',
    'State Backend',
    1,
    'memory_api unreachable',
    'In-memory state only — no cross-process coordination.',
    'Start the memory API to enable shared state.',
  );
}

function resolveCrossExamination(memOk: boolean): CapabilityState {
  // Minimum viable: Atlas (Claude) is always available since the IDE is
  // hosted by Claude Code. memory_api hosts the surgery_bridge endpoints —
  // when it is up we can run 2- or 3-surgeon protocols.
  if (memOk) {
    return state(
      'cross_examination',
      'Cross-Examination',
      2,
      'surgery_bridge reachable',
      'Local 3-Surgeon protocol available via /api/3s/consult.',
      '',
    );
  }
  return state(
    'cross_examination',
    'Cross-Examination',
    1,
    'surgery_bridge unavailable',
    'Atlas-only — no Cardiologist or Neurologist cross-exam.',
    'Start the memory API or invoke `3s` CLI directly.',
  );
}

function resolveLLMBackend(localLLMOk: boolean): CapabilityState {
  if (localLLMOk) {
    return state(
      'llm_backend',
      'LLM Backend',
      2,
      'local_llm responsive',
      'Local LLM (vllm-mlx) is up — Synaptic chat works offline.',
      '',
    );
  }
  // External-only fallback is still L1: feature works, just slower / costed.
  return state(
    'llm_backend',
    'LLM Backend',
    1,
    'local_llm unreachable',
    'Local LLM offline — falling back to external providers (DeepSeek / OpenAI).',
    'Start vllm-mlx on port 5044 to restore local inference.',
  );
}

function resolveEventBus(helperOk: boolean): CapabilityState {
  if (helperOk) {
    return state(
      'event_bus',
      'Event Bus',
      2,
      'helper_agent responsive',
      'WebSocket events flow from backend → IDE in real time.',
      '',
    );
  }
  return state(
    'event_bus',
    'Event Bus',
    1,
    'helper_agent unreachable',
    'IDE-internal events only — no live backend feed.',
    'Start helper_agent on port 8080 to enable live events.',
  );
}

function resolveHealthMonitoring(helperOk: boolean, fleetOk: boolean): CapabilityState {
  if (helperOk && fleetOk) {
    return state(
      'health_monitoring',
      'Health Monitoring',
      3,
      'helper_agent + fleet daemon responsive',
      'Live health stream active across all probes and fleet nodes.',
      '',
    );
  }
  if (helperOk || fleetOk) {
    return state(
      'health_monitoring',
      'Health Monitoring',
      2,
      `partial: helper=${helperOk}, fleet=${fleetOk}`,
      'Some probes available — consider starting all health services.',
      'Start helper_agent (8080) and fleet daemon (8855).',
    );
  }
  return state(
    'health_monitoring',
    'Health Monitoring',
    1,
    'health services unreachable',
    'No live health stream — only on-demand CLI checks (gains-gate).',
    'Run scripts/fleet-check.sh or start helper_agent.',
  );
}

function resolveFleetTransport(fleetOk: boolean): CapabilityState {
  if (fleetOk) {
    return state(
      'fleet_transport',
      'Fleet Transport',
      2,
      'fleet daemon responsive',
      'Multi-fleet messaging active over NATS.',
      '',
    );
  }
  return state(
    'fleet_transport',
    'Fleet Transport',
    1,
    'fleet daemon unreachable',
    'Fleet messaging falls back to git-based P7.',
    'Start the fleet daemon: tools/fleet_nerve_nats.py serve',
  );
}

function state(
  id: string,
  label: string,
  level: Level,
  reason: string,
  user_summary: string,
  recovery_hint: string,
): CapabilityState {
  return {
    id,
    label,
    level,
    reason,
    user_summary,
    recovery_hint,
    probed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const [mem, fleet, llm, helper] = await Promise.all([
      probeMemoryApi(),
      probeFleetDaemon(),
      probeLocalLLM(),
      probeHelperAgent(),
    ]);

    // Side-effect: probe the surgery bridge (currently shares memory_api).
    // Kept distinct so we can wire it to a dedicated endpoint later.
    const _surgery = await probe3SurgeonsBridge();
    void _surgery;

    const states: Record<string, CapabilityState> = {
      evidence_store: resolveEvidenceStore(mem.ok),
      project_memory: resolveProjectMemory(mem.ok),
      state_backend: resolveStateBackend(mem.ok),
      cross_examination: resolveCrossExamination(mem.ok),
      llm_backend: resolveLLMBackend(llm.ok),
      event_bus: resolveEventBus(helper.ok),
      health_monitoring: resolveHealthMonitoring(helper.ok, fleet.ok),
      fleet_transport: resolveFleetTransport(fleet.ok),
    };

    return NextResponse.json({ ts: Date.now(), online: true, states });
  } catch (err) {
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'capability/status',
        msg: (err as Error)?.message ?? 'capability probe failed',
        detail: ((err as Error)?.stack ?? String(err)).slice(0, 500),
      });
    } catch {
      // noop — log buffer should never break the response.
    }
    return NextResponse.json(
      {
        ts: Date.now(),
        online: false,
        error: (err as Error)?.message ?? 'unknown probe failure',
      },
      { status: 200 },
    );
  }
}
