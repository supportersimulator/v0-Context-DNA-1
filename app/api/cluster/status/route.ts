/**
 * Cluster Status — wire shape for the IDE Status Overview pill bar
 * (CC4 Phase-10, 2026-05-07).
 *
 * GET /api/cluster/status
 *
 * Reads the cluster status snapshot from
 * `dashboard_exports/cluster_status_snapshot.json` (overridable via the
 * `CLUSTER_STATUS_SNAPSHOT_JSON` env var). The snapshot is written by
 * `scripts/dump-cluster-status-snapshot.py` — same proven pattern as
 * truth-ladder, race/status, tribunal/cases, permissions/current.
 *
 * Architecture choice: snapshot bridge JSON (NOT SQLite, NOT subscribe-on-
 * request). The route stays stdlib-only on the Next.js side. Real fleet
 * synthesis (health probe + git counts + invariants log + active phase)
 * lives in the Python dump script; this route is a thin reader.
 *
 * If snapshot is missing: return `EMPTY_CLUSTER_STATUS` with
 * `source: 'no-snapshot'` (graceful — pill bar renders six slate pills).
 *
 * ZSF: every fetch path bumps a counter exposed via
 * `__clusterStatusFetchCountersForTests` so cardio sentinels can assert
 * counters move.
 */

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EMPTY_CLUSTER_STATUS,
  type ClusterHealth,
  type ClusterHealthState,
  type ClusterStatus,
  type ClusterStatusSource,
  type CommitsAhead,
  type InvariantsState,
  type PushFreezeState,
} from '@/lib/ide/cluster-status-types';

// ---------------------------------------------------------------------------
// Path resolution (mirrors race/status + tribunal/cases + truth-ladder)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_SNAPSHOT_PATH = path.join(
  REPO_ROOT,
  'dashboard_exports',
  'cluster_status_snapshot.json',
);

function snapshotPath(): string {
  if (process.env.CLUSTER_STATUS_SNAPSHOT_JSON) {
    return path.resolve(process.env.CLUSTER_STATUS_SNAPSHOT_JSON);
  }
  return DEFAULT_SNAPSHOT_PATH;
}

// ZSF: monotonic, process-local. Mirrors TRUTH_LADDER_FETCH_COUNTERS.
const CLUSTER_STATUS_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  parse: number;
  shape: number;
  io: number;
  error: number;
} = { ok: 0, missing: 0, parse: 0, shape: 0, io: 0, error: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __clusterStatusFetchCountersForTests(): typeof CLUSTER_STATUS_FETCH_COUNTERS {
  return { ...CLUSTER_STATUS_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Snapshot reader
// ---------------------------------------------------------------------------

type RawSnapshot = {
  schema_version?: string;
  generated_at?: string | null;
  active_phase?: string | null;
  cluster_health?: Partial<ClusterHealth> | null;
  push_freeze?: Partial<PushFreezeState> | null;
  commits_ahead?: Partial<CommitsAhead> | null;
  invariants?: Partial<InvariantsState> | null;
  panels_live?: number;
  source?: string;
  error?: string;
};

async function loadSnapshot(): Promise<
  | { ok: true; data: RawSnapshot }
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
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true, data: parsed as RawSnapshot };
}

// ---------------------------------------------------------------------------
// Normalisers — coerce raw producer payload into the canonical wire shape.
// The IDE always renders the full pill bar even when the producer omits
// fields, so we fall back to EMPTY_CLUSTER_STATUS atoms field-by-field.
// ---------------------------------------------------------------------------

function normaliseHealthState(s: unknown): ClusterHealthState {
  if (s === 'ok' || s === 'degraded' || s === 'down' || s === 'unknown') {
    return s;
  }
  return 'unknown';
}

function normaliseHealth(input: Partial<ClusterHealth> | null | undefined): ClusterHealth {
  const seed = EMPTY_CLUSTER_STATUS.cluster_health;
  if (!input || typeof input !== 'object') return seed;
  const surgeonsRaw =
    input.surgeons && typeof input.surgeons === 'object' ? input.surgeons : {};
  const cardio =
    typeof (surgeonsRaw as Record<string, unknown>).cardio === 'string'
      ? ((surgeonsRaw as Record<string, string>).cardio as string)
      : seed.surgeons.cardio;
  const neuro =
    typeof (surgeonsRaw as Record<string, unknown>).neuro === 'string'
      ? ((surgeonsRaw as Record<string, string>).neuro as string)
      : seed.surgeons.neuro;
  return {
    state: normaliseHealthState(input.state),
    nats_subs: typeof input.nats_subs === 'number' ? input.nats_subs : seed.nats_subs,
    js_streams_ok:
      typeof input.js_streams_ok === 'boolean' ? input.js_streams_ok : seed.js_streams_ok,
    webhook_last_age_s:
      typeof input.webhook_last_age_s === 'number'
        ? input.webhook_last_age_s
        : seed.webhook_last_age_s,
    surgeons: { ...seed.surgeons, ...(surgeonsRaw as Record<string, string>), cardio, neuro },
  };
}

function normalisePushFreeze(
  input: Partial<PushFreezeState> | null | undefined,
): PushFreezeState {
  const seed = EMPTY_CLUSTER_STATUS.push_freeze;
  if (!input || typeof input !== 'object') return seed;
  const sourceRaw = input.source;
  const source: PushFreezeState['source'] =
    sourceRaw === 'env' || sourceRaw === 'file' || sourceRaw === 'daemon'
      ? sourceRaw
      : 'unknown';
  return {
    active: typeof input.active === 'boolean' ? input.active : seed.active,
    source,
  };
}

function normaliseCommits(input: Partial<CommitsAhead> | null | undefined): CommitsAhead {
  const seed = EMPTY_CLUSTER_STATUS.commits_ahead;
  if (!input || typeof input !== 'object') return seed;
  const sup = typeof input.super === 'number' ? input.super : seed.super;
  const mf = typeof input.mf === 'number' ? input.mf : seed.mf;
  const admin = typeof input.admin === 'number' ? input.admin : seed.admin;
  const explicitTotal = typeof input.total === 'number' ? input.total : null;
  const total =
    explicitTotal !== null
      ? explicitTotal
      : [sup, mf, admin].reduce<number>(
          (acc, v) => acc + (typeof v === 'number' ? v : 0),
          0,
        );
  return { super: sup, mf, admin, total };
}

function normaliseInvariants(
  input: Partial<InvariantsState> | null | undefined,
): InvariantsState {
  const seed = EMPTY_CLUSTER_STATUS.invariants;
  if (!input || typeof input !== 'object') return seed;
  return {
    passed: typeof input.passed === 'number' ? input.passed : seed.passed,
    total: typeof input.total === 'number' ? input.total : seed.total,
    last_run: typeof input.last_run === 'string' ? input.last_run : seed.last_run,
  };
}

function normaliseSource(s: unknown): ClusterStatusSource {
  if (
    s === 'snapshot' ||
    s === 'snapshot-degraded' ||
    s === 'no-snapshot' ||
    s === 'error'
  ) {
    return s;
  }
  return 'snapshot';
}

function normaliseSnapshot(data: RawSnapshot): ClusterStatus {
  return {
    schema_version: 'cluster_status/v1',
    generated_at: typeof data.generated_at === 'string' ? data.generated_at : null,
    active_phase: typeof data.active_phase === 'string' ? data.active_phase : null,
    cluster_health: normaliseHealth(data.cluster_health),
    push_freeze: normalisePushFreeze(data.push_freeze),
    commits_ahead: normaliseCommits(data.commits_ahead),
    invariants: normaliseInvariants(data.invariants),
    panels_live:
      typeof data.panels_live === 'number'
        ? data.panels_live
        : EMPTY_CLUSTER_STATUS.panels_live,
    source: normaliseSource(data.source),
    ...(typeof data.error === 'string' ? { error: data.error } : {}),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<ClusterStatus>> {
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      if (result.reason === 'missing') {
        CLUSTER_STATUS_FETCH_COUNTERS.missing += 1;
        return NextResponse.json(EMPTY_CLUSTER_STATUS, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (result.reason === 'parse') CLUSTER_STATUS_FETCH_COUNTERS.parse += 1;
      else if (result.reason === 'shape') CLUSTER_STATUS_FETCH_COUNTERS.shape += 1;
      else if (result.reason === 'io') CLUSTER_STATUS_FETCH_COUNTERS.io += 1;
      CLUSTER_STATUS_FETCH_COUNTERS.error += 1;
      return NextResponse.json(
        {
          ...EMPTY_CLUSTER_STATUS,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    CLUSTER_STATUS_FETCH_COUNTERS.ok += 1;
    const response = normaliseSnapshot(result.data);
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    CLUSTER_STATUS_FETCH_COUNTERS.error += 1;
    return NextResponse.json(
      {
        ...EMPTY_CLUSTER_STATUS,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
