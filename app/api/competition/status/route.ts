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

function dashboardExportPath(): string {
  if (process.env.COMPETITION_STATUS_JSON) {
    return path.resolve(process.env.COMPETITION_STATUS_JSON);
  }
  return DEFAULT_DASHBOARD_EXPORT;
}

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
// (S2 hook) — Evidence ledger summary (forward-compat stub).
// When S2's EvidenceLedger module lands at e.g. `lib/ledger/index.ts`, this
// stub is replaced with a real call. Until then it returns null and the
// panel renders the existing recent_evidence array.
// ---------------------------------------------------------------------------

async function loadLedgerSummary(): Promise<unknown[] | null> {
  // Reserved for S2 wiring — return null today so we degrade gracefully.
  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const exportResult = await loadDashboardExport();
    const chiefFromAudit = await loadLatestChiefDecision();
    const ledger = await loadLedgerSummary();

    if (exportResult.ok) {
      // Use v6 export verbatim; fold in audit-derived chief decision only if
      // the export lacks one.
      const merged: CompetitionStatus = {
        ...exportResult.data,
        chief_decision: exportResult.data.chief_decision ?? chiefFromAudit ?? null,
        ledger_available: ledger !== null,
      };
      return NextResponse.json(merged);
    }

    // No dashboard export — construct an audit-only or empty response.
    const fallback: CompetitionStatus = {
      ...EMPTY_STATUS,
      ok: chiefFromAudit !== null,
      source: chiefFromAudit ? 'audit-only' : 'empty',
      chief_decision: chiefFromAudit,
      ledger_available: ledger !== null,
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
