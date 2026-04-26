'use client';

// =============================================================================
// capability-registry.ts — Per-Capability L1/L2/L3 Posture Tracking
//
// Implements the Capability Registry described in
// docs/plans/2026-03-13-capability-registry-design.md (IDE-side, lightweight).
//
// Each capability is probed independently — losing Redis drops "State Backend"
// to L1 but doesn't affect "Evidence Store" if SQLite-backed Memory API is up.
// Probes call /api/capability/status which aggregates remote service health
// (memory_api, fleet daemon, 3-surgeons CLI, local LLM) into per-capability
// levels with reasons + recovery hints.
//
// React layer is a thin useSyncExternalStore wrapper. The store itself is
// framework-agnostic so non-React code (hooks, log buffer) can read posture
// without crossing the Suspense boundary.
//
// Convention: 'capability:level-changed' on the IDE EventBus when a level
// transitions, so panels can react (e.g., surface a toast, dim a feature).
// =============================================================================

import { useCallback, useSyncExternalStore } from 'react';
import { getEventBus } from './event-bus';

// ---------------------------------------------------------------------------
// Capability identifiers — keep in sync with the Python capability_registry.
// Every capability has L1 (always available, in-process / local-file fallback),
// L2 (shared-state enhancement, e.g. Redis / WebSocket), L3 (full Docker stack).
// ---------------------------------------------------------------------------

export type CapabilityId =
  | 'evidence_store'
  | 'cross_examination'
  | 'state_backend'
  | 'project_memory'
  | 'health_monitoring'
  | 'llm_backend'
  | 'event_bus'
  | 'fleet_transport';

export type CapabilityLevel = 1 | 2 | 3;

export interface CapabilityState {
  id: CapabilityId;
  label: string;
  level: CapabilityLevel;
  reason: string;
  /** Plain-language summary of what works at this level (no jargon). */
  user_summary: string;
  /** Action user can take to upgrade (or empty when at L3). */
  recovery_hint: string;
  /** ISO timestamp of the probe that produced this snapshot. */
  probed_at: string;
}

export interface CapabilitySnapshot {
  /** Server-controlled clock — used as the snapshot identity. */
  ts: number;
  /** Whether the API responded (false = stale/cached snapshot). */
  online: boolean;
  /** Per-capability state. Always populated for every CapabilityId. */
  states: Record<CapabilityId, CapabilityState>;
  /** Overall posture aggregated from levels. */
  posture: 'NOMINAL' | 'DEGRADED' | 'SAFE_MODE';
}

export const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  evidence_store: 'Evidence Store',
  cross_examination: 'Cross-Examination',
  state_backend: 'State Backend',
  project_memory: 'Project Memory',
  health_monitoring: 'Health Monitoring',
  llm_backend: 'LLM Backend',
  event_bus: 'Event Bus',
  fleet_transport: 'Fleet Transport',
};

// ---------------------------------------------------------------------------
// Defaults — what we report before the first probe completes (or while the
// API is unreachable). Always-available L1 baseline so the UI never lies.
// ---------------------------------------------------------------------------

const NOW_ISO = (): string => new Date().toISOString();

function defaultStateFor(id: CapabilityId): CapabilityState {
  return {
    id,
    label: CAPABILITY_LABELS[id],
    level: 1,
    reason: 'awaiting first probe',
    user_summary: 'Local-only mode — feature works without optional infrastructure.',
    recovery_hint: 'Run a probe to detect available services.',
    probed_at: NOW_ISO(),
  };
}

function defaultSnapshot(): CapabilitySnapshot {
  const states = {} as Record<CapabilityId, CapabilityState>;
  (Object.keys(CAPABILITY_LABELS) as CapabilityId[]).forEach((id) => {
    states[id] = defaultStateFor(id);
  });
  return {
    ts: Date.now(),
    online: false,
    states,
    posture: 'NOMINAL',
  };
}

// ---------------------------------------------------------------------------
// Posture aggregation — match the state machine in the design doc.
// NOMINAL    = every cap at L2+ OR every cap with no failure reason
// DEGRADED   = at least one cap dropped from previous level
// SAFE_MODE  = critical caps (evidence_store OR cross_examination) at L1 with
//              an unrecovered failure
// ---------------------------------------------------------------------------

const CRITICAL_CAPS: CapabilityId[] = ['evidence_store', 'cross_examination'];

function deriveOverallPosture(states: Record<CapabilityId, CapabilityState>): CapabilitySnapshot['posture'] {
  // SAFE_MODE if any critical cap is at L1 with a non-default failure reason
  for (const cap of CRITICAL_CAPS) {
    const s = states[cap];
    if (s.level === 1 && s.reason && s.reason !== 'awaiting first probe' && !s.reason.includes('available')) {
      return 'SAFE_MODE';
    }
  }
  // DEGRADED if any cap below L2
  for (const id of Object.keys(states) as CapabilityId[]) {
    if (states[id].level < 2) return 'DEGRADED';
  }
  return 'NOMINAL';
}

// ---------------------------------------------------------------------------
// Store — vanilla pub/sub backed by useSyncExternalStore for React tear-free
// reads. Mirrors the SettingsStore pattern in this codebase.
// ---------------------------------------------------------------------------

type Listener = (snapshot: CapabilitySnapshot) => void;

class CapabilityRegistry {
  private snapshot: CapabilitySnapshot = defaultSnapshot();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<CapabilitySnapshot> | null = null;

  getSnapshot(): CapabilitySnapshot {
    return this.snapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Run a single probe against /api/capability/status. Idempotent — if
   * a probe is already in flight, returns the existing promise.
   */
  async probe(): Promise<CapabilitySnapshot> {
    if (this.inflight) return this.inflight;

    const previous = this.snapshot;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    this.inflight = (async () => {
      try {
        const resp = await fetch('/api/capability/status', {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!resp.ok) {
          return this.applyOffline(previous, `HTTP ${resp.status}`);
        }
        const json = (await resp.json()) as Partial<CapabilitySnapshot>;
        if (!json || typeof json !== 'object' || !json.states) {
          return this.applyOffline(previous, 'malformed response');
        }
        const next: CapabilitySnapshot = {
          ts: Date.now(),
          online: true,
          states: this.normaliseStates(json.states),
          posture: 'NOMINAL',
        };
        next.posture = deriveOverallPosture(next.states);
        this.applySnapshot(next, previous);
        return next;
      } catch (err) {
        return this.applyOffline(previous, (err as Error)?.message ?? 'probe failed');
      } finally {
        clearTimeout(timer);
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  /** Start auto-probing every `intervalMs` ms. Safe to call multiple times. */
  startAutoProbe(intervalMs = 10_000): void {
    if (this.timer) return;
    // Fire immediately, then on interval.
    void this.probe();
    this.timer = setInterval(() => {
      void this.probe();
    }, intervalMs);
  }

  stopAutoProbe(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private normaliseStates(
    raw: Partial<Record<CapabilityId, Partial<CapabilityState>>>,
  ): Record<CapabilityId, CapabilityState> {
    const out = {} as Record<CapabilityId, CapabilityState>;
    (Object.keys(CAPABILITY_LABELS) as CapabilityId[]).forEach((id) => {
      const incoming = raw[id];
      if (incoming && typeof incoming === 'object') {
        const lvl = incoming.level;
        const level: CapabilityLevel = lvl === 2 || lvl === 3 ? lvl : 1;
        out[id] = {
          id,
          label: CAPABILITY_LABELS[id],
          level,
          reason: typeof incoming.reason === 'string' ? incoming.reason : '',
          user_summary:
            typeof incoming.user_summary === 'string'
              ? incoming.user_summary
              : defaultStateFor(id).user_summary,
          recovery_hint:
            typeof incoming.recovery_hint === 'string' ? incoming.recovery_hint : '',
          probed_at: typeof incoming.probed_at === 'string' ? incoming.probed_at : NOW_ISO(),
        };
      } else {
        out[id] = defaultStateFor(id);
      }
    });
    return out;
  }

  private applyOffline(previous: CapabilitySnapshot, reason: string): CapabilitySnapshot {
    const next: CapabilitySnapshot = {
      ts: Date.now(),
      online: false,
      states: previous.states,
      posture: previous.posture,
    };
    // Don't overwrite per-capability state when the API is briefly down — that
    // would cause flapping. We just mark the snapshot as offline and let the
    // panel render a "stale" badge. But we DO update probed_at on each cap so
    // the user can see the snapshot is aging.
    const probed = NOW_ISO();
    (Object.keys(next.states) as CapabilityId[]).forEach((id) => {
      next.states[id] = { ...next.states[id], probed_at: probed };
    });
    this.applySnapshot(next, previous);
    // Surface why we went offline in the log buffer, callers can ignore.
    if (typeof console !== 'undefined') {
      console.debug('[CapabilityRegistry] offline:', reason);
    }
    return next;
  }

  private applySnapshot(next: CapabilitySnapshot, previous: CapabilitySnapshot): void {
    this.snapshot = next;

    // Emit level-changed events on the IDE bus for any cap whose level shifted.
    try {
      const bus = getEventBus();
      (Object.keys(next.states) as CapabilityId[]).forEach((id) => {
        const before = previous.states[id]?.level;
        const after = next.states[id]?.level;
        if (before !== undefined && after !== undefined && before !== after) {
          // Cast through unknown — capability events are not in the static
          // IDEEvents map yet (would couple this module to the bus type).
          // The listener side uses onPrefix('capability:') for safety.
          (bus as unknown as { emit: (e: string, d: unknown) => void }).emit(
            'capability:level-changed',
            {
              capability: id,
              previous: before,
              level: after,
              reason: next.states[id].reason,
            },
          );
        }
      });
    } catch {
      // EventBus emit failures must never break probing.
    }

    // Notify direct subscribers.
    for (const fn of Array.from(this.listeners)) {
      try {
        fn(next);
      } catch {
        // Subscriber errors must never break the registry.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _registry: CapabilityRegistry | null = null;

export function getCapabilityRegistry(): CapabilityRegistry {
  if (!_registry) {
    _registry = new CapabilityRegistry();
  }
  return _registry;
}

/** Test-only: reset the singleton between tests. */
export function _resetCapabilityRegistry(): void {
  if (_registry) {
    _registry.stopAutoProbe();
  }
  _registry = null;
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

export function useCapabilitySnapshot(): CapabilitySnapshot {
  const registry = getCapabilityRegistry();
  const subscribe = useCallback((cb: () => void) => registry.subscribe(() => cb()), [registry]);
  const getSnap = useCallback(() => registry.getSnapshot(), [registry]);
  const getServerSnap = useCallback(() => defaultSnapshot(), []);
  return useSyncExternalStore(subscribe, getSnap, getServerSnap);
}

export function useCapability(id: CapabilityId): CapabilityState {
  const snap = useCapabilitySnapshot();
  return snap.states[id];
}
