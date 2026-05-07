// =============================================================================
// CampaignTheater — TypeScript types
//
// Ported from `contextdna_competition_engine_v6/ide_panel/dockview/src/types.ts`
// (Aaron's v6 R2 inventory) and re-homed under `admin.contextdna.io/lib/ide/`
// for parity with the existing `event-bus.ts` + `event-bridge.ts` stack.
//
// Shape mirrors the JSON produced by:
//   PYTHONPATH=src python -m contextdna_competition_engine.cli.main \
//     harden-demo --config configs/example_tabular_binary.yaml
//
// which lands at `dashboard_exports/competition_status.json`.
//
// `CompetitionStatus` is the wire shape returned by
//   GET /api/competition/status
// and consumed by `CampaignTheater.tsx`. Fields are intentionally optional /
// loose (Record<string, any>) where the v6 producer evolves quickly — the
// panel renders defensively (see `fmt()` + `topCandidates`).
// =============================================================================

export type CompetitionDashboardState = {
  schema_version: string;
  competition: Record<string, unknown>;
  campaign_summary: {
    competition_id?: string;
    node_result_count: number;
    evidence_count: number;
    strategy_packet_count: number;
    top_score?: number | null;
    top_experiment_id?: string | null;
    ready_submission_count: number;
  };
  strategy_packets: unknown[];
  recent_evidence: unknown[];
  constitutions: unknown[];
  node_results: unknown[];
  submission_candidates: SubmissionCandidate[];
  chief_decision?: ChiefDecision | null;
  risks: Record<string, unknown[]>;
  next_best_actions: NextAction[];
  extra?: Record<string, unknown>;
};

export type SubmissionCandidate = {
  experiment_id?: string;
  strategy_id?: string;
  model_family?: string;
  score?: number;
  metric?: string;
  validation_trust_score?: number;
  validation_verdict?: string;
  submission_allowed?: boolean;
  submission_path?: string;
  node_result_path?: string;
  risk_count?: number;
};

export type NextAction = {
  priority: 'high' | 'medium' | 'low' | string;
  action: string;
  why: string;
};

export type ChiefDecision = {
  decision?: string;
  reasoning?: string;
  confidence?: number;
  finding_ids?: string[];
  consensus?: number;
  iter?: number;
  source?: string; // path to audit file when sourced from `.fleet/audits/`
  timestamp?: string;
  [k: string]: unknown;
};

// ---------------------------------------------------------------------------
// LedgerSummary — projection of `memory/evidence_ledger.db` for the IDE.
//
// Produced by `scripts/dump-evidence-ledger-summary.py` and read by the
// `/api/competition/status` route. Kept intentionally narrow — the full
// EvidenceLedger record content can be heavy; the panel only needs a glance.
// ---------------------------------------------------------------------------
export type LedgerSummaryEntry = {
  record_id: string;
  kind: string;
  created_at: string;
  schema_version?: string;
  git_rev?: string | null;
  summary?: string;
  parent_count?: number;
};

export type LedgerSummary = {
  schema_version: string;
  generated_at?: string;
  db_path?: string;
  ok: boolean;
  reason?: string;
  error?: string;
  total_records: number;
  by_kind: Record<string, number>;
  records: LedgerSummaryEntry[];
};

// ---------------------------------------------------------------------------
// CompetitionStatus — wire shape returned by GET /api/competition/status.
//
// Superset of `CompetitionDashboardState` so we can graceful-fallback when the
// v6 dashboard export is missing but a recent chief decision is available
// from `.fleet/audits/<date>-decisions.md`.
// ---------------------------------------------------------------------------
export type CompetitionStatus = CompetitionDashboardState & {
  ok: boolean;
  source: 'dashboard-export' | 'audit-only' | 'empty' | 'error';
  error?: string;
  ledger_available?: boolean;
  ledger_summary?: LedgerSummary | null;
};

export const EMPTY_STATUS: CompetitionStatus = {
  ok: false,
  source: 'empty',
  schema_version: 'competition/v6.dockview_dashboard_state',
  competition: {},
  campaign_summary: {
    node_result_count: 0,
    evidence_count: 0,
    strategy_packet_count: 0,
    ready_submission_count: 0,
  },
  strategy_packets: [],
  recent_evidence: [],
  constitutions: [],
  node_results: [],
  submission_candidates: [],
  chief_decision: null,
  risks: {},
  next_best_actions: [
    {
      priority: 'high',
      action: 'Generate dashboard state',
      why: 'Run cdna-comp harden-demo or cdna-comp dashboard first.',
    },
  ],
};
