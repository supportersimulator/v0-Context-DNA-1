// =============================================================================
// Validation Tribunal — TypeScript types (Z3 scaffold, 2026-05-07)
//
// Wire shape for the tribunal cases strip rendered BELOW the existing
// CampaignTheater ledger summary. The Validation Tribunal is the corrective
// peer of the Permission Governor (preventive): when a Race Theater verdict
// comes back UNRESOLVED, or an EvidenceLedger record is disputed, a tribunal
// case is opened, decided, and archived as a child evidence record.
//
// SCAFFOLD ONLY: this file declares the public type surface so
// `app/api/tribunal/cases/route.ts` and the CampaignTheater strip can be
// authored in isolation. Real fleet wiring (live tribunal-case events,
// websocket subscriptions, open-case admin form) lands in the next wave.
//
// Disjoint event namespace: `tribunal:*` — does NOT collide with `race:*`,
// `evidence:*`, `surgeon:*`, `fleet:*`, `permission:*`. The fleet→IDE bridge
// already routes by namespace prefix (see `lib/ide/event-bridge.ts`); adding
// `tribunal:*` requires only the type declarations below + a registry entry
// in IDEEvents when the next wave wires it through.
// =============================================================================

// ---------------------------------------------------------------------------
// Verdict kinds — must match Python TribunalVerdictKind
// ---------------------------------------------------------------------------

/**
 * Verdict from the tribunal panel.
 *
 *   - APPROVE    : original outcome stands; dispute dismissed on the merits.
 *   - OVERTURN   : original outcome reversed; majority found a fault.
 *   - REMAND     : insufficient evidence; sent back for another race.
 *   - DISMISS    : the dispute itself was malformed.
 *   - UNRESOLVED : panelists deadlocked even after tribunal-chief tiebreak.
 */
export type TribunalVerdictKind =
  | 'APPROVE'
  | 'OVERTURN'
  | 'REMAND'
  | 'DISMISS'
  | 'UNRESOLVED';

/** Lifecycle of a tribunal case. */
export type TribunalCaseStatus = 'open' | 'decided' | 'archived';

// ---------------------------------------------------------------------------
// Core entries
// ---------------------------------------------------------------------------

/** A tribunal case — disputed race or evidence record awaiting decision. */
export type TribunalCase = {
  /** Stable case id: `<iso-utc>-<uuid4-prefix>`. */
  case_id: string;
  /** Disputed artifact — race_id (Race Theater) or evidence record_id. */
  race_id_or_evidence_id: string;
  /** Free-text reason for the dispute. */
  dispute_reason: string;
  /** Panelist roles — defaults to cardio/neuro/judge/tribunal_chief. */
  panelists: string[];
  /** ISO-8601 timestamp the case was opened. */
  opened_at: string;
  /** Current lifecycle status. */
  status: TribunalCaseStatus;
};

/** A tribunal verdict — output of `decide()` and `archive()`. */
export type TribunalVerdict = {
  /** Matches the case_id of the case this verdict resolves. */
  case_id: string;
  /** The verdict kind. */
  verdict: TribunalVerdictKind;
  /** Concatenated majority-side prose (panelist opinions joined). */
  majority_opinion: string;
  /** Dissenting prose lines, in panelist order. */
  dissent_opinions: string[];
  /** ISO-8601 timestamp the verdict was decided. */
  decided_at: string;
  /** Per-panelist opinion text (keyed by panelist role). */
  panelist_opinions?: Record<string, string>;
  /** EvidenceLedger record id once the verdict is archived. */
  evidence_record_id?: string | null;
};

/**
 * Combined wire entry — what the IDE renders. Open cases have no `verdict`;
 * decided/archived cases carry both. Producer-supplied; the IDE never
 * synthesises this shape.
 */
export type TribunalEntry = {
  case: TribunalCase;
  verdict?: TribunalVerdict;
};

// ---------------------------------------------------------------------------
// API wire shape
// ---------------------------------------------------------------------------

/** Wire shape returned by `GET /api/tribunal/cases`. */
export type TribunalCasesResponse = {
  /** All tribunal cases known (open + decided/archived). */
  cases: TribunalEntry[];
  /** Convenience counter: cases where `status === 'open'`. */
  open_count: number;
  /** Convenience counter: cases that have been decided or archived. */
  decided_count: number;
  /** Producer hint — same vocabulary as race/competition routes. */
  source?: 'fleet' | 'demo' | 'empty' | 'error';
  /** Optional error message when `source === 'error'`. */
  error?: string;
  /** Optional counters surfaced from the Python module. */
  counters?: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Defaults — safe-render seed
// ---------------------------------------------------------------------------

export const EMPTY_TRIBUNAL_RESPONSE: TribunalCasesResponse = {
  cases: [],
  open_count: 0,
  decided_count: 0,
  source: 'empty',
};

// ---------------------------------------------------------------------------
// Event-bus payloads (tribunal:* namespace — disjoint from race/evidence/etc)
// ---------------------------------------------------------------------------

/** Fired when a new tribunal case is opened. */
export type TribunalCaseOpenedEvent = {
  case_id: string;
  artifact_id: string;
  reason: string;
  timestamp?: string;
};

/** Fired when a tribunal verdict is decided (post-vote, pre-archive). */
export type TribunalVerdictDecidedEvent = {
  case_id: string;
  verdict: TribunalVerdictKind;
  timestamp?: string;
};

/** Fired when a tribunal verdict is archived to the EvidenceLedger. */
export type TribunalVerdictArchivedEvent = {
  case_id: string;
  evidence_record_id: string;
  timestamp?: string;
};

/**
 * Disjoint registry of all `tribunal:*` events. The next-wave wiring will
 * fold these into IDEEvents in `lib/ide/event-bus.ts`.
 */
export interface TribunalEvent {
  'tribunal:case-opened': TribunalCaseOpenedEvent;
  'tribunal:verdict-decided': TribunalVerdictDecidedEvent;
  'tribunal:verdict-archived': TribunalVerdictArchivedEvent;
}

/**
 * Verdict color hint — read-only consumers (CampaignTheater strip) use this
 * to color-code the verdict pill. Centralised here so panels stay consistent.
 */
export const TRIBUNAL_VERDICT_COLOR: Record<TribunalVerdictKind, string> = {
  APPROVE: 'emerald',
  OVERTURN: 'rose',
  REMAND: 'amber',
  DISMISS: 'slate',
  UNRESOLVED: 'violet',
};
