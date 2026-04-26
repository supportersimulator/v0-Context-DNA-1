'use client';

// =============================================================================
// useTheatricalData — live snapshot of the 9 multifleet theatrical components.
//
// Strategy (most-fresh first; transparent fallback):
//   1) SSE  → /api/fleet/events   (when emitted-frame includes a snapshot)
//   2) POLL → /api/fleet/dashboard (proxies daemon /dashboard/data, 2s cadence)
//
// The fleet daemon's /dashboard/data already exposes all 9 theatrical
// components as JSON. The parallel SSE multiplex (sse_multiplex.py) emits
// discrete events; for full snapshots we still poll. When a snapshot frame
// arrives via SSE we use it instead of waiting for the next poll cycle.
//
// Why two hooks: `useFleetEvents` (parallel agent) is event-bus oriented —
// surgeon.dissent, fleet.peer.online, etc. `useTheatricalData` is the
// component-shaped envelope the Surgeon Theater + Corrigibility Gauge
// panels render. Same data ultimately, different abstractions.
//
// Vision context: docs/vision-alignment-2026-04-26.md flagged that 9
// theatrical Python components exist but are unserved. This hook bridges
// them into the IDE without re-implementing the Python.
// =============================================================================

import { useEffect, useRef, useState } from 'react';

// ─── Component shapes (mirror multifleet/theatrical/data_source.py) ─────────

export interface SurgeonStatusMap {
  atlas?: string;
  cardiologist?: string;
  neurologist?: string;
}

export interface SurgeonCrossExam {
  topic?: string;
  ts?: number;
  ok?: boolean;
  surgeon?: string;
  position?: string;
}

export interface SurgeonRebuttal {
  topic?: string;
  ts?: number;
  proposer?: string;
  rebutter?: string;
  resolution?: string;
}

export interface SurgeonDisagreement {
  id?: number;
  ts?: number;
  topic?: string;
  surgeon_a_position?: string;
  surgeon_b_position?: string;
  resolution?: string;
  evidence?: Record<string, unknown>;
}

export interface SurgeonDecisionPoint {
  ts?: number;
  context?: string;
  proposed_action?: string;
  final_action?: string;
  changed?: boolean;
}

export interface SurgeonFeedSnapshot {
  surgeons?: SurgeonStatusMap;
  cross_exams?: SurgeonCrossExam[];
  rebuttals?: SurgeonRebuttal[];
  disagreements?: SurgeonDisagreement[];
  decision_points?: SurgeonDecisionPoint[];
}

export interface CorrigibilityFactors {
  gate_pass_rate?: number;
  surgeon_influence?: number;
  disagreement_resolution?: number;
}

export interface CorrigibilityStats {
  total_decisions?: number;
  changed_by_surgeon?: number;
  unchanged?: number;
  change_rate?: number;
  total_disagreements?: number;
}

export interface CorrigibilityTrendPoint {
  timestamp?: number;
  score?: number;
}

export interface CorrigibilityGateEntry {
  timestamp?: number;
  gate?: string;
  passed?: boolean;
  duration_ms?: number;
  summary?: string;
  failures?: unknown[];
}

export interface CorrigibilityGaugeSnapshot {
  score?: number;
  trend?: CorrigibilityTrendPoint[];
  factors?: CorrigibilityFactors;
  last_check?: number;
  stats?: CorrigibilityStats;
  recent_disagreements?: SurgeonDisagreement[];
  gate_history?: CorrigibilityGateEntry[];
}

export interface FleetDashboardComponents {
  vital_signs?: Record<string, unknown>;
  surgeon_feed?: SurgeonFeedSnapshot;
  fleet_constellation?: Record<string, unknown>;
  evidence_timeline?: Record<string, unknown>;
  quorum_pulse?: Record<string, unknown>;
  memory_heat_map?: Record<string, unknown>;
  probe_grid?: Record<string, unknown>;
  corrigibility_gauge?: CorrigibilityGaugeSnapshot;
  gold_stream?: Record<string, unknown>;
}

export interface FleetDashboardEnvelope {
  ok?: boolean;
  timestamp?: number;
  components?: FleetDashboardComponents;
  synaptic?: Record<string, unknown>;
  error?: string;
  details?: string;
}

export type TheatricalTransport = 'sse' | 'poll' | 'idle';

export interface UseTheatricalDataResult {
  data: FleetDashboardEnvelope | null;
  transport: TheatricalTransport;
  /** Monotonic counter — increments on every fresh frame; drives ticker UI. */
  tick: number;
  /** ms since last fresh frame; null until first frame arrives. */
  ageMs: number | null;
  error: string | null;
  isLoading: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const POLL_URL = '/api/fleet/dashboard';
const SSE_URL = '/api/fleet/events';
const POLL_INTERVAL_MS = 2_000;
const AGE_TICK_MS = 1_000;
const SSE_PROBE_TIMEOUT_MS = 1_500;

interface SnapshotEnvelopePayload {
  components?: FleetDashboardComponents;
  synaptic?: Record<string, unknown>;
  timestamp?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to live theatrical-component snapshots from the fleet daemon.
 *
 * @param opts.pollMs poll cadence when SSE is unavailable (default 2000)
 * @param opts.preferSse try SSE first, then fall back (default true)
 */
export function useTheatricalData(opts?: {
  pollMs?: number;
  preferSse?: boolean;
}): UseTheatricalDataResult {
  const pollMs = opts?.pollMs ?? POLL_INTERVAL_MS;
  const preferSse = opts?.preferSse ?? true;

  const [data, setData] = useState<FleetDashboardEnvelope | null>(null);
  const [transport, setTransport] = useState<TheatricalTransport>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const cancelledRef = useRef<boolean>(false);

  useEffect(() => {
    cancelledRef.current = false;

    const recordFrame = (envelope: FleetDashboardEnvelope, source: TheatricalTransport) => {
      if (cancelledRef.current) return;
      setData(envelope);
      setTransport(source);
      setError(envelope?.ok === false ? envelope.error ?? 'daemon error' : null);
      setLastFrameAt(Date.now());
      setTick((t) => t + 1);
    };

    const startPolling = () => {
      const tickPoll = async () => {
        if (cancelledRef.current) return;
        try {
          const res = await fetch(POLL_URL, { cache: 'no-store' });
          const body = (await res.json()) as FleetDashboardEnvelope;
          recordFrame(body, 'poll');
        } catch (err) {
          if (!cancelledRef.current) {
            setError(String(err));
            setTransport('idle');
          }
        } finally {
          if (!cancelledRef.current) {
            pollTimerRef.current = setTimeout(tickPoll, pollMs);
          }
        }
      };
      void tickPoll();
    };

    const isSnapshotFrame = (raw: unknown): raw is SnapshotEnvelopePayload => {
      if (typeof raw !== 'object' || raw === null) return false;
      const obj = raw as Record<string, unknown>;
      return typeof obj.components === 'object' && obj.components !== null;
    };

    const tryAttachSse = () => {
      if (typeof window === 'undefined' || !('EventSource' in window)) {
        startPolling();
        return;
      }

      let resolved = false;
      let probeTimer: ReturnType<typeof setTimeout> | null = null;
      const es = new EventSource(SSE_URL);
      sseRef.current = es;

      const fallback = (reason: string) => {
        if (resolved) return;
        resolved = true;
        try { es.close(); } catch { /* noop */ }
        sseRef.current = null;
        if (probeTimer) clearTimeout(probeTimer);
        setError(reason);
        startPolling();
      };

      probeTimer = setTimeout(() => fallback('sse probe timeout'), SSE_PROBE_TIMEOUT_MS);

      // Always also poll while SSE is up: the multiplex emits discrete events
      // (surgeon.dissent, fleet.peer.online, …), but full theatrical snapshots
      // still come from /dashboard/data. SSE primarily reduces staleness; the
      // poll guarantees a complete envelope.
      const ensurePollFallback = () => {
        if (!pollTimerRef.current) {
          startPolling();
        }
      };

      const handleFrame = (raw: string) => {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (isSnapshotFrame(parsed)) {
            recordFrame(
              {
                ok: true,
                components: parsed.components as FleetDashboardComponents,
                synaptic: parsed.synaptic as Record<string, unknown> | undefined,
                timestamp: parsed.timestamp as number | undefined,
              },
              'sse',
            );
          }
          // Discrete events: do not replace snapshot, but bump the tick so
          // dependent UI knows something changed.
          if (resolved) setTick((t) => t + 1);
        } catch {
          /* ignore malformed frame */
        }
      };

      es.onmessage = (event) => {
        resolved = true;
        if (probeTimer) {
          clearTimeout(probeTimer);
          probeTimer = null;
        }
        ensurePollFallback();
        handleFrame(event.data);
      };

      // Subscribe to all known namespaces in case the multiplex uses
      // `event: <ns>.*` lines instead of generic `message`.
      const NAMESPACES = ['surgeon', 'fleet', 'evidence', 'quorum', 'panel', 'gold', 'sse'];
      for (const ns of NAMESPACES) {
        es.addEventListener(`${ns}.*`, (ev) => {
          resolved = true;
          if (probeTimer) {
            clearTimeout(probeTimer);
            probeTimer = null;
          }
          ensurePollFallback();
          handleFrame((ev as MessageEvent).data);
        });
      }

      es.onerror = () => {
        if (!resolved) fallback('sse connect failed');
        // Once resolved, native EventSource auto-retries; do not destroy state.
      };
    };

    if (preferSse) {
      tryAttachSse();
    } else {
      startPolling();
    }

    ageTimerRef.current = setInterval(() => setNow(Date.now()), AGE_TICK_MS);

    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (ageTimerRef.current) clearInterval(ageTimerRef.current);
      if (sseRef.current) {
        try { sseRef.current.close(); } catch { /* noop */ }
        sseRef.current = null;
      }
    };
  }, [pollMs, preferSse]);

  const ageMs = lastFrameAt == null ? null : Math.max(0, now - lastFrameAt);
  const isLoading = data === null && error === null;

  return { data, transport, tick, ageMs, error, isLoading };
}
