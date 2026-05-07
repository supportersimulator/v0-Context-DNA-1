/**
 * Hire Panel — wire shape for the client-facing engagement page
 * (EE1 Phase-12 scaffold, 2026-05-07).
 *
 * GET /api/hire/[engagement_id]
 *
 * Reads a redacted engagement snapshot from
 * `dashboard_exports/hire_engagement_<safe_id>_snapshot.json`
 * (overridable via `HIRE_ENGAGEMENT_SNAPSHOT_JSON` env var). The snapshot
 * is produced by `scripts/dump-hire-engagement-snapshot.py`, which calls
 * `multifleet.hire_panel.HirePanel.redact_for_client(...)` BEFORE writing.
 * That means redaction lives in exactly one place (Python) and this route
 * is a thin reader — no risk of the boundary drifting between languages.
 *
 * If the snapshot is missing: return `EMPTY_HIRE_RESPONSE` with
 * `source: 'empty'` (graceful degradation — the page renders a CTA).
 *
 * ZSF: every fetch path bumps a counter exposed via
 * `__hireFetchCountersForTests` so cardio sentinels can assert counters
 * move. The browser-side window counter (`_hire_panel_fetch_errors`) is
 * incremented client-side in the page component on fetch failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EMPTY_HIRE_RESPONSE,
  type HireEngagement,
  type HireEngagementResponse,
  type HireStatus,
} from '@/lib/ide/hire-panel-types';

// ---------------------------------------------------------------------------
// Path resolution (mirrors race/status, tribunal/cases, permission/snapshot)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DEFAULT_SNAPSHOT_DIR = path.join(REPO_ROOT, 'dashboard_exports');

function safeId(raw: string): string {
  // Match the Python helper's safety filter: alphanumeric + dash/underscore,
  // capped at 40 chars. Anything else is dropped so a hostile id can't
  // escape the snapshot directory.
  const cleaned = Array.from(raw)
    .filter(c => /[A-Za-z0-9\-_]/.test(c))
    .join('')
    .slice(0, 40);
  return cleaned || 'engagement';
}

function snapshotPath(engagementId: string): string {
  if (process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON) {
    return path.resolve(process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON);
  }
  return path.join(
    DEFAULT_SNAPSHOT_DIR,
    `hire_engagement_${safeId(engagementId)}_snapshot.json`,
  );
}

// ZSF: monotonic, process-local. Mirrors the tribunal/race counter shape.
const HIRE_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  parse: number;
  shape: number;
  io: number;
  error: number;
} = { ok: 0, missing: 0, parse: 0, shape: 0, io: 0, error: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __hireFetchCountersForTests(): typeof HIRE_FETCH_COUNTERS {
  return { ...HIRE_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Snapshot reader
// ---------------------------------------------------------------------------

type SnapshotShape = {
  schema_version?: string;
  generated_at?: string;
  engagement?: HireEngagement | null;
  counters?: Record<string, number>;
};

async function loadSnapshot(
  p: string,
): Promise<
  | { ok: true; data: SnapshotShape }
  | {
      ok: false;
      reason: 'missing' | 'parse' | 'shape' | 'io';
      detail?: string;
    }
> {
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
  return { ok: true, data: parsed as SnapshotShape };
}

// ---------------------------------------------------------------------------
// Defence-in-depth: even though the Python redactor strips internal fields,
// the route enforces the allowlist a SECOND time so the boundary cannot
// silently drift if the snapshot is hand-edited. Forbidden keys are dropped
// and `_hire_panel_redaction_route_drops_total` (counter) is bumped.
// ---------------------------------------------------------------------------

const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'engagement_id',
  'client_name',
  'started_at',
  'current_task',
  'deliverables',
  'atlas_actor',
  'status',
  'milestones',
  'last_updated_at',
]);

const VALID_STATUSES: ReadonlySet<HireStatus> = new Set<HireStatus>([
  'scoping',
  'coding',
  'reviewing',
  'shipping',
  'complete',
]);

const ROUTE_REDACTION_DROPS = { count: 0 };

function enforceAllowlist(
  engagement: HireEngagement | null | undefined,
): HireEngagement | null {
  if (!engagement || typeof engagement !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(engagement)) {
    if (ALLOWED_KEYS.has(k)) {
      out[k] = (engagement as Record<string, unknown>)[k];
    } else {
      ROUTE_REDACTION_DROPS.count += 1;
    }
  }
  // Coerce status to a known value; default to 'scoping' if invalid.
  const status = out.status as HireStatus | undefined;
  if (!status || !VALID_STATUSES.has(status)) {
    out.status = 'scoping' satisfies HireStatus;
  }
  // Strip any unexpected milestone keys.
  const ms = out.milestones;
  if (Array.isArray(ms)) {
    out.milestones = ms.map(m => ({
      timestamp: typeof (m as { timestamp?: unknown })?.timestamp === 'string'
        ? (m as { timestamp: string }).timestamp
        : '',
      description: typeof (m as { description?: unknown })?.description === 'string'
        ? (m as { description: string }).description
        : '',
    }));
  } else {
    out.milestones = [];
  }
  // Required-string fields default to empty rather than undefined so the
  // page never crashes on a malformed snapshot.
  for (const f of [
    'engagement_id',
    'client_name',
    'current_task',
    'atlas_actor',
    'started_at',
  ]) {
    if (typeof out[f] !== 'string') out[f] = '';
  }
  if (!Array.isArray(out.deliverables)) out.deliverables = [];
  if (typeof out.last_updated_at !== 'string' && out.last_updated_at !== null) {
    out.last_updated_at = null;
  }
  return out as unknown as HireEngagement;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

type RouteParams = { params: Promise<{ engagement_id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse<HireEngagementResponse>> {
  const { engagement_id: engagementId } = await params;
  if (!engagementId || typeof engagementId !== 'string') {
    HIRE_FETCH_COUNTERS.error += 1;
    return NextResponse.json(
      { ...EMPTY_HIRE_RESPONSE, source: 'error', error: 'engagement_id missing' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await loadSnapshot(snapshotPath(engagementId));
    if (!result.ok) {
      if (result.reason === 'missing') {
        HIRE_FETCH_COUNTERS.missing += 1;
        return NextResponse.json(EMPTY_HIRE_RESPONSE, {
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (result.reason === 'parse') HIRE_FETCH_COUNTERS.parse += 1;
      else if (result.reason === 'shape') HIRE_FETCH_COUNTERS.shape += 1;
      else if (result.reason === 'io') HIRE_FETCH_COUNTERS.io += 1;
      HIRE_FETCH_COUNTERS.error += 1;
      return NextResponse.json(
        {
          ...EMPTY_HIRE_RESPONSE,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const data = result.data;
    const engagement = enforceAllowlist(data.engagement ?? null);
    HIRE_FETCH_COUNTERS.ok += 1;

    const response: HireEngagementResponse = {
      engagement,
      source: engagement ? 'fleet' : 'empty',
      generated_at: data.generated_at,
    };
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    HIRE_FETCH_COUNTERS.error += 1;
    return NextResponse.json(
      {
        ...EMPTY_HIRE_RESPONSE,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
