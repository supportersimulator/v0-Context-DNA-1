/**
 * Truth Ladder Snapshot — wire shape for the IDE TruthLadder panel
 * (AA3 scaffold, 2026-05-07).
 *
 * GET /api/truth-ladder/snapshot
 *
 * Reads a 6-rung Truth Ladder snapshot from
 * `dashboard_exports/truth_ladder_snapshot.json` (overridable via the
 * TRUTH_LADDER_SNAPSHOT_JSON env var). The snapshot is written by the
 * next-wave producer `scripts/dump-truth-ladder-snapshot.py` (mirror of
 * dump-tribunal-snapshot / dump-race-events-snapshot).
 *
 * Architecture choice: snapshot bridge JSON (NOT SQLite, NOT subscribe-on-
 * request). Same proven pattern as race/status, competition/status, and
 * tribunal/cases. The route stays stdlib-only on the Next.js side. Real
 * fleet wiring (rung promotion, demotion) lives in the Python module +
 * dump script; this route is a thin reader.
 *
 * If snapshot is missing: return EMPTY_TRUTH_LADDER_SNAPSHOT with
 * `source: 'no-snapshot'` (graceful degradation — the panel renders the
 * 6-rung skeleton with zero counts).
 *
 * ZSF: every fetch path bumps a counter exposed via
 * `__truthLadderFetchCountersForTests` so cardio sentinels can assert
 * counters move.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EMPTY_TRUTH_LADDER_SNAPSHOT,
  TRUTH_RUNG_ORDER,
  type TruthLadderSnapshot,
  type TruthRung,
  type TruthRungLabel,
} from '@/lib/ide/truth-ladder-types';

// ---------------------------------------------------------------------------
// Path resolution (mirrors race/status + tribunal/cases)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'truth_ladder_snapshot.json',
);

function snapshotPath(): string {
  if (process.env.TRUTH_LADDER_SNAPSHOT_JSON) {
    return path.resolve(process.env.TRUTH_LADDER_SNAPSHOT_JSON);
  }
  return DEFAULT_SNAPSHOT_PATH;
}

// ZSF: monotonic, process-local. Mirrors TRIBUNAL_FETCH_COUNTERS.
const TRUTH_LADDER_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  parse: number;
  shape: number;
  io: number;
  error: number;
} = { ok: 0, missing: 0, parse: 0, shape: 0, io: 0, error: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __truthLadderFetchCountersForTests(): typeof TRUTH_LADDER_FETCH_COUNTERS {
  return { ...TRUTH_LADDER_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Snapshot reader
// ---------------------------------------------------------------------------

type SnapshotShape = {
  schema_version?: string;
  generated_at?: string;
  rungs?: TruthRung[];
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
    !('rungs' in (parsed as object))
  ) {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true, data: parsed as SnapshotShape };
}

/**
 * Normalise producer rungs into the canonical 6-rung order — the IDE always
 * renders all six rungs, even if the producer omitted some.
 */
function normaliseRungs(input: TruthRung[] | undefined): TruthRung[] {
  const byLabel = new Map<TruthRungLabel, TruthRung>();
  if (Array.isArray(input)) {
    for (const r of input) {
      if (r && typeof r === 'object' && typeof r.label === 'string') {
        byLabel.set(r.label as TruthRungLabel, r);
      }
    }
  }
  return TRUTH_RUNG_ORDER.map((label, rung_index) => {
    const seed = EMPTY_TRUTH_LADDER_SNAPSHOT.rungs[rung_index];
    const supplied = byLabel.get(label);
    if (!supplied) return seed;
    const ids = Array.isArray(supplied.evidence_record_ids)
      ? supplied.evidence_record_ids
      : [];
    return {
      rung_index,
      label,
      evidence_record_ids: ids,
      confidence_floor:
        typeof supplied.confidence_floor === 'number'
          ? supplied.confidence_floor
          : seed.confidence_floor,
      item_count:
        typeof supplied.item_count === 'number'
          ? supplied.item_count
          : ids.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<TruthLadderSnapshot>> {
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      if (result.reason === 'missing') {
        TRUTH_LADDER_FETCH_COUNTERS.missing += 1;
        return NextResponse.json(EMPTY_TRUTH_LADDER_SNAPSHOT, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (result.reason === 'parse') TRUTH_LADDER_FETCH_COUNTERS.parse += 1;
      else if (result.reason === 'shape')
        TRUTH_LADDER_FETCH_COUNTERS.shape += 1;
      else if (result.reason === 'io') TRUTH_LADDER_FETCH_COUNTERS.io += 1;
      TRUTH_LADDER_FETCH_COUNTERS.error += 1;
      return NextResponse.json(
        {
          ...EMPTY_TRUTH_LADDER_SNAPSHOT,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data } = result;
    const rungs = normaliseRungs(data.rungs);
    TRUTH_LADDER_FETCH_COUNTERS.ok += 1;

    const response: TruthLadderSnapshot = {
      rungs,
      generated_at:
        typeof data.generated_at === 'string' ? data.generated_at : null,
      source: 'fleet',
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    TRUTH_LADDER_FETCH_COUNTERS.error += 1;
    return NextResponse.json(
      {
        ...EMPTY_TRUTH_LADDER_SNAPSHOT,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
