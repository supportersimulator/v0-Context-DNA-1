// =============================================================================
// RaceTheater — TypeScript types (X5 scaffold, 2026-05-07)
//
// Wire shape for the "Competitive Branch Racing" panel — the IDE-side render
// of the 10x feature where 3 machines race in isolated worktrees on the same
// problem with a formal propose/rebut/converge protocol (45min → 12min).
//
// SCAFFOLD ONLY: this file declares the public type surface so RaceTheater.tsx
// + /api/race/status can be authored in isolation. Real fleet wiring (NATS
// subscriptions, evidence-ledger correlations, cross-rebuttal payloads) lands
// in the next wave (Y-batch). Do NOT widen this surface speculatively — Y is
// the place to extend, not here.
//
// Disjoint event namespace: `race:*` — does NOT collide with `surgeon:*`,
// `evidence:*`, `fleet:*`, `quorum:*`, or `gold:*`. The Race Theater is a
// sibling, not a subordinate, of those streams. When Y-batch wires this in,
// the fleet→IDE bridge already routes by namespace prefix (see
// `lib/ide/event-bridge.ts`), so adding `race:*` requires only the type
// declarations below + a registry entry in IDEEvents.
// =============================================================================

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

/** Every node racing produces a participant entry. */
export type RaceParticipant = {
  /** Fleet node id, e.g. "mac1" / "mac2" / "mac3" / "cloud". */
  node_id: string;
  /** Branch / worktree label, e.g. "race/2026-05-07-bug-fix-A". */
  branch?: string;
  /** Phase the racer is currently in. */
  phase: RaceParticipantPhase;
  /** Score (0..1). Higher is better. Producer-defined. */
  score?: number;
  /** Last status line (one-liner — suitable for a row preview). */
  preview?: string;
  /** ISO-8601 timestamp of the last status update from this racer. */
  updated_at?: string;
  /**
   * Logical role within the race protocol. Y2 frontend renders a fixed
   * 3-card layout when participants carry roles {cardio, neuro, judge};
   * legacy node-only races render in the previous wrap layout.
   */
  role?: RaceParticipantRole;
  /**
   * Full propose/rebut/converge text from the racer. Shown on hover via the
   * tooltip; `preview` is the one-liner equivalent. Producer-supplied — the
   * panel never invents this field.
   */
  last_proposal?: string;
  /** Open keys for forward-compat — Y-batch adds richer fields. */
  [k: string]: unknown;
};

/**
 * Role within the 3-surgeon race protocol. `cardio` and `neuro` are the
 * adversarial racers; `judge` synthesises and produces the verdict. Optional
 * — backwards-compatible with X5 races that only set `node_id`.
 */
export type RaceParticipantRole = 'cardio' | 'neuro' | 'judge';

/**
 * Per-racer phase. Mirrors the `propose → rebut → converge` protocol from
 * `project_competitive_branch_racing.md`.
 *
 * - `proposing`  : drafting a candidate diff in its worktree
 * - `rebutting`  : challenging at least one peer's proposal
 * - `converging` : adapting to incorporate accepted rebuttals
 * - `done`       : final candidate submitted to chief synthesis
 * - `error`      : terminal failure (worktree corrupted, model down, etc.)
 * - `idle`       : seat reserved but the racer hasn't started
 */
export type RaceParticipantPhase =
  | 'idle'
  | 'proposing'
  | 'rebutting'
  | 'converging'
  | 'done'
  | 'error';

/**
 * Lifecycle of the entire race (the parent of all participants).
 *
 * - `pending`     : kicked off but participants haven't checked in
 * - `racing`      : at least one participant is in {proposing,rebutting,converging}
 * - `synthesizing`: all participants done; chief is merging candidates
 * - `complete`    : winning candidate selected; receipts written
 * - `aborted`     : human or auto-arbiter cancelled the race
 */
export type RaceStatus =
  | 'pending'
  | 'racing'
  | 'synthesizing'
  | 'complete'
  | 'aborted';

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

/** A single competitive branch race, surfaced to the IDE panel. */
export type RaceEntry = {
  /** Stable identifier — Y-batch will mirror the fleet's race UUID. */
  race_id: string;
  /** Human-facing one-liner: what the race is about. */
  topic: string;
  /** Lifecycle of the race itself. */
  status: RaceStatus;
  /** ISO-8601 timestamp the race was kicked off. */
  started_at?: string;
  /** ISO-8601 timestamp of the most recent participant event. */
  updated_at?: string;
  /** All racers (typically 3 — mac1/mac2/mac3 — but unbounded). */
  participants: RaceParticipant[];
  /**
   * Once the chief has picked a winner, this points at the participant.
   * `undefined` while the race is live.
   */
  winner_node_id?: string;
  /**
   * Free-form summary line shown when status === 'complete'. Producer chooses
   * the wording (e.g. "mac2 won — diff merged, evidence chain intact").
   */
  outcome_summary?: string;
  /** Current rebuttal round (1-indexed). Producer-supplied. */
  current_round?: number;
  /** Maximum rebuttal rounds before the judge is forced to call it. */
  max_rounds?: number;
  /**
   * Verdict from the judge once status === 'complete'. The five values mirror
   * the protocol from `project_competitive_branch_racing.md`:
   *   - PROCEED    : winning candidate accepted, merge greenlit
   *   - SPLIT      : tie / both candidates have merit, judge defers split
   *   - DEFER      : judge needs more rounds (race re-queued)
   *   - DROP       : both candidates rejected, no merge
   *   - UNRESOLVED : terminal failure, judge could not synthesise
   */
  verdict?: RaceVerdict;
};

/** Judge verdict — see `RaceEntry.verdict`. */
export type RaceVerdict =
  | 'PROCEED'
  | 'SPLIT'
  | 'DEFER'
  | 'DROP'
  | 'UNRESOLVED';

/** Wire shape returned by `GET /api/race/status`. */
export type RaceStatusResponse = {
  /** All races known to the IDE (live + recently completed). */
  races: RaceEntry[];
  /** Convenience counter: races where status ∈ {racing, synthesizing}. */
  active_count: number;
  /**
   * Producer hint so the panel knows whether to render an empty state vs an
   * "ask the daemon to populate state" CTA. Matches the pattern used by the
   * competition status route (`source: 'dashboard-export' | 'empty' | …`).
   */
  source?: 'fleet' | 'demo' | 'empty' | 'error';
  /** Optional error message when `source === 'error'`. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Defaults — used by both the route and the panel for safe rendering
// ---------------------------------------------------------------------------

/** Empty response — used by the route when no races exist + as a panel seed. */
export const EMPTY_RACE_STATUS: RaceStatusResponse = {
  races: [],
  active_count: 0,
  source: 'empty',
};

// ---------------------------------------------------------------------------
// Event-bus registry payloads (race:* namespace)
//
// These shapes are referenced by `IDEEvents` in `lib/ide/event-bus.ts` once
// Y-batch wires the bridge. Declaring them here keeps the namespace contract
// in one place so SurgeonTheater/CampaignTheater never accidentally collide.
// ---------------------------------------------------------------------------

/** Fired whenever any racer transitions phase or updates score/preview. */
export type RaceParticipantEvent = {
  race_id: string;
  node_id: string;
  phase: RaceParticipantPhase;
  score?: number;
  preview?: string;
  timestamp?: string;
};

/** Fired when the parent race transitions lifecycle status. */
export type RaceStatusEvent = {
  race_id: string;
  status: RaceStatus;
  timestamp?: string;
};

/** Fired when a racer rebuts a peer (propose/rebut/converge step). */
export type RaceRebuttalEvent = {
  race_id: string;
  /** Node issuing the rebuttal. */
  from_node_id: string;
  /** Peer being rebutted. */
  to_node_id: string;
  /** One-liner summary of the rebuttal. */
  preview?: string;
  /** Severity hint used by the panel for visual emphasis. */
  severity?: 'low' | 'medium' | 'high';
  timestamp?: string;
};

/** Fired when chief synthesis selects a winner. */
export type RaceWinnerEvent = {
  race_id: string;
  winner_node_id: string;
  outcome_summary?: string;
  timestamp?: string;
};

/**
 * Disjoint registry of all `race:*` events. Y-batch will fold these into
 * `IDEEvents` (lib/ide/event-bus.ts) by spreading this type into the map; we
 * declare them here so the contract review can happen against a single file.
 *
 * Use `keyof RaceEvent` in tests to assert no collisions with surgeon:* /
 * evidence:* / fleet:* namespaces.
 */
export interface RaceEvent {
  'race:participant': RaceParticipantEvent;
  'race:status': RaceStatusEvent;
  'race:rebuttal': RaceRebuttalEvent;
  'race:winner': RaceWinnerEvent;
}

/**
 * Generic envelope for any `race.*` event coming off the fleet bridge. Y2
 * subscribes to this shape and dispatches by the inner `type` discriminator.
 * Mirrors the `fleet:event` / `surgeon:event` pattern so the bridge needs no
 * special-case for the new namespace.
 */
export type RaceGenericEvent = {
  /** Original Python event type, e.g. "race.participant" / "race.snapshot". */
  type: string;
  payload: Record<string, unknown>;
  source?: string;
  timestamp?: string | number;
  correlation_id?: string;
  session_id?: string;
};

/**
 * Snapshot payload — the fleet bridge MAY emit a `race.snapshot` envelope so
 * late-joining IDE clients reconstruct full state without a separate fetch.
 * The X5 status route + Y1 stream both use this shape.
 */
export type RaceSnapshotEvent = {
  races: RaceEntry[];
  active_count?: number;
  timestamp?: string;
};
