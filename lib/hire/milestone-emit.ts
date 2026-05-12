// =============================================================================
// Hire Panel — milestone emit hook (CCC5, 2026-05-12)
//
// Bridges the IDE (`/workspace`) to the Hire-Panel's engagement snapshot.
// Aaron used to run `scripts/dump-hire-engagement-snapshot.py` by hand whenever
// he wanted a milestone surfaced to the client at `/hire/<engagement_id>`.
// This hook lets the workspace route emit milestones inline:
//
//     await emitMilestone({
//       engagementId: 'acme-corp-rev1',
//       kind: 'task_completed',
//       payload: { description: 'Shipped /api/foo handler', ... },
//     })
//
// Storage strategy
// ----------------
// The Hire-Panel reader at `app/api/hire/[engagement_id]/route.ts` consumes a
// JSON snapshot at `dashboard_exports/hire_engagement_<safe_id>_snapshot.json`.
// We append a milestone to that same file's `engagement.milestones` array,
// preserving the schema (`schema_version: hire_engagement_snapshot/v1`) and
// the EE1 allowlist. This avoids introducing a second store and keeps Python
// as the canonical schema owner — the hook just appends rows.
//
// Idempotency
// -----------
// (engagement_id, kind, payload_hash) collapses. A duplicate emit returns the
// existing milestone id rather than creating a second row. The hash uses
// SHA-256 of the canonicalized payload + kind.
//
// ZSF
// ---
// Every failure path (missing snapshot, malformed snapshot, IO error, invalid
// engagement_id) increments a counter and returns `{ok: false}` — NEVER
// throws. Mirrors `__hireFetchCountersForTests` from the GET route.
//
// The actual workspace call-site insertion is a one-line follow-up (see
// `MILESTONE_EMIT.md` in this directory).
// =============================================================================

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

import type { HireMilestone } from '@/lib/ide/hire-panel-types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Kind of milestone — additive string union, keep in sync with what the
 * client-facing copy in `HirePanel.tsx` expects. We do NOT validate the
 * value against a closed set so callers can introduce new kinds without a
 * type bump; the description is what the client actually sees.
 */
export type MilestoneKind =
  | 'task_completed'
  | 'gains_gate_passed'
  | 'commit_pushed'
  | 'review_passed'
  | 'engagement_status_changed'
  | (string & {});

/** Caller-facing payload — the `description` field is what reaches clients. */
export type MilestoneEmitInput = {
  engagementId: string;
  kind: MilestoneKind;
  payload: {
    description: string;
    /** Optional ISO-8601 timestamp; defaults to `new Date().toISOString()`. */
    timestamp?: string;
    /** Free-form structured detail. Stripped before client read by the GET route. */
    meta?: Record<string, unknown>;
  };
};

export type MilestoneEmitResult =
  | { ok: true; id: string; deduped: boolean }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Counter table — process-local, monotonic. Test-only accessor below.
// ---------------------------------------------------------------------------

const MILESTONE_EMIT_COUNTERS = {
  emit_ok: 0,
  emit_deduped: 0,
  reject_invalid_input: 0,
  io_read_failures: 0,
  io_write_failures: 0,
  parse_failures: 0,
  shape_failures: 0,
  error: 0,
};

/** Test-only accessor — exposes a snapshot of the counter table. */
export function __milestoneEmitCountersForTests(): typeof MILESTONE_EMIT_COUNTERS {
  return { ...MILESTONE_EMIT_COUNTERS };
}

/** Test-only reset — lets tests start from a clean counter table. */
export function __resetMilestoneEmitCountersForTests(): void {
  for (const k of Object.keys(MILESTONE_EMIT_COUNTERS) as Array<
    keyof typeof MILESTONE_EMIT_COUNTERS
  >) {
    MILESTONE_EMIT_COUNTERS[k] = 0;
  }
}

// ---------------------------------------------------------------------------
// Path resolution (mirrors app/api/hire/[engagement_id]/route.ts exactly).
// ---------------------------------------------------------------------------

function repoRoot(): string {
  return process.env.SUPERREPO_ROOT
    ? path.resolve(process.env.SUPERREPO_ROOT)
    : path.resolve(process.cwd(), '..');
}

function safeId(raw: string): string {
  const cleaned = Array.from(raw)
    .filter(c => /[A-Za-z0-9\-_]/.test(c))
    .join('')
    .slice(0, 40);
  return cleaned;
}

function snapshotPath(engagementId: string): string {
  if (process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON) {
    return path.resolve(process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON);
  }
  const id = safeId(engagementId);
  return path.join(
    repoRoot(),
    'dashboard_exports',
    `hire_engagement_${id || 'engagement'}_snapshot.json`,
  );
}

// ---------------------------------------------------------------------------
// Hash helper — used as the milestone id AND for dedup.
// ---------------------------------------------------------------------------

function payloadHash(kind: string, description: string, meta: unknown): string {
  // Canonicalize: kind + description + JSON-stringify of meta keys sorted.
  // Sorting keeps the hash stable across object construction order.
  const canon = JSON.stringify({ kind, description, meta: meta ?? null }, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
  return createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Snapshot read/write — file-locked-ish via tmp+rename.
// ---------------------------------------------------------------------------

type SnapshotShape = {
  schema_version?: string;
  generated_at?: string;
  engagement?: {
    engagement_id?: string;
    milestones?: Array<HireMilestone & { _id?: string; _kind?: string }>;
    last_updated_at?: string | null;
    [k: string]: unknown;
  } | null;
  counters?: Record<string, number>;
};

async function readSnapshot(p: string): Promise<SnapshotShape | null> {
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      // Missing snapshot — treat as empty (the engagement hasn't been scoped
      // yet via the Python CLI). We REFUSE to emit in that case because the
      // route's redactor depends on Python-side allowlist construction.
      return null;
    }
    MILESTONE_EMIT_COUNTERS.io_read_failures += 1;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      MILESTONE_EMIT_COUNTERS.shape_failures += 1;
      return null;
    }
    return parsed as SnapshotShape;
  } catch {
    MILESTONE_EMIT_COUNTERS.parse_failures += 1;
    return null;
  }
}

async function writeSnapshotAtomic(p: string, data: SnapshotShape): Promise<void> {
  await mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, p);
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

export async function emitMilestone(
  input: MilestoneEmitInput,
): Promise<MilestoneEmitResult> {
  // Input validation — refuse blank engagement_id or empty description.
  if (
    !input ||
    typeof input.engagementId !== 'string' ||
    safeId(input.engagementId).length === 0
  ) {
    MILESTONE_EMIT_COUNTERS.reject_invalid_input += 1;
    MILESTONE_EMIT_COUNTERS.error += 1;
    return { ok: false, error: 'invalid engagementId' };
  }
  if (
    !input.kind ||
    typeof input.kind !== 'string' ||
    input.kind.trim().length === 0
  ) {
    MILESTONE_EMIT_COUNTERS.reject_invalid_input += 1;
    MILESTONE_EMIT_COUNTERS.error += 1;
    return { ok: false, error: 'invalid kind' };
  }
  const description =
    typeof input.payload?.description === 'string'
      ? input.payload.description.trim()
      : '';
  if (description.length === 0) {
    MILESTONE_EMIT_COUNTERS.reject_invalid_input += 1;
    MILESTONE_EMIT_COUNTERS.error += 1;
    return { ok: false, error: 'invalid payload.description' };
  }

  const ts =
    typeof input.payload.timestamp === 'string' && input.payload.timestamp.length > 0
      ? input.payload.timestamp
      : new Date().toISOString();
  const id = payloadHash(input.kind, description, input.payload.meta);
  const p = snapshotPath(input.engagementId);

  let snapshot: SnapshotShape | null;
  try {
    snapshot = await readSnapshot(p);
  } catch (err) {
    MILESTONE_EMIT_COUNTERS.error += 1;
    return {
      ok: false,
      error: `snapshot read failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  if (!snapshot || !snapshot.engagement) {
    // The engagement record must exist — Python is the only path that
    // constructs it (so the redactor allowlist runs). We refuse to invent
    // one inside Node to avoid the boundary drift the GET route docstring
    // warns about.
    MILESTONE_EMIT_COUNTERS.reject_invalid_input += 1;
    MILESTONE_EMIT_COUNTERS.error += 1;
    return {
      ok: false,
      error: 'no engagement snapshot — run dump-hire-engagement-snapshot.py first',
    };
  }

  const milestones = Array.isArray(snapshot.engagement.milestones)
    ? snapshot.engagement.milestones.slice()
    : [];

  // Idempotency check — same id → return existing.
  const existing = milestones.find(
    (m): m is HireMilestone & { _id?: string } =>
      typeof (m as { _id?: unknown })?._id === 'string' &&
      (m as { _id: string })._id === id,
  );
  if (existing) {
    MILESTONE_EMIT_COUNTERS.emit_deduped += 1;
    return { ok: true, id, deduped: true };
  }

  // Append. We tag with `_id` and `_kind` for dedup/traceability. The GET
  // route's `enforceAllowlist` only carries `timestamp` and `description`
  // out to the client — the underscore fields are dropped by the allowlist
  // mapping (see `out.milestones = ms.map(...)` in the route). So we can
  // safely persist them without leaking to the client.
  const next: HireMilestone & { _id: string; _kind: string } = {
    timestamp: ts,
    description,
    _id: id,
    _kind: input.kind,
  };
  milestones.push(next);

  const updated: SnapshotShape = {
    ...snapshot,
    generated_at: new Date().toISOString(),
    engagement: {
      ...snapshot.engagement,
      milestones,
      last_updated_at: ts,
    },
  };

  try {
    await writeSnapshotAtomic(p, updated);
  } catch (err) {
    MILESTONE_EMIT_COUNTERS.io_write_failures += 1;
    MILESTONE_EMIT_COUNTERS.error += 1;
    return {
      ok: false,
      error: `snapshot write failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  MILESTONE_EMIT_COUNTERS.emit_ok += 1;
  return { ok: true, id, deduped: false };
}
