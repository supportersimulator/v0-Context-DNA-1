/**
 * Race Status — wire shape for RaceTheater (Y1, 2026-05-07).
 *
 * GET /api/race/status
 *
 * Reads recent race events from a JSON snapshot at
 * `dashboard_exports/race_events_snapshot.json` (overridable via the
 * RACE_EVENTS_SNAPSHOT_JSON env var). The snapshot is written by
 * `tools/fleet_race_publisher.py` whenever a 3-surgeon brainstorm completes
 * with `RACE_PUBLISH=1`, OR by `scripts/dump-race-events-snapshot.py` (the
 * cross-fleet aggregation lever — subscribes to `race.event.>` for ~30s).
 *
 * Architecture choice (see `.fleet/audits/2026-05-07-Y1-race-theater-backend.md`):
 *   Snapshot bridge JSON — same proven pattern as competition/status
 *   (EvidenceLedger). The route stays stdlib-only on the Next.js side.
 *
 * If snapshot is missing: return `{races: [], active_count: 0, source:
 * 'no-snapshot'}` (no error — panel renders empty state CTA).
 *
 * ZSF: every fetch path bumps a counter in `RACE_FETCH_COUNTERS` (ok /
 * missing / stale / error). Counters are exposed to tests via
 * `__raceFetchCountersForTests` so cardio sentinels can assert they move.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { append as logAppend } from '@/lib/log/buffer';
import {
  EMPTY_RACE_STATUS,
  type RaceEntry,
  type RaceStatusResponse,
} from '@/lib/ide/race-types';

// ---------------------------------------------------------------------------
// Path resolution (mirrors competition/status)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'race_events_snapshot.json',
);

function snapshotPath(): string {
  if (process.env.RACE_EVENTS_SNAPSHOT_JSON) {
    return path.resolve(process.env.RACE_EVENTS_SNAPSHOT_JSON);
  }
  return DEFAULT_SNAPSHOT_PATH;
}

// Stale threshold — when generated_at is older than this many ms, mark
// `source: 'stale'`. The panel can keep rendering but should hint refresh.
// Default 5 minutes (race lifecycle is short — a 5+ min-old snapshot is
// almost certainly post-race).
const STALE_AFTER_MS = 5 * 60 * 1000;

// ZSF: monotonic, process-local. Mirrors LEDGER_FETCH_COUNTERS.
const RACE_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  stale: number;
  error: number;
} = { ok: 0, missing: 0, stale: 0, error: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __raceFetchCountersForTests(): typeof RACE_FETCH_COUNTERS {
  return { ...RACE_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Snapshot reader
// ---------------------------------------------------------------------------

type SnapshotShape = {
  schema_version?: string;
  generated_at?: string;
  races?: RaceEntry[];
  counters?: Record<string, number>;
};

async function loadSnapshot(): Promise<
  | { ok: true; data: SnapshotShape }
  | { ok: false; reason: 'missing' | 'parse' | 'shape' | 'io'; detail?: string }
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
  if (!parsed || typeof parsed !== 'object' || !('races' in (parsed as object))) {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true, data: parsed as SnapshotShape };
}

function isStale(generatedAt: string | undefined): boolean {
  if (!generatedAt) return false;
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_AFTER_MS;
}

function countActive(races: RaceEntry[]): number {
  let n = 0;
  for (const r of races) {
    if (r.status === 'racing' || r.status === 'synthesizing') n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<RaceStatusResponse>> {
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      if (result.reason === 'missing') {
        RACE_FETCH_COUNTERS.missing += 1;
        return NextResponse.json(
          {
            races: [],
            active_count: 0,
            source: 'empty',
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      RACE_FETCH_COUNTERS.error += 1;
      try {
        logAppend({
          ts: Date.now(),
          level: 'warn',
          source: 'race/status',
          msg: `race snapshot read failed: ${result.reason}`,
          detail: result.detail ?? '',
        });
      } catch {
        /* logAppend itself failing must not crash the route */
      }
      return NextResponse.json(
        {
          races: [],
          active_count: 0,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const { data } = result;
    const races = Array.isArray(data.races) ? data.races : [];
    const stale = isStale(data.generated_at);
    if (stale) {
      RACE_FETCH_COUNTERS.stale += 1;
    } else {
      RACE_FETCH_COUNTERS.ok += 1;
    }

    const response: RaceStatusResponse = {
      races,
      active_count: countActive(races),
      source: stale ? 'fleet' : 'fleet',
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    RACE_FETCH_COUNTERS.error += 1;
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'race/status',
        msg: 'unexpected error in /api/race/status',
        detail: ((error as Error)?.stack || String(error)).slice(0, 500),
      });
    } catch {
      /* logAppend itself failing must not crash the route */
    }
    return NextResponse.json(
      {
        ...EMPTY_RACE_STATUS,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
