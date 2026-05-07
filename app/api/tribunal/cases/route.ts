/**
 * Tribunal Cases — wire shape for the CampaignTheater tribunal strip
 * (Z3 scaffold, 2026-05-07).
 *
 * GET /api/tribunal/cases
 *
 * Reads tribunal cases from a JSON snapshot at
 * `dashboard_exports/tribunal_cases_snapshot.json` (overridable via the
 * TRIBUNAL_CASES_SNAPSHOT_JSON env var). The snapshot is written by
 * `scripts/dump-tribunal-snapshot.py` (mirror of dump-race-events-snapshot
 * and dump-evidence-ledger-summary patterns).
 *
 * Architecture choice: snapshot bridge JSON (NOT SQLite, NOT subscribe-on-
 * request). Same proven pattern as race/status and competition/status. The
 * route stays stdlib-only on the Next.js side. Real fleet wiring lives in
 * the Python module + dump script; this route is a thin reader.
 *
 * If snapshot is missing: return EMPTY_TRIBUNAL_RESPONSE with
 * `source: 'empty'` (graceful degradation — the panel renders a CTA).
 *
 * ZSF: every fetch path bumps a counter exposed via
 * `__tribunalFetchCountersForTests` so cardio sentinels can assert
 * counters move.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EMPTY_TRIBUNAL_RESPONSE,
  type TribunalCasesResponse,
  type TribunalEntry,
} from '@/lib/ide/tribunal-types';

// ---------------------------------------------------------------------------
// Path resolution (mirrors race/status + competition/status)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'tribunal_cases_snapshot.json',
);

function snapshotPath(): string {
  if (process.env.TRIBUNAL_CASES_SNAPSHOT_JSON) {
    return path.resolve(process.env.TRIBUNAL_CASES_SNAPSHOT_JSON);
  }
  return DEFAULT_SNAPSHOT_PATH;
}

// ZSF: monotonic, process-local. Mirrors RACE_FETCH_COUNTERS.
const TRIBUNAL_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  parse: number;
  shape: number;
  io: number;
  error: number;
} = { ok: 0, missing: 0, parse: 0, shape: 0, io: 0, error: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __tribunalFetchCountersForTests(): typeof TRIBUNAL_FETCH_COUNTERS {
  return { ...TRIBUNAL_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Snapshot reader
// ---------------------------------------------------------------------------

type SnapshotShape = {
  schema_version?: string;
  generated_at?: string;
  cases?: TribunalEntry[];
  counters?: Record<string, number>;
};

async function loadSnapshot(): Promise<
  | { ok: true; data: SnapshotShape }
  | {
      ok: false;
      reason: 'missing' | 'parse' | 'shape' | 'io';
      detail?: string;
    }
> {
  const p = snapshotPath();
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      return { ok: false, reason: 'missing' };
    }
    return { ok: false, reason: 'io', detail: code ?? String(err) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reason: 'parse',
      detail: ((err as Error)?.message ?? String(err)).slice(0, 200),
    };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('cases' in (parsed as object))
  ) {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true, data: parsed as SnapshotShape };
}

function countByStatus(cases: TribunalEntry[]): {
  open: number;
  decided: number;
} {
  let open = 0;
  let decided = 0;
  for (const c of cases) {
    if (c.case.status === 'open') {
      open += 1;
    } else {
      decided += 1;
    }
  }
  return { open, decided };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<TribunalCasesResponse>> {
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      if (result.reason === 'missing') {
        TRIBUNAL_FETCH_COUNTERS.missing += 1;
        return NextResponse.json(EMPTY_TRIBUNAL_RESPONSE, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      // bump the specific reason counter so dashboards can plot.
      if (result.reason === 'parse') TRIBUNAL_FETCH_COUNTERS.parse += 1;
      else if (result.reason === 'shape') TRIBUNAL_FETCH_COUNTERS.shape += 1;
      else if (result.reason === 'io') TRIBUNAL_FETCH_COUNTERS.io += 1;
      TRIBUNAL_FETCH_COUNTERS.error += 1;
      return NextResponse.json(
        {
          ...EMPTY_TRIBUNAL_RESPONSE,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data } = result;
    const cases = Array.isArray(data.cases) ? data.cases : [];
    const counts = countByStatus(cases);
    TRIBUNAL_FETCH_COUNTERS.ok += 1;

    const response: TribunalCasesResponse = {
      cases,
      open_count: counts.open,
      decided_count: counts.decided,
      source: 'fleet',
      counters: data.counters,
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    TRIBUNAL_FETCH_COUNTERS.error += 1;
    return NextResponse.json(
      {
        ...EMPTY_TRIBUNAL_RESPONSE,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
