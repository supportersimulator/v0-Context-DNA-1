/**
 * Competition Status — wire shape for CampaignTheater.
 *
 * GET /api/competition/status
 *
 * Sources (best-effort, in order):
 *   1. `dashboard_exports/competition_status.json` (v6 producer output).
 *      Override path via `COMPETITION_STATUS_JSON` env var. Returned verbatim
 *      with `source: 'dashboard-export'`.
 *   2. `.fleet/audits/<YYYY-MM-DD>-decisions.md` (existing audit pipeline).
 *      Most recent ACCEPT/ESCALATE block becomes `chief_decision`.
 *      `source: 'audit-only'` when (1) is missing.
 *   3. Empty fallback (`source: 'empty'`) with a single high-priority
 *      next-best-action telling the operator how to populate state.
 *
 * On unexpected exceptions returns `{ ok: false, source: 'error', error }`
 * with HTTP 200 so the panel stays alive instead of cascading to a 500.
 *
 * ZSF: every catch path appends to the IDE log buffer + sets `ok: false`;
 * never silently swallows.
 *
 * Forward-compat: when `S2`'s EvidenceLedger lands, this route is the single
 * place to wire it in (see `loadLedgerSummary` stub below).
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { append as logAppend } from '@/lib/log/buffer';
import {
  EMPTY_STATUS,
  type ChiefDecision,
  type CompetitionStatus,
  type LedgerSummary,
} from '@/lib/ide/campaign-types';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_DASHBOARD_EXPORT = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'competition_status.json',
);

const FLEET_AUDITS_DIR = path.join(REPO_ROOT, '.fleet', 'audits');

const DEFAULT_LEDGER_SUMMARY_JSON = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'evidence_ledger_summary.json',
);

function dashboardExportPath(): string {
  if (process.env.COMPETITION_STATUS_JSON) {
    return path.resolve(process.env.COMPETITION_STATUS_JSON);
  }
  return DEFAULT_DASHBOARD_EXPORT;
}

function ledgerSummaryPath(): string {
  if (process.env.EVIDENCE_LEDGER_SUMMARY_JSON) {
    return path.resolve(process.env.EVIDENCE_LEDGER_SUMMARY_JSON);
  }
  return DEFAULT_LEDGER_SUMMARY_JSON;
}

// ZSF: monotonic process-local counter so QA / cardio sentinels can see
// "is the ledger snapshot quietly broken?" without diff-ing logs.
const LEDGER_FETCH_COUNTERS: { ok: number; missing: number; error: number } = {
  ok: 0,
  missing: 0,
  error: 0,
};

function todayDecisionsPath(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(FLEET_AUDITS_DIR, `${yyyy}-${mm}-${dd}-decisions.md`);
}

// ---------------------------------------------------------------------------
// (1) Dashboard-export reader
// ---------------------------------------------------------------------------

async function loadDashboardExport(): Promise<
  { ok: true; data: CompetitionStatus } | { ok: false; reason: string }
> {
  const p = dashboardExportPath();
  try {
    const raw = await readFile(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CompetitionStatus>;
    return {
      ok: true,
      data: {
        ...EMPTY_STATUS,
        ...parsed,
        ok: true,
        source: 'dashboard-export',
      },
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return { ok: false, reason: code ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// (2) Audit-decisions reader — extracts the most-recent chief decision.
//
// Audit file format (per docs/plans/2026-04-26-fleet-audit-pipeline.md):
//
//     ### C-D-XX-name — ACCEPT|ESCALATE_TO_RED|...
//     - ts: 1778082402
//     - finding_ids: F-...
//     - consensus: 0.20 (5 iter)
//     - rationale: ...
//
// We pick the chronologically last block (file is append-only, newest at end).
// ---------------------------------------------------------------------------

const HEADING_RE = /^###\s+([A-Za-z0-9._-]+)\s+—\s+(\S+)\s*$/;
const TS_RE = /^-\s+ts:\s+(\d+)/;
const CONSENSUS_RE = /^-\s+consensus:\s+([0-9.]+)\s*\((\d+)\s+iter\)/;
const FINDING_RE = /^-\s+finding_ids:\s+(.+)$/;
const RATIONALE_RE = /^-\s+rationale:\s+(.+)$/;

async function loadLatestChiefDecision(): Promise<ChiefDecision | null> {
  const p = todayDecisionsPath();
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch {
    return null; // file may not exist yet today
  }
  // Walk lines, accumulating per-block fields, push on next heading.
  const lines = raw.split('\n');
  let current: ChiefDecision | null = null;
  let last: ChiefDecision | null = null;
  for (const line of lines) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      if (current) last = current;
      current = {
        decision: heading[2],
        finding_ids: [],
        source: p,
      };
      // Decision id (e.g. C-D-02-loss) goes into reasoning prefix below.
      (current as Record<string, unknown>)._decision_id = heading[1];
      continue;
    }
    if (!current) continue;
    const ts = TS_RE.exec(line);
    if (ts) {
      current.timestamp = new Date(Number(ts[1]) * 1000).toISOString();
      continue;
    }
    const cons = CONSENSUS_RE.exec(line);
    if (cons) {
      current.consensus = Number(cons[1]);
      current.iter = Number(cons[2]);
      continue;
    }
    const find = FINDING_RE.exec(line);
    if (find) {
      current.finding_ids = find[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    const rat = RATIONALE_RE.exec(line);
    if (rat) {
      current.reasoning = rat[1].trim();
      continue;
    }
  }
  if (current) last = current;
  if (!last) return null;
  // Synthesize a confidence score: consensus >= 0.66 → high, ESCALATE_TO_RED
  // pulls it down. This is a UI-only heuristic; v6 producer overwrites it
  // when present.
  const consensusVal = typeof last.consensus === 'number' ? last.consensus : 0.5;
  const isEscalate = String(last.decision ?? '').toUpperCase().includes('ESCALATE');
  last.confidence = isEscalate
    ? Math.min(consensusVal, 0.5)
    : consensusVal;
  // Promote decision_id to reasoning prefix for IDE clarity.
  const did = (last as Record<string, unknown>)._decision_id;
  if (typeof did === 'string' && last.reasoning) {
    last.reasoning = `[${did}] ${last.reasoning}`;
  }
  delete (last as Record<string, unknown>)._decision_id;
  return last;
}

// ---------------------------------------------------------------------------
// (3) Evidence ledger summary — reads the JSON snapshot produced by
// `scripts/dump-evidence-ledger-summary.py`. The snapshot is the bridge
// between S2's Python EvidenceLedger (memory/evidence_ledger.db) and S3's
// CampaignTheater IDE panel. We never reach into SQLite directly from the
// Next.js process — keeps the route stdlib-only on both sides and avoids
// pulling in `better-sqlite3` (no new pnpm deps; Phase-2 3s gate).
//
// Amplification, not replacement: the panel KEEPS its existing audit-only
// path. Ledger data is folded in additively under `ledger_summary`. When
// the snapshot is missing or stale, callers see `ledger_available: false`
// and the existing UI keeps rendering as before.
//
// ZSF: every failure path bumps a counter AND logs to the IDE log buffer.
// No bare `except: pass` equivalents.
// ---------------------------------------------------------------------------

async function loadLedgerSummary(): Promise<LedgerSummary | null> {
  const p = ledgerSummaryPath();
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      LEDGER_FETCH_COUNTERS.missing += 1;
      return null;
    }
    LEDGER_FETCH_COUNTERS.error += 1;
    try {
      logAppend({
        ts: Date.now(),
        level: 'warn',
        source: 'competition/status',
        msg: 'evidence_ledger_summary read failed',
        detail: `path=${p} code=${code ?? String(err)}`,
      });
    } catch {
      /* logAppend itself failing must not crash the route */
    }
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LedgerSummary>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.schema_version !== 'string'
    ) {
      LEDGER_FETCH_COUNTERS.error += 1;
      try {
        logAppend({
          ts: Date.now(),
          level: 'warn',
          source: 'competition/status',
          msg: 'evidence_ledger_summary malformed',
          detail: `path=${p}`,
        });
      } catch {
        /* logAppend itself failing must not crash the route */
      }
      return null;
    }
    LEDGER_FETCH_COUNTERS.ok += 1;
    // Normalise so downstream code can treat the fields as required.
    return {
      schema_version: parsed.schema_version,
      generated_at: parsed.generated_at,
      db_path: parsed.db_path,
      ok: parsed.ok === true,
      reason: parsed.reason,
      error: parsed.error,
      total_records:
        typeof parsed.total_records === 'number' ? parsed.total_records : 0,
      by_kind:
        parsed.by_kind && typeof parsed.by_kind === 'object'
          ? (parsed.by_kind as Record<string, number>)
          : {},
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch (err) {
    LEDGER_FETCH_COUNTERS.error += 1;
    try {
      logAppend({
        ts: Date.now(),
        level: 'warn',
        source: 'competition/status',
        msg: 'evidence_ledger_summary parse failed',
        detail: ((err as Error)?.message ?? String(err)).slice(0, 200),
      });
    } catch {
      /* logAppend itself failing must not crash the route */
    }
    return null;
  }
}

/** Test-only accessor — exported so unit/integration tests can assert
 * that the ZSF counters move on the missing/error paths without poking
 * module internals. Not part of the public route contract. */
export function __ledgerFetchCountersForTests(): typeof LEDGER_FETCH_COUNTERS {
  return { ...LEDGER_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const exportResult = await loadDashboardExport();
    const chiefFromAudit = await loadLatestChiefDecision();
    const ledger = await loadLedgerSummary();

    // Treat the snapshot as "available" only when it loaded AND its own
    // ok flag is true. A `db_missing` / `sqlite_error` snapshot still
    // parses, but we degrade to the audit-only UI.
    const ledgerAvailable = ledger !== null && ledger.ok === true;

    if (exportResult.ok) {
      // Use v6 export verbatim; fold in audit-derived chief decision only if
      // the export lacks one. Ledger summary is ADDED (amplification, not
      // replacement) — recent_evidence and the rest of the v6 export are
      // untouched.
      const merged: CompetitionStatus = {
        ...exportResult.data,
        chief_decision: exportResult.data.chief_decision ?? chiefFromAudit ?? null,
        ledger_available: ledgerAvailable,
        ledger_summary: ledger,
      };
      return NextResponse.json(merged);
    }

    // No dashboard export — construct an audit-only or empty response.
    const fallback: CompetitionStatus = {
      ...EMPTY_STATUS,
      ok: chiefFromAudit !== null || ledgerAvailable,
      source: chiefFromAudit ? 'audit-only' : 'empty',
      chief_decision: chiefFromAudit,
      ledger_available: ledgerAvailable,
      ledger_summary: ledger,
    };
    if (chiefFromAudit) {
      fallback.next_best_actions = [
        {
          priority: 'medium',
          action: 'Generate dashboard export',
          why: 'Run cdna-comp dashboard to amplify the audit decision into the full campaign panel.',
        },
      ];
    }
    return NextResponse.json(fallback);
  } catch (error) {
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'competition/status',
        msg: 'unexpected error in /api/competition/status',
        detail: ((error as Error)?.stack || String(error)).slice(0, 500),
      });
    } catch {
      /* logAppend itself failing must not crash the route */
    }
    return NextResponse.json({
      ...EMPTY_STATUS,
      ok: false,
      source: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
