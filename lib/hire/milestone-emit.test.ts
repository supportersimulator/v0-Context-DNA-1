// =============================================================================
// milestone-emit.test.ts — CCC5, 2026-05-12
//
// Uses Node's built-in `node:test` runner. No external test framework
// dependency. Run via:
//
//     # When tsx is available:
//     pnpx tsx --test lib/hire/milestone-emit.test.ts
//
//     # Once vitest lands in the project (follow-up):
//     pnpm vitest run lib/hire/milestone-emit.test.ts
//
// The file type-checks under the project's existing `pnpm tsc --noEmit`,
// which is the immediate verification gate this dispatch ships against.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  emitMilestone,
  __milestoneEmitCountersForTests,
  __resetMilestoneEmitCountersForTests,
} from './milestone-emit';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

type Counters = ReturnType<typeof __milestoneEmitCountersForTests>;

const SCHEMA_VERSION = 'hire_engagement_snapshot/v1';

function fixtureSnapshot(engagementId: string) {
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: '2026-05-12T00:00:00Z',
    engagement: {
      engagement_id: engagementId,
      client_name: 'Acme Corp',
      started_at: '2026-05-10T00:00:00Z',
      current_task: 'Initial scoping',
      deliverables: ['Spec', 'Implementation'],
      atlas_actor: 'Atlas',
      status: 'coding',
      recent_evidence_record_ids: [],
      milestones: [],
      last_updated_at: '2026-05-12T00:00:00Z',
    },
    counters: {},
  };
}

async function withFixture(
  engagementId: string,
  body: (snapshotPath: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'milestone-emit-'));
  const snapshotPath = path.join(dir, `hire_engagement_${engagementId}_snapshot.json`);
  await writeFile(snapshotPath, JSON.stringify(fixtureSnapshot(engagementId)), 'utf8');
  const prev = process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON;
  process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON = snapshotPath;
  __resetMilestoneEmitCountersForTests();
  try {
    await body(snapshotPath);
  } finally {
    if (prev === undefined) delete process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON;
    else process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON = prev;
    await rm(dir, { recursive: true, force: true });
  }
}

function delta(before: Counters, after: Counters): Partial<Counters> {
  const out: Partial<Counters> = {};
  for (const k of Object.keys(after) as Array<keyof Counters>) {
    const d = after[k] - before[k];
    if (d !== 0) out[k] = d;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Successful emit
// ---------------------------------------------------------------------------

test('emitMilestone: appends milestone and bumps emit_ok counter', async () => {
  await withFixture('acme-rev1', async (snapshotPath) => {
    const before = __milestoneEmitCountersForTests();

    const result = await emitMilestone({
      engagementId: 'acme-rev1',
      kind: 'task_completed',
      payload: {
        description: 'Shipped /api/foo handler',
        meta: { ref: 'abc1234' },
      },
    });

    assert.equal(result.ok, true, 'emit should succeed');
    if (result.ok) {
      assert.equal(result.deduped, false);
      assert.equal(typeof result.id, 'string');
      assert.ok(result.id.length >= 8, 'id should be a non-trivial hash');
    }

    const after = __milestoneEmitCountersForTests();
    assert.deepEqual(delta(before, after), { emit_ok: 1 });

    const raw = JSON.parse(await readFile(snapshotPath, 'utf8'));
    assert.equal(raw.engagement.milestones.length, 1);
    assert.equal(
      raw.engagement.milestones[0].description,
      'Shipped /api/foo handler',
    );
    assert.equal(raw.engagement.milestones[0]._kind, 'task_completed');
    assert.equal(typeof raw.engagement.milestones[0].timestamp, 'string');
  });
});

// ---------------------------------------------------------------------------
// 2. IO write failure → ok=false + io_write_failures + error counters bump
// ---------------------------------------------------------------------------

test('emitMilestone: write failure returns ok=false and bumps io_write_failures', async () => {
  await withFixture('acme-rev2', async (snapshotPath) => {
    // Make the snapshot directory read-only so the atomic rename fails.
    const dir = path.dirname(snapshotPath);
    await chmod(dir, 0o500);

    const before = __milestoneEmitCountersForTests();

    const result = await emitMilestone({
      engagementId: 'acme-rev2',
      kind: 'task_completed',
      payload: { description: 'Should fail to persist' },
    });

    // Restore perms before assertions so cleanup can run.
    await chmod(dir, 0o700);

    assert.equal(result.ok, false, 'emit should fail when directory is read-only');
    if (!result.ok) {
      assert.match(result.error, /snapshot write failed/);
    }

    const after = __milestoneEmitCountersForTests();
    const d = delta(before, after);
    assert.equal(d.io_write_failures, 1, 'io_write_failures should bump by 1');
    assert.equal(d.error, 1, 'error counter should bump by 1');
    assert.equal(d.emit_ok ?? 0, 0, 'emit_ok should not bump on failure');
  });
});

// ---------------------------------------------------------------------------
// 3. Idempotent same-payload returns existing milestone (deduped:true)
// ---------------------------------------------------------------------------

test('emitMilestone: same kind+description+meta dedups via stable hash', async () => {
  await withFixture('acme-rev3', async (snapshotPath) => {
    const input = {
      engagementId: 'acme-rev3',
      kind: 'gains_gate_passed' as const,
      payload: {
        description: 'Phase X gains-gate PASSED',
        meta: { phase: 'X', checks: 17 },
      },
    };

    const first = await emitMilestone(input);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.deduped, false);

    const before = __milestoneEmitCountersForTests();

    const second = await emitMilestone({
      ...input,
      // Different object identity, same canonical payload.
      payload: { ...input.payload, meta: { checks: 17, phase: 'X' } },
    });

    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.deduped, true);
      assert.equal(second.id, first.id, 'dedup must return same id');
    }

    const after = __milestoneEmitCountersForTests();
    assert.deepEqual(delta(before, after), { emit_deduped: 1 });

    const raw = JSON.parse(await readFile(snapshotPath, 'utf8'));
    assert.equal(
      raw.engagement.milestones.length,
      1,
      'snapshot should still hold exactly one milestone after dedup',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Invalid engagementId → ok=false + reject_invalid_input + error bump
// ---------------------------------------------------------------------------

test('emitMilestone: blank engagementId is rejected as invalid input', async () => {
  __resetMilestoneEmitCountersForTests();
  const before = __milestoneEmitCountersForTests();

  const result = await emitMilestone({
    engagementId: '   !!!@@@   ', // safeId() strips → empty
    kind: 'task_completed',
    payload: { description: 'Should never be persisted' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /invalid engagementId/);
  }

  const after = __milestoneEmitCountersForTests();
  const d = delta(before, after);
  assert.equal(d.reject_invalid_input, 1);
  assert.equal(d.error, 1);
});

// ---------------------------------------------------------------------------
// 5. Missing snapshot is refused (Python is canonical schema owner)
// ---------------------------------------------------------------------------

test('emitMilestone: missing snapshot refuses emit with clear error', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'milestone-emit-missing-'));
  const phantom = path.join(dir, 'does-not-exist.json');
  const prev = process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON;
  process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON = phantom;
  __resetMilestoneEmitCountersForTests();

  try {
    const result = await emitMilestone({
      engagementId: 'phantom-rev1',
      kind: 'task_completed',
      payload: { description: 'No engagement to attach to' },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /no engagement snapshot/);
    }
    const after = __milestoneEmitCountersForTests();
    assert.equal(after.reject_invalid_input, 1);
    assert.equal(after.error, 1);
  } finally {
    if (prev === undefined) delete process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON;
    else process.env.HIRE_ENGAGEMENT_SNAPSHOT_JSON = prev;
    await rm(dir, { recursive: true, force: true });
  }
});
