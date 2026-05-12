# Milestone Emit Hook — IDE → Hire-Panel

**Status:** Shipped 2026-05-12 (CCC5). Call-site insertion in `/workspace` is a 1-line follow-up Aaron flips when ready.

## What this is

A ZSF-compliant async function that lets the IDE append milestones to the active client's `/hire/<engagement_id>` page without Aaron running `scripts/dump-hire-engagement-snapshot.py` by hand.

```ts
import { emitMilestone } from '@/lib/hire/milestone-emit';

const result = await emitMilestone({
  engagementId: 'acme-corp-rev1',
  kind: 'task_completed',
  payload: { description: 'Shipped /api/foo handler', meta: { ref: 'abc1234' } },
});
// result === { ok: true, id: '<sha256-prefix>', deduped: false }
```

## Where to call it

Insert a single `await emitMilestone({...})` line after any of these completion signals:

- After a workspace task finishes successfully (DockView panel completes a job).
- After `gains-gate.sh` exits 0 — pass `kind: 'gains_gate_passed'`.
- After a commit is pushed from the workspace terminal — `kind: 'commit_pushed'`.
- After a 3-Surgeons cross-exam returns a green verdict — `kind: 'review_passed'`.
- After the engagement status transitions (scoping → coding → reviewing → shipping → complete).

Pick the engagement_id from the existing config surface (Aaron's open decision per BBB5 §7: workspace can auto-pick from `.fleet/active-engagement` or expose a per-session selector — both are 1-line reads).

## Guarantees

| Guarantee | Mechanism |
|---|---|
| **Never throws** | Every error path returns `{ok: false, error}`. Caller never needs try/catch. |
| **Idempotent** | `(engagement_id, kind, description, meta)` → SHA-256 prefix. Same payload returns existing milestone id with `deduped: true`. |
| **No client leak** | Underscore-prefixed fields (`_id`, `_kind`) are dropped by the GET route's allowlist (`enforceAllowlist` in `app/api/hire/[engagement_id]/route.ts`). Only `timestamp` and `description` reach the client. |
| **Atomic write** | `tmp.{pid}.{ts}` + `rename` — readers never see a partial file. |
| **Counter-visible failures** | All failure modes bump `__milestoneEmitCountersForTests()` so cardio sentinels can assert observability. |
| **Refuses orphan emits** | If no engagement snapshot exists, returns `{ok: false}` instead of inventing one — Python remains the canonical schema owner. |

## Failure modes

| Counter | Trigger |
|---|---|
| `emit_ok` | Successful append + write |
| `emit_deduped` | Same-payload duplicate, no-op write skipped |
| `reject_invalid_input` | Blank engagementId / kind / description, or missing snapshot |
| `io_read_failures` | Snapshot exists but cannot be read |
| `io_write_failures` | Atomic rename failed (e.g. read-only filesystem) |
| `parse_failures` | Snapshot exists but is not valid JSON |
| `shape_failures` | Snapshot is JSON but not an object |
| `error` | Bumped on every failure path (cardio-friendly aggregate) |

## Prerequisites

The engagement snapshot must already exist:

```bash
python3 scripts/dump-hire-engagement-snapshot.py \
    --engagement-id acme-corp-rev1 \
    --client-name "Acme Corp" \
    --scope "..." \
    --rate-usd 200 \
    --hours 40
```

This stays Aaron-driven (it's the moment of engagement creation, not a per-task event).

## Tests

`milestone-emit.test.ts` covers: successful emit, IO write failure, idempotent dedup, invalid engagement_id rejection, and missing-snapshot rejection. Run via:

```bash
# Type-check (always available):
cd admin.contextdna.io && pnpm tsc --noEmit

# Runtime (once tsx/vitest is wired in):
pnpx tsx --test lib/hire/milestone-emit.test.ts
```
