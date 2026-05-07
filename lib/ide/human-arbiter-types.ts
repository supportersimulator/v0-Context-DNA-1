// =============================================================================
// Human Arbiter — TypeScript types (AA3 scaffold, 2026-05-07).
//
// The Human Arbiter panel surfaces unresolved disputes that have escalated
// past 3-surgeon consensus AND the Validation Tribunal. Aaron's verdict is
// the final tiebreak. Each verdict is recorded as its own EvidenceLedger
// record and signed off into the PermissionGovernor.
//
// Producers (next-wave write side, not in this scaffold):
//   - When a tribunal returns UNRESOLVED for a high-stakes dispute, the
//     escalator opens an arbiter case via `arbiter.open(...)`.
//   - When Aaron clicks a verdict button in `HumanArbiter.tsx`, the IDE
//     POSTs to `/api/arbiter/verdict`. The server-side wiring (next wave)
//     records the verdict, mints an evidence record, and notifies the
//     PermissionGovernor.
//
// Disjoint event namespace: `arbiter:*`. Disjoint from `race:*`,
// `evidence:*`, `permission:*`, `tribunal:*`, `surgeon:*`, `fleet:*`,
// `truth:*`.
// =============================================================================

// ---------------------------------------------------------------------------
// Verdict kinds — must match Python ArbiterVerdictKind (next wave)
// ---------------------------------------------------------------------------

/**
 * Aaron's verdict on an unresolved dispute.
 *
 *   - APPROVE  : Aaron sides with the original claim; dispute dismissed.
 *   - OVERTURN : Aaron rejects the original claim; reverse the outcome.
 *   - REMAND   : Aaron sends it back for more evidence (re-race, re-tribunal).
 *   - DISMISS  : Aaron rules the dispute itself was malformed.
 *   - DEFER    : Aaron postpones — case stays open, no irreversible action.
 */
export type ArbiterVerdict =
  | 'APPROVE'
  | 'OVERTURN'
  | 'REMAND'
  | 'DISMISS'
  | 'DEFER';

/** Canonical verdict order — used by the verdict button row. */
export const ARBITER_VERDICT_ORDER: readonly ArbiterVerdict[] = [
  'APPROVE',
  'OVERTURN',
  'REMAND',
  'DISMISS',
  'DEFER',
] as const;

/** Lifecycle of an arbiter case. */
export type ArbiterCaseStatus = 'open' | 'decided' | 'archived';

/**
 * Where the arbiter case escalated from. The IDE uses this to render an
 * appropriate context badge (race vs tribunal vs evidence).
 */
export type ArbiterSource = 'race' | 'tribunal' | 'evidence' | 'manual';

// ---------------------------------------------------------------------------
// Core entries
// ---------------------------------------------------------------------------

/**
 * An arbiter case — an unresolved dispute awaiting Aaron's verdict.
 * Both `aaron_verdict` and `decided_at` are null while the case is open.
 */
export type ArbiterCase = {
  /** Stable case id: `arb-<iso-utc>-<uuid4-prefix>`. */
  case_id: string;
  /** ISO-8601 timestamp the case was opened. */
  opened_at: string;
  /** Where the dispute came from. */
  source: ArbiterSource;
  /** Source artifact id — race_id, tribunal case_id, or evidence record_id. */
  source_id: string;
  /** Free-text dispute summary the IDE renders verbatim. */
  dispute_summary: string;
  /** Current lifecycle status. */
  status: ArbiterCaseStatus;
  /** Aaron's verdict, once decided. Null while open. */
  aaron_verdict: ArbiterVerdict | null;
  /** ISO-8601 timestamp the verdict was decided. Null while open. */
  decided_at: string | null;
  /** Optional reason text Aaron supplied with the verdict. */
  reason?: string | null;
};

// ---------------------------------------------------------------------------
// API wire shapes
// ---------------------------------------------------------------------------

/** Wire shape returned by `GET /api/arbiter/cases`. */
export type ArbiterCasesResponse = {
  /** All arbiter cases known (open + decided/archived). */
  cases: ArbiterCase[];
  /** Convenience counter: cases where `status === 'open'`. */
  open_count: number;
  /** Convenience counter: cases that have been decided or archived. */
  decided_count: number;
  /** Producer hint — same vocabulary as race/tribunal routes. */
  source?: 'fleet' | 'demo' | 'empty' | 'error';
  /** Optional error message when `source === 'error'`. */
  error?: string;
};

/** Wire shape sent to `POST /api/arbiter/verdict`. */
export type ArbiterVerdictRequest = {
  case_id: string;
  verdict: ArbiterVerdict;
  /** Optional free-text reason Aaron supplied with the verdict. */
  reason?: string;
};

/** Wire shape returned by `POST /api/arbiter/verdict`. */
export type ArbiterVerdictResponse = {
  /** Whether the verdict was accepted by the server. */
  recorded: boolean;
  /** EvidenceLedger record id minted for this verdict, if any. */
  evidence_record_id: string | null;
  /** Implementation note — present while write side is not yet wired. */
  note?: string;
  /** Optional error message when the verdict was not recorded. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Defaults — safe-render seed
// ---------------------------------------------------------------------------

/** Seed response used when no arbiter cases exist. */
export const EMPTY_ARBITER_CASES_RESPONSE: ArbiterCasesResponse = {
  cases: [],
  open_count: 0,
  decided_count: 0,
  source: 'empty',
};

// ---------------------------------------------------------------------------
// Display helpers — keep verdict color hints in one place.
// ---------------------------------------------------------------------------

export const ARBITER_VERDICT_COLOR: Record<ArbiterVerdict, string> = {
  APPROVE: 'emerald',
  OVERTURN: 'rose',
  REMAND: 'amber',
  DISMISS: 'slate',
  DEFER: 'sky',
};

// ---------------------------------------------------------------------------
// Event-bus payloads (arbiter:* namespace — disjoint from every other panel)
// ---------------------------------------------------------------------------

/** Fired when a new arbiter case is opened. */
export type ArbiterCaseOpenedEvent = {
  case_id: string;
  source: ArbiterSource;
  source_id: string;
  timestamp?: string;
};

/** Fired when Aaron decides a verdict on an open case. */
export type ArbiterVerdictRecordedEvent = {
  case_id: string;
  verdict: ArbiterVerdict;
  evidence_record_id: string | null;
  timestamp?: string;
};

/**
 * Disjoint registry of all `arbiter:*` events. The next-wave wiring will
 * fold these into IDEEvents in `lib/ide/event-bus.ts`.
 */
export interface ArbiterEvent {
  'arbiter:case-opened': ArbiterCaseOpenedEvent;
  'arbiter:verdict-recorded': ArbiterVerdictRecordedEvent;
}
