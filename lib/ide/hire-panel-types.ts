// =============================================================================
// Hire Panel — TypeScript types (EE1 Phase-12 scaffold, 2026-05-07)
//
// Wire shape for the CLIENT-FACING engagement page rendered at
// `/hire/<engagement_id>`. This is the IDE's 9th panel — the bridge from
// ContextDNA-the-product to Aaron-as-hired-coder selling that product as a
// service.
//
// Path A (revenue): win competitions → resume signal → hirable client work
// delivered through this panel inside ContextDNA IDE.
//
// CLIENT-SAFE BY CONSTRUCTION:
//   - This file declares ONLY fields that are safe to surface to clients.
//   - The Python redactor (`multifleet.hire_panel.HirePanel.redact_for_client`)
//     strips any internal field BEFORE it reaches the snapshot the route reads.
//   - The route itself does no redaction — single source of truth lives in
//     Python so the boundary can't drift between languages.
//
// Disjoint event namespace: `hire:*` — does NOT collide with `tribunal:*`,
// `race:*`, `evidence:*`, `surgeon:*`, `permission:*`, `truth:*`, `arbiter:*`.
//
// Reversibility: pure type module + one route + one page + one component;
// `git revert` of the four files removes the panel cleanly.
// =============================================================================

// ---------------------------------------------------------------------------
// Status — must match Python HireStatus
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a client engagement.
 *
 *   - scoping    : Atlas is reading the brief, drafting an SoW.
 *   - coding     : Atlas is implementing.
 *   - reviewing  : Implementation in cross-exam (3-Surgeons / human review).
 *   - shipping   : Final delivery, deployment, handoff.
 *   - complete   : Engagement closed; this view is now an archive.
 */
export type HireStatus =
  | 'scoping'
  | 'coding'
  | 'reviewing'
  | 'shipping'
  | 'complete';

// ---------------------------------------------------------------------------
// Core entries
// ---------------------------------------------------------------------------

/**
 * A single client-visible milestone. The internal `evidence_record_id`
 * pointer is intentionally absent — the redactor strips it on the Python
 * side so the IDE is forward-safe even if a future field leaks one.
 */
export type HireMilestone = {
  /** ISO-8601 UTC timestamp the milestone was recorded. */
  timestamp: string;
  /** Human-readable description, plain prose. */
  description: string;
};

/**
 * The client-facing engagement projection. Mirrors the redactor's
 * allowlist (`_CLIENT_SAFE_TOP_LEVEL_KEYS` in `multifleet/hire_panel.py`).
 *
 * NOTE: there is intentionally NO `recent_evidence_record_ids`,
 * `cardio_*`, `neuro_*`, `judge_*`, `cost_*`, `tokens_*`, `node_id`, or
 * `model` field in this type. If you need to add an internal field,
 * extend the Python dataclass — DO NOT add it here.
 */
export type HireEngagement = {
  /** Stable engagement id, opaque to the client. */
  engagement_id: string;
  /** Client display name (their company / project). */
  client_name: string;
  /** ISO-8601 UTC timestamp engagement was scoped. */
  started_at: string;
  /** One-line summary of what Atlas is doing right now. */
  current_task: string;
  /** Ordered list of contractual deliverables. */
  deliverables: string[];
  /** Human-readable identity Atlas uses on this engagement (e.g. "Atlas"). */
  atlas_actor: string;
  /** Current lifecycle status — drives the status pill in the UI. */
  status: HireStatus;
  /** Recent milestones, oldest → newest. The page slices to the last 5. */
  milestones: HireMilestone[];
  /** ISO-8601 UTC of the last activity; null when the engagement is empty. */
  last_updated_at: string | null;
};

// ---------------------------------------------------------------------------
// API wire shape
// ---------------------------------------------------------------------------

/** Wire shape returned by `GET /api/hire/[engagement_id]`. */
export type HireEngagementResponse = {
  /** The engagement projection, or null when no engagement is active. */
  engagement: HireEngagement | null;
  /** Producer hint — same vocabulary as race/competition/tribunal routes. */
  source: 'fleet' | 'demo' | 'empty' | 'error';
  /** Optional error message when `source === 'error'`. */
  error?: string;
  /** ISO-8601 UTC of the snapshot's `generated_at` field. */
  generated_at?: string;
};

/** Default-empty response — used by the route on missing-snapshot. */
export const EMPTY_HIRE_RESPONSE: HireEngagementResponse = {
  engagement: null,
  source: 'empty',
};

// ---------------------------------------------------------------------------
// Status pill colors — centralised so the page + future strip stay aligned.
// ---------------------------------------------------------------------------

export const HIRE_STATUS_COLOR: Record<HireStatus, string> = {
  scoping: 'sky',
  coding: 'emerald',
  reviewing: 'amber',
  shipping: 'violet',
  complete: 'slate',
};

export const HIRE_STATUS_LABEL: Record<HireStatus, string> = {
  scoping: 'Scoping',
  coding: 'Coding',
  reviewing: 'Reviewing',
  shipping: 'Shipping',
  complete: 'Complete',
};

// ---------------------------------------------------------------------------
// Event-bus payloads (hire:* namespace — disjoint from all other panels)
// ---------------------------------------------------------------------------

export type HireMilestoneRecordedEvent = {
  engagement_id: string;
  description: string;
  timestamp?: string;
};

export type HireStatusTransitionedEvent = {
  engagement_id: string;
  from_status: HireStatus;
  to_status: HireStatus;
  timestamp?: string;
};

/**
 * Disjoint registry of all `hire:*` events. The next-wave wiring will fold
 * these into IDEEvents in `lib/ide/event-bus.ts` once the panel goes live.
 */
export interface HireEvent {
  'hire:milestone-recorded': HireMilestoneRecordedEvent;
  'hire:status-transitioned': HireStatusTransitionedEvent;
}
