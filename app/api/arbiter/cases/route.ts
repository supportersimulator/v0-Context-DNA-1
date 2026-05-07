/**
 * Arbiter Cases — wire shape for the IDE HumanArbiter panel
 * (AA3 scaffold, 2026-05-07).
 *
 * GET /api/arbiter/cases
 *
 * Reads arbiter cases from `dashboard_exports/arbiter_cases_snapshot.json`
 * (overridable via the ARBITER_CASES_SNAPSHOT_JSON env var). The snapshot is
 * written by the next-wave producer `scripts/dump-arbiter-snapshot.py`
 * (mirror of dump-tribunal-snapshot).
 *
 * Architecture choice: snapshot bridge JSON. Same proven pattern as
 * race/status, competition/status, tribunal/cases, and truth-ladder. Stays
 * stdlib-only on the Next.js side.
 *
 * If snapshot is missing: return EMPTY_ARBITER_CASES_RESPONSE — the panel
 * renders the empty state ("No cases needing arbitration.").
 *
 * ZSF: every fetch path bumps a counter exposed via
 * `__arbiterFetchCountersForTests`.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EMPTY_ARBITER_CASES_RESPONSE,
  type ArbiterCase,
  type ArbiterCasesResponse,
} from '@/lib/ide/human-arbiter-types';

// ---------------------------------------------------------------------------
// Path resolution (mirrors tribunal/cases)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'arbiter_cases_snapshot.json',
);

function snapshotPath(): string {
  if (process.env.ARBITER_CASES_SNAPSHOT_JSON) {
    return path.resolve(process.env.ARBITER_CASES_SNAPSHOT_JSON);
  }
  return DEFAULT_SNAPSHOT_PATH;
}

// ZSF: monotonic, process-local.
const ARBITER_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  parse: number;
  shape: number;
  io: number;
  error: number;
} = { ok: 0, missing: 0, parse: 0, shape: 0, io: 0, error: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __arbiterFetchCountersForTests(): typeof ARBITER_FETCH_COUNTERS {
  return { ...ARBITER_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Snapshot reader
// ---------------------------------------------------------------------------

type SnapshotShape = {
  schema_version?: string;
  generated_at?: string;
  cases?: ArbiterCase[];
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

function countByStatus(cases: ArbiterCase[]): {
  open: number;
  decided: number;
} {
  let open = 0;
  let decided = 0;
  for (const c of cases) {
    if (c.status === 'open') {
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

export async function GET(): Promise<NextResponse<ArbiterCasesResponse>> {
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      if (result.reason === 'missing') {
        ARBITER_FETCH_COUNTERS.missing += 1;
        return NextResponse.json(EMPTY_ARBITER_CASES_RESPONSE, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (result.reason === 'parse') ARBITER_FETCH_COUNTERS.parse += 1;
      else if (result.reason === 'shape') ARBITER_FETCH_COUNTERS.shape += 1;
      else if (result.reason === 'io') ARBITER_FETCH_COUNTERS.io += 1;
      ARBITER_FETCH_COUNTERS.error += 1;
      return NextResponse.json(
        {
          ...EMPTY_ARBITER_CASES_RESPONSE,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data } = result;
    const cases = Array.isArray(data.cases) ? data.cases : [];
    const counts = countByStatus(cases);
    ARBITER_FETCH_COUNTERS.ok += 1;

    const response: ArbiterCasesResponse = {
      cases,
      open_count: counts.open,
      decided_count: counts.decided,
      source: 'fleet',
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    ARBITER_FETCH_COUNTERS.error += 1;
    return NextResponse.json(
      {
        ...EMPTY_ARBITER_CASES_RESPONSE,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
