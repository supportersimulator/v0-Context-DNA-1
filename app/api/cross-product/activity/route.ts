/**
 * Cross-Product Activity Feed
 *
 * GET /api/cross-product/activity?limit=50
 *
 * Aggregates a unified, time-ordered activity stream across the 5-product
 * surface so the IDE has ONE place to watch the system breathe:
 *   - Multi-Fleet daemon (port 8855)        → fleet.* events
 *   - 3-Surgeons agent_service (port 8080)  → surgeon.* events
 *   - ER Simulator (Expo dev server, 8081)  → er-sim.* events
 *
 * This implements Wire 2 ("Evidence bidirectional sync") of the 5-product
 * wiring plan from the IDE consumer side: instead of three separate dashboards
 * showing different views, callers get one stream sorted by timestamp.
 *
 * Stub-friendly: each backend probe is wrapped in try/catch with a 1.5s
 * timeout, so the route always returns 200 with whichever sources responded.
 * `errors[]` reports which adapters failed for transparency.
 *
 * Backend hooks needed (documented for Aaron to wire later):
 *   - Multi-Fleet daemon should expose `GET /api/v1/events?since=<ts>` returning
 *     a JSON list of events. Today we synthesize events from the `/health` and
 *     `/dashboard/data` snapshots. (5-product plan, Wire 4: "Add CORS-enabled
 *     JSON API + SSE endpoints to fleet daemon".)
 *   - 3-Surgeons agent_service should expose richer history at
 *     `/contextdna/surgeons/history?since=<ts>` including dissent records, not
 *     just titles + timestamps. We currently parse `recent_cross_exams`.
 */

import { NextRequest, NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';

const FLEET_HEALTH_URL = 'http://127.0.0.1:8855/health';
const FLEET_DASHBOARD_URL = 'http://127.0.0.1:8855/dashboard/data';
const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8080';
const ER_SIM_URL = process.env.ER_SIM_URL || 'http://localhost:8081';
const TIMEOUT_MS = 1500;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export type CrossProductSource = 'fleet' | 'surgeons' | 'er-sim';
export type CrossProductSeverity = 'info' | 'warn' | 'error' | 'success';

export interface CrossProductEvent {
  /** Unique-ish id derived from source + ts + index. Purely for React keys. */
  id: string;
  /** Source product. */
  source: CrossProductSource;
  /** Lowercase event kind (e.g. 'cross-exam', 'peer.online', 'launch'). */
  kind: string;
  /** Short human-readable headline. */
  title: string;
  /** Optional secondary description. */
  detail?: string;
  /** Severity for UI accent (default 'info'). */
  severity: CrossProductSeverity;
  /** Wall-clock timestamp (ms since epoch). */
  timestamp: number;
  /** True iff this is a real event. False = synthesized snapshot. */
  live: boolean;
}

export interface CrossProductActivityResponse {
  ok: boolean;
  events: CrossProductEvent[];
  errors: Array<{ source: CrossProductSource; error: string }>;
  fetched_at: number;
  /** Reachability flags so the UI can render per-source state. */
  reachable: Record<CrossProductSource, boolean>;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Adapter: Multi-Fleet daemon
// ---------------------------------------------------------------------------

interface FleetChannelHealthEntry {
  score?: string;
  broken?: string[];
}

async function fetchFleetEvents(): Promise<{
  events: CrossProductEvent[];
  reachable: boolean;
  error?: string;
}> {
  try {
    const res = await fetchWithTimeout(FLEET_HEALTH_URL);
    if (!res.ok) {
      return { events: [], reachable: false, error: `HTTP ${res.status}` };
    }
    const health = (await res.json()) as {
      nodeId?: string;
      activeSessions?: number;
      cascade?: { mode?: string };
      channel_health?: Record<string, FleetChannelHealthEntry>;
    };

    const now = Date.now();
    const events: CrossProductEvent[] = [];

    // Synthesize one event per node summarizing channel health. When the fleet
    // daemon eventually exposes `/api/v1/events`, swap this for live events.
    const channelHealth = health?.channel_health ?? {};
    let idx = 0;
    for (const [nodeId, entry] of Object.entries(channelHealth)) {
      const broken = Array.isArray(entry?.broken) ? entry.broken : [];
      const severity: CrossProductSeverity =
        broken.length === 0 ? 'success' : broken.length > 2 ? 'error' : 'warn';
      events.push({
        id: `fleet-${nodeId}-${now}-${idx++}`,
        source: 'fleet',
        kind: broken.length === 0 ? 'peer.online' : 'peer.degraded',
        title:
          broken.length === 0
            ? `${nodeId} healthy`
            : `${nodeId} degraded (${broken.length} channel${broken.length === 1 ? '' : 's'} broken)`,
        detail: broken.length > 0 ? `Broken: ${broken.join(', ')}` : undefined,
        severity,
        timestamp: now,
        live: false,
      });
    }

    if (typeof health?.activeSessions === 'number' && health.activeSessions > 0) {
      events.push({
        id: `fleet-sessions-${now}`,
        source: 'fleet',
        kind: 'fleet.sessions',
        title: `${health.activeSessions} active session${health.activeSessions === 1 ? '' : 's'}`,
        detail: `Cascade mode: ${health.cascade?.mode ?? 'unknown'}`,
        severity: 'info',
        timestamp: now,
        live: false,
      });
    }

    // Best-effort: try the dashboard data endpoint for richer event hints.
    try {
      const dashRes = await fetchWithTimeout(FLEET_DASHBOARD_URL);
      if (dashRes.ok) {
        const dash = (await dashRes.json()) as {
          recent_messages?: Array<{
            ts?: string | number;
            from?: string;
            to?: string;
            type?: string;
            subject?: string;
          }>;
        };
        const recent = Array.isArray(dash?.recent_messages)
          ? dash.recent_messages
          : [];
        let mIdx = 0;
        for (const m of recent.slice(0, 10)) {
          const ts =
            typeof m.ts === 'number'
              ? m.ts
              : typeof m.ts === 'string'
                ? Date.parse(m.ts) || now
                : now;
          events.push({
            id: `fleet-msg-${ts}-${mIdx++}`,
            source: 'fleet',
            kind: `fleet.message.${m.type ?? 'unknown'}`,
            title: `${m.from ?? '?'} → ${m.to ?? '?'}: ${m.subject ?? m.type ?? 'message'}`,
            severity: 'info',
            timestamp: ts,
            live: true,
          });
        }
      }
    } catch {
      // Dashboard data is optional — don't fail the whole fetch on its absence.
    }

    return { events, reachable: true };
  } catch (e) {
    return {
      events: [],
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Adapter: 3-Surgeons agent_service
// ---------------------------------------------------------------------------

async function fetchSurgeonEvents(): Promise<{
  events: CrossProductEvent[];
  reachable: boolean;
  error?: string;
}> {
  try {
    const res = await fetchWithTimeout(
      `${AGENT_SERVICE_URL}/contextdna/surgeons/status`,
    );
    if (!res.ok) {
      return { events: [], reachable: false, error: `HTTP ${res.status}` };
    }
    const status = (await res.json()) as {
      recent_cross_exams?: Array<{
        topic?: string;
        timestamp?: string | number;
        ok?: boolean;
        cost_usd?: number;
        dissent?: boolean;
      }>;
    };

    const recent = Array.isArray(status?.recent_cross_exams)
      ? status.recent_cross_exams
      : [];

    const events: CrossProductEvent[] = recent.map((exam, i) => {
      const ts =
        typeof exam.timestamp === 'number'
          ? exam.timestamp
          : typeof exam.timestamp === 'string'
            ? Date.parse(exam.timestamp) || Date.now()
            : Date.now();
      const severity: CrossProductSeverity = exam.ok
        ? exam.dissent
          ? 'warn'
          : 'success'
        : 'error';
      const dissentNote = exam.dissent ? ' (dissent recorded)' : '';
      return {
        id: `surgeons-${ts}-${i}`,
        source: 'surgeons',
        kind: exam.dissent ? 'surgeon.dissent' : 'surgeon.cross-exam',
        title: `Cross-exam: ${exam.topic ?? '(untitled)'}${dissentNote}`,
        detail:
          typeof exam.cost_usd === 'number'
            ? `cost $${exam.cost_usd.toFixed(4)} · ${exam.ok ? 'ok' : 'failed'}`
            : exam.ok
              ? 'completed'
              : 'failed',
        severity,
        timestamp: ts,
        live: true,
      };
    });

    return { events, reachable: true };
  } catch (e) {
    return {
      events: [],
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Adapter: ER Simulator (lightweight ping)
// ---------------------------------------------------------------------------

async function fetchErSimEvents(): Promise<{
  events: CrossProductEvent[];
  reachable: boolean;
  error?: string;
}> {
  try {
    const start = Date.now();
    const res = await fetchWithTimeout(ER_SIM_URL, { redirect: 'manual' });
    const latency = Date.now() - start;
    const reachable = res.ok || (res.status >= 300 && res.status < 400);
    const events: CrossProductEvent[] = [
      {
        id: `er-sim-ping-${start}`,
        source: 'er-sim',
        kind: reachable ? 'er-sim.up' : 'er-sim.down',
        title: reachable
          ? `ER Sim reachable (${latency}ms)`
          : `ER Sim returned ${res.status}`,
        detail: ER_SIM_URL,
        severity: reachable ? 'success' : 'warn',
        timestamp: start,
        live: false,
      },
    ];
    return { events, reachable };
  } catch (e) {
    return {
      events: [
        {
          id: `er-sim-down-${Date.now()}`,
          source: 'er-sim',
          kind: 'er-sim.down',
          title: 'ER Sim stopped',
          detail: ER_SIM_URL,
          severity: 'info',
          timestamp: Date.now(),
          live: false,
        },
      ],
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const [fleet, surgeons, erSim] = await Promise.all([
    fetchFleetEvents(),
    fetchSurgeonEvents(),
    fetchErSimEvents(),
  ]);

  const errors: CrossProductActivityResponse['errors'] = [];
  if (fleet.error) errors.push({ source: 'fleet', error: fleet.error });
  if (surgeons.error) errors.push({ source: 'surgeons', error: surgeons.error });
  if (erSim.error) errors.push({ source: 'er-sim', error: erSim.error });

  if (errors.length > 0) {
    try {
      logAppend({
        ts: Date.now(),
        level: 'info',
        source: 'cross-product/activity',
        msg: `Activity feed: ${errors.length} source${errors.length === 1 ? '' : 's'} unreachable`,
        detail: errors.map((e) => `${e.source}: ${e.error}`).join('; ').slice(0, 300),
      });
    } catch {
      /* noop */
    }
  }

  const merged = [...fleet.events, ...surgeons.events, ...erSim.events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  const body: CrossProductActivityResponse = {
    ok: true,
    events: merged,
    errors,
    fetched_at: Date.now(),
    reachable: {
      fleet: fleet.reachable,
      surgeons: surgeons.reachable,
      'er-sim': erSim.reachable,
    },
  };

  return NextResponse.json(body);
}
