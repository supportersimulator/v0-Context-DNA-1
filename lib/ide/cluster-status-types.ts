// =============================================================================
// Cluster Status — TypeScript types (CC4 Phase-10 Status Overview, 2026-05-07).
//
// Wire shape for the IDE Status Overview pill bar — the small horizontal strip
// that sits at the TOP of `DashboardShell`, above the existing 3-panel grid
// (SurgeonTheater | CampaignTheater | RaceTheater) and the second-row grid
// (TruthLadder | HumanArbiter).
//
// Six pills:
//   1. Active phase       — text, no health colour
//   2. Cluster health     — emerald | amber | rose | slate (unknown)
//   3. Push-freeze        — amber when frozen, emerald when thawed
//   4. Commits ahead      — amber when total > 0, emerald at 0
//   5. Invariants         — emerald N/M PASS (N==M), amber on partial, slate ?/M
//   6. Panels live        — text, count from snapshot
//
// Read-only consumer. The route at `/api/cluster/status` reads
// `dashboard_exports/cluster_status_snapshot.json` (written by
// `scripts/dump-cluster-status-snapshot.py`). When the snapshot is missing
// or unreadable, the route returns `EMPTY_CLUSTER_STATUS` so the pill bar
// always renders gracefully.
//
// Disjoint event namespace: `cluster:*` — does NOT collide with `truth:*`,
// `arbiter:*`, `tribunal:*`, `permission:*`, `race:*`, `surgeon:*`,
// `evidence:*`, `fleet:*`. The Status Overview is a sibling, not a
// subordinate, of every existing panel — so the namespace stays disjoint
// for forward-compat with EventBridge fan-out.
// =============================================================================

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

/** Roll-up health label for the cluster. */
export type ClusterHealthState = 'ok' | 'degraded' | 'down' | 'unknown';

/** Per-surgeon backend status — string vocabulary mirrors /health surgeons.* */
export type SurgeonBackendStatus = string;

/** Sub-shape: cluster health summary. */
export type ClusterHealth = {
  state: ClusterHealthState;
  /** NATS subscription count, null when daemon unreachable. */
  nats_subs: number | null;
  /** JetStream "all streams ok" boolean, null when unknown. */
  js_streams_ok: boolean | null;
  /** Seconds since last webhook event was recorded, null when unknown. */
  webhook_last_age_s: number | null;
  /** Per-surgeon backend status — keys cardio + neuro at minimum. */
  surgeons: {
    cardio: SurgeonBackendStatus;
    neuro: SurgeonBackendStatus;
    [k: string]: SurgeonBackendStatus;
  };
};

/** Sub-shape: push-freeze state. */
export type PushFreezeState = {
  /** True when commits-ahead must NOT be pushed. */
  active: boolean;
  /** Where this came from — env, file, or daemon. */
  source: 'env' | 'file' | 'daemon' | 'unknown';
};

/** Sub-shape: commits ahead per repo. */
export type CommitsAhead = {
  /** Superrepo (er-simulator-superrepo). null when git probe failed. */
  super: number | null;
  /** multi-fleet submodule. */
  mf: number | null;
  /** admin.contextdna.io submodule. */
  admin: number | null;
  /** Sum of the three above (skipping nulls). */
  total: number;
};

/** Sub-shape: constitutional-invariants run summary. */
export type InvariantsState = {
  /** Number of invariants that PASSed. null when no log was found. */
  passed: number | null;
  /** Total number of invariants in the suite (12 today). */
  total: number;
  /** ISO-8601 timestamp of the last invariants run, null when unknown. */
  last_run: string | null;
};

// ---------------------------------------------------------------------------
// Top-level snapshot
// ---------------------------------------------------------------------------

/** Producer-side hint — same vocabulary as race/competition routes. */
export type ClusterStatusSource =
  | 'snapshot'
  | 'snapshot-degraded'
  | 'no-snapshot'
  | 'error';

/** Top-level wire payload returned by `/api/cluster/status`. */
export type ClusterStatus = {
  schema_version: 'cluster_status/v1';
  /** ISO-8601 timestamp the snapshot was generated; null when no snapshot. */
  generated_at: string | null;
  /** Human-readable active sprint phase, e.g. "Phase-10 closeout". */
  active_phase: string | null;
  cluster_health: ClusterHealth;
  push_freeze: PushFreezeState;
  commits_ahead: CommitsAhead;
  invariants: InvariantsState;
  /** Total IDE panels currently live (8 today: 3 top + 2 bottom + 3 strips). */
  panels_live: number;
  source: ClusterStatusSource;
  /** Optional error message when `source === 'error'`. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Display helper for `StatusOverview.tsx`
// ---------------------------------------------------------------------------

/**
 * Per-pill display info — `StatusOverview.tsx` derives one of these for each
 * pill so the JSX stays declarative and the colour vocabulary lives next to
 * the wire types (single source of truth).
 *
 * `tone` maps to a fixed Tailwind palette:
 *   emerald — healthy
 *   amber   — degraded / attention
 *   rose    — down / failure
 *   slate   — unknown / muted
 *   violet  — phase / informational
 */
export type ClusterPillTone = 'emerald' | 'amber' | 'rose' | 'slate' | 'violet';

export type ClusterPanelInfo = {
  /** Stable id — also doubles as a `data-testid` value. */
  id:
    | 'phase'
    | 'cluster-health'
    | 'push-freeze'
    | 'commits-ahead'
    | 'invariants'
    | 'panels-live';
  /** Short label rendered inside the pill. */
  label: string;
  /** Larger value text rendered after the label. */
  value: string;
  /** Tooltip / `title` text shown on hover. */
  tooltip: string;
  tone: ClusterPillTone;
};

// ---------------------------------------------------------------------------
// Defaults — safe-render seed used when the snapshot is missing.
// ---------------------------------------------------------------------------

/**
 * Empty seed — the route returns this when the snapshot file is missing or
 * unreadable. The pill bar still renders all six pills (with slate tone +
 * "?" values) so the IDE never shows a blank header strip.
 */
export const EMPTY_CLUSTER_STATUS: ClusterStatus = {
  schema_version: 'cluster_status/v1',
  generated_at: null,
  active_phase: null,
  cluster_health: {
    state: 'unknown',
    nats_subs: null,
    js_streams_ok: null,
    webhook_last_age_s: null,
    surgeons: { cardio: 'unknown', neuro: 'unknown' },
  },
  push_freeze: { active: true, source: 'unknown' },
  commits_ahead: { super: null, mf: null, admin: null, total: 0 },
  invariants: { passed: null, total: 12, last_run: null },
  panels_live: 8,
  source: 'no-snapshot',
};

// ---------------------------------------------------------------------------
// Event-bus payloads (cluster:* namespace — disjoint from every other panel).
// Wired in next wave (the StatusOverview today is purely poll-driven).
// ---------------------------------------------------------------------------

/** Fired when a fresh full cluster-status snapshot is published. */
export type ClusterStatusSnapshotEvent = {
  generated_at: string;
  health_state: ClusterHealthState;
  total_commits_ahead: number;
};

/** Fired when push-freeze toggles. */
export type ClusterPushFreezeToggleEvent = {
  active: boolean;
  source: PushFreezeState['source'];
  timestamp?: string;
};

/**
 * Disjoint registry of all `cluster:*` events. Future wiring folds these
 * into IDEEvents in `lib/ide/event-bus.ts`.
 */
export interface ClusterStatusEvent {
  'cluster:snapshot': ClusterStatusSnapshotEvent;
  'cluster:push-freeze-toggle': ClusterPushFreezeToggleEvent;
}
