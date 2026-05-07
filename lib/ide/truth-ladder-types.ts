// =============================================================================
// Truth Ladder — TypeScript types (AA3 scaffold, 2026-05-07).
//
// The Truth Ladder is a vertical timeline of evidence/decisions ranked by
// confidence + redundancy. It shows "ground truth" climbing rung by rung
// from raw speculation up to invariant — anchored, multi-source, replayable.
//
// Rung order (low → high):
//   speculation → hypothesis → consensus_lite →
//   consensus_3s → consensus_3s_tribunal → invariant
//
// Producers (next-wave write side, not in this scaffold):
//   - Atlas / 3-surgeons emit `truth:rung-promoted` when an evidence record
//     accumulates enough redundancy + cross-model agreement to climb a rung.
//   - The EvidenceLedger snapshots rung membership into
//     `dashboard_exports/truth_ladder_snapshot.json`.
//
// The IDE side (this file + `TruthLadder.tsx`) is a read-only consumer — it
// renders whatever the snapshot or push event carries; it never invents
// rungs or moves records on its own.
//
// Disjoint event namespace: `truth:*`. Disjoint from `race:*`, `evidence:*`,
// `permission:*`, `tribunal:*`, `surgeon:*`, `fleet:*`, `arbiter:*`.
// =============================================================================

// ---------------------------------------------------------------------------
// Rung kinds — must align with the Python TruthLadderRung enum (next wave).
// Ordered ascending: low confidence first, invariant last.
// ---------------------------------------------------------------------------

export type TruthRungLabel =
  | 'speculation'
  | 'hypothesis'
  | 'consensus_lite'
  | 'consensus_3s'
  | 'consensus_3s_tribunal'
  | 'invariant';

/** Canonical bottom→top order — single source of truth for renderers. */
export const TRUTH_RUNG_ORDER: readonly TruthRungLabel[] = [
  'speculation',
  'hypothesis',
  'consensus_lite',
  'consensus_3s',
  'consensus_3s_tribunal',
  'invariant',
] as const;

// ---------------------------------------------------------------------------
// Core entries
// ---------------------------------------------------------------------------

/**
 * A single rung on the Truth Ladder. `evidence_record_ids` are EvidenceLedger
 * record ids that currently sit on this rung; `confidence_floor` is the
 * minimum confidence score for inclusion (0.0–1.0). The IDE never recomputes
 * `item_count` — it trusts the producer to keep it consistent.
 */
export type TruthRung = {
  /** 0-based ascending index — 0 = speculation, 5 = invariant. */
  rung_index: number;
  /** Canonical rung label. */
  label: TruthRungLabel;
  /** EvidenceLedger record ids currently on this rung. */
  evidence_record_ids: string[];
  /** Minimum confidence score for inclusion on this rung (0.0–1.0). */
  confidence_floor: number;
  /** Convenience counter: `evidence_record_ids.length`. */
  item_count: number;
};

/** A point-in-time snapshot of all rungs. */
export type TruthLadderSnapshot = {
  /** Bottom→top in `TRUTH_RUNG_ORDER`. */
  rungs: TruthRung[];
  /** ISO-8601 timestamp the snapshot was generated; null when no snapshot. */
  generated_at: string | null;
  /** Producer hint — same vocabulary as race/competition routes. */
  source?: 'fleet' | 'demo' | 'empty' | 'no-snapshot' | 'error';
  /** Optional error message when `source === 'error'`. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Defaults — safe-render seed
// ---------------------------------------------------------------------------

/**
 * Seed snapshot used when no producer has written a snapshot yet. All rungs
 * present, all empty. The IDE renders this as a 6-rung skeleton with zero
 * counts so the panel never shows "loading…" in the steady state.
 */
export const EMPTY_TRUTH_LADDER_SNAPSHOT: TruthLadderSnapshot = {
  rungs: TRUTH_RUNG_ORDER.map((label, rung_index) => ({
    rung_index,
    label,
    evidence_record_ids: [],
    confidence_floor: defaultConfidenceFloorFor(label),
    item_count: 0,
  })),
  generated_at: null,
  source: 'no-snapshot',
};

/**
 * Default confidence floor per rung. Centralised so the empty-state and the
 * Python-side producer (next wave) agree on the schedule.
 */
function defaultConfidenceFloorFor(label: TruthRungLabel): number {
  switch (label) {
    case 'speculation':
      return 0.0;
    case 'hypothesis':
      return 0.3;
    case 'consensus_lite':
      return 0.5;
    case 'consensus_3s':
      return 0.7;
    case 'consensus_3s_tribunal':
      return 0.85;
    case 'invariant':
      return 0.95;
  }
}

// ---------------------------------------------------------------------------
// Display helpers — read-only consumers (TruthLadder.tsx) use these so colors
// and short labels stay consistent across the IDE.
// ---------------------------------------------------------------------------

/** Human-readable short label for a rung — single source of truth. */
export const TRUTH_RUNG_DISPLAY: Record<TruthRungLabel, string> = {
  speculation: 'Speculation',
  hypothesis: 'Hypothesis',
  consensus_lite: 'Consensus (lite)',
  consensus_3s: 'Consensus (3-surgeon)',
  consensus_3s_tribunal: 'Consensus (3s + tribunal)',
  invariant: 'Invariant',
};

/** Color hint per rung — climbing the ladder warms the palette. */
export const TRUTH_RUNG_COLOR: Record<TruthRungLabel, string> = {
  speculation: 'slate',
  hypothesis: 'sky',
  consensus_lite: 'cyan',
  consensus_3s: 'emerald',
  consensus_3s_tribunal: 'amber',
  invariant: 'violet',
};

// ---------------------------------------------------------------------------
// Event-bus payloads (truth:* namespace — disjoint from every other panel)
// ---------------------------------------------------------------------------

/** Fired when an evidence record is promoted to a higher rung. */
export type TruthRungPromotedEvent = {
  evidence_record_id: string;
  from_rung: TruthRungLabel | null;
  to_rung: TruthRungLabel;
  timestamp?: string;
};

/** Fired when an evidence record is demoted (rare — typically on revocation). */
export type TruthRungDemotedEvent = {
  evidence_record_id: string;
  from_rung: TruthRungLabel;
  to_rung: TruthRungLabel | null;
  reason: string;
  timestamp?: string;
};

/** Fired when a fresh full-ladder snapshot is published. */
export type TruthLadderSnapshotEvent = {
  generated_at: string;
  rung_counts: Record<TruthRungLabel, number>;
};

/**
 * Disjoint registry of all `truth:*` events. The next-wave wiring will fold
 * these into IDEEvents in `lib/ide/event-bus.ts`.
 */
export interface TruthLadderEvent {
  'truth:rung-promoted': TruthRungPromotedEvent;
  'truth:rung-demoted': TruthRungDemotedEvent;
  'truth:snapshot': TruthLadderSnapshotEvent;
}
