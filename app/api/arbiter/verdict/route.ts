/**
 * Arbiter Verdict — record Aaron's verdict on an unresolved dispute
 * (AA3 scaffold, 2026-05-07).
 *
 * POST /api/arbiter/verdict
 *
 * Body: ArbiterVerdictRequest = { case_id, verdict, reason? }
 * Returns: ArbiterVerdictResponse = { recorded, evidence_record_id, note }
 *
 * SCAFFOLD-ONLY (AA3): the route validates the request shape and returns
 * `{recorded: true, evidence_record_id: null, note: "wiring next wave"}`.
 * The next wave will:
 *   1. Forward the verdict to the Python `arbiter.decide(...)` module.
 *   2. Mint an EvidenceLedger record for the verdict.
 *   3. Notify the PermissionGovernor so dependent permissions are
 *      re-evaluated against Aaron's call.
 *   4. Publish `arbiter:verdict-recorded` on the IDE event bus.
 *
 * Until the write side ships, the response carries the implementation
 * note so callers know the panel is in scaffold mode. The IDE renders the
 * verdict optimistically (next wave) once the recording path is live.
 *
 * ZSF: invalid requests bump `__arbiterVerdictCountersForTests().reject`;
 * stub successes bump `.stub_ok`. No silent failures.
 */

import { NextResponse } from 'next/server';

import {
  ARBITER_VERDICT_ORDER,
  type ArbiterVerdict,
  type ArbiterVerdictRequest,
  type ArbiterVerdictResponse,
} from '@/lib/ide/human-arbiter-types';

// ZSF: monotonic, process-local. Mirrors other arbiter/permission counters.
const ARBITER_VERDICT_COUNTERS: {
  stub_ok: number;
  reject: number;
  parse: number;
  error: number;
} = { stub_ok: 0, reject: 0, parse: 0, error: 0 };

/** Test-only accessor. */
export function __arbiterVerdictCountersForTests(): typeof ARBITER_VERDICT_COUNTERS {
  return { ...ARBITER_VERDICT_COUNTERS };
}

const VALID_VERDICT_SET = new Set<string>(ARBITER_VERDICT_ORDER);

function isArbiterVerdict(v: unknown): v is ArbiterVerdict {
  return typeof v === 'string' && VALID_VERDICT_SET.has(v);
}

function rejectionResponse(
  error: string,
  status: number,
): NextResponse<ArbiterVerdictResponse> {
  return NextResponse.json(
    {
      recorded: false,
      evidence_record_id: null,
      error,
    },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(
  request: Request,
): Promise<NextResponse<ArbiterVerdictResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    ARBITER_VERDICT_COUNTERS.parse += 1;
    return rejectionResponse(
      `parse: ${err instanceof Error ? err.message : String(err)}`,
      400,
    );
  }

  if (!body || typeof body !== 'object') {
    ARBITER_VERDICT_COUNTERS.reject += 1;
    return rejectionResponse('shape: body must be an object', 400);
  }

  const candidate = body as Partial<ArbiterVerdictRequest>;
  const case_id = candidate.case_id;
  const verdict = candidate.verdict;

  if (typeof case_id !== 'string' || case_id.length === 0) {
    ARBITER_VERDICT_COUNTERS.reject += 1;
    return rejectionResponse('shape: case_id must be a non-empty string', 400);
  }
  if (!isArbiterVerdict(verdict)) {
    ARBITER_VERDICT_COUNTERS.reject += 1;
    return rejectionResponse(
      `shape: verdict must be one of ${ARBITER_VERDICT_ORDER.join(', ')}`,
      400,
    );
  }

  // SCAFFOLD: do not actually record yet. Real fleet wiring lands next wave.
  ARBITER_VERDICT_COUNTERS.stub_ok += 1;
  const response: ArbiterVerdictResponse = {
    recorded: true,
    evidence_record_id: null,
    note: 'wiring next wave',
  };
  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
