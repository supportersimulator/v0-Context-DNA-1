/**
 * Race Status — wire shape stub for RaceTheater (X5 scaffold, 2026-05-07).
 *
 * GET /api/race/status
 *
 * SCAFFOLD — Y-batch (next wave) will replace this with a real producer that
 * reads from the fleet daemon. Today this returns an empty payload so the
 * panel can mount without crashing and so contract tests can exercise the
 * shape.
 *
 * Y-batch wiring plan (forward-compat, tracked here so we don't lose it):
 *   1. Subscribe to NATS subjects `event.race.*.<node>` via the existing
 *      EventBridge (lib/ide/event-bridge.ts) — same path SurgeonTheater +
 *      CampaignTheater already share. Maintain an in-process race table.
 *   2. Persist race transitions to the EvidenceLedger (V2 append route) so
 *      the chief-decision view can correlate winning diffs with receipts.
 *   3. Mirror the v6 producer pattern from
 *        `app/api/competition/status/route.ts`:
 *      - try `dashboard_exports/race_status.json` first (operator override),
 *      - fall back to fleet daemon HTTP `/api/v1/races` (when daemon ships
 *        that endpoint — see `docs/plans/2026-04-26-ide-gap-analysis-post-d78fc8e.md`
 *        item #2 "Race Theater panel"),
 *      - empty fallback identical to today's `EMPTY_RACE_STATUS`.
 *
 * ZSF: every catch path WILL append to the IDE log buffer + set
 * `source: 'error'`; today there is no fetch path so no counter is needed
 * yet. Y-batch adds it (mirror `LEDGER_FETCH_COUNTERS` in
 * `app/api/competition/status/route.ts`).
 */

import { NextResponse } from 'next/server';

import { EMPTY_RACE_STATUS, type RaceStatusResponse } from '@/lib/ide/race-types';

/**
 * X5 stub — always returns the empty shape. Documented + contract-tested
 * against `RaceStatusResponse` so that when Y-batch swaps the body for real
 * data the panel + types stay in lockstep.
 */
export async function GET(): Promise<NextResponse<RaceStatusResponse>> {
  // Forward-compat note: do NOT add fetch logic here in X5 — all wiring lands
  // in Y-batch under a single PR so reviewers see the producer + consumer +
  // types diff together.
  return NextResponse.json(EMPTY_RACE_STATUS, {
    headers: {
      // Same caching contract as competition/status: never cache, panel
      // polls. Y-batch may switch to SSE — when it does, drop this route in
      // favour of `/api/race/stream`.
      'Cache-Control': 'no-store',
    },
  });
}
