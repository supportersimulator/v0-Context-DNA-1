/**
 * Arbiter Verdict — record Aaron's verdict on an unresolved dispute.
 *
 * BB2 wave (2026-05-07) — replaces the AA3 stub with real wiring.
 *
 * POST /api/arbiter/verdict
 *
 * Body: ArbiterVerdictRequest = { case_id, verdict, reason?,
 *                                 case_evidence_record_id?, source?,
 *                                 source_id?, tribunal_evidence_record_id? }
 * Returns: ArbiterVerdictResponse = { recorded, evidence_record_id, error? }
 *
 * Wiring
 * ------
 * The route validates the request shape and forwards a JSON document to
 * `scripts/append-arbiter-verdict.py` over stdin. The CLI calls
 * `multifleet.ide_human_arbiter.IDEHumanArbiter.record_verdict(...)`,
 * which mints an EvidenceLedger record (`kind="audit"`,
 * `event_type="arbiter_verdict_recorded"`) and threads `parent_ids` to
 * the matching `arbiter_case_opened` record (and, when the source is a
 * tribunal, also to the tribunal's verdict record).
 *
 * The CLI prints `{ok: true, evidence_record_id, ...}` on success and
 * `{ok: false, error}` on validation/runtime failure. The route projects
 * that into the IDE's wire shape.
 *
 * Why subprocess (not embedded Python): keeps the Next.js side stdlib +
 * node:fs only — no Python embedding, no FFI, identical to how
 * dump-* scripts integrate. Forward-compat: the CLI shape can absorb new
 * fields without touching the route.
 *
 * ZSF: invalid request bumps `__arbiterVerdictCountersForTests().reject`;
 * subprocess spawn failures bump `.spawn`; subprocess non-zero exits bump
 * `.cli_fail`; happy paths bump `.recorded_ok`. Every error path is
 * counted; no silent failures.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

import {
  ARBITER_VERDICT_ORDER,
  type ArbiterVerdict,
  type ArbiterVerdictRequest,
  type ArbiterVerdictResponse,
} from '@/lib/ide/human-arbiter-types';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

function appendVerdictScript(): string {
  if (process.env.ARBITER_APPEND_VERDICT_SCRIPT) {
    return path.resolve(process.env.ARBITER_APPEND_VERDICT_SCRIPT);
  }
  return path.join(REPO_ROOT, 'scripts', 'append-arbiter-verdict.py');
}

function pythonBin(): string {
  return process.env.ARBITER_PYTHON_BIN || 'python3';
}

// ---------------------------------------------------------------------------
// ZSF counters
// ---------------------------------------------------------------------------

const ARBITER_VERDICT_COUNTERS: {
  recorded_ok: number;
  reject: number;
  parse: number;
  spawn: number;
  cli_fail: number;
  error: number;
} = {
  recorded_ok: 0,
  reject: 0,
  parse: 0,
  spawn: 0,
  cli_fail: 0,
  error: 0,
};

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

// ---------------------------------------------------------------------------
// Subprocess bridge
// ---------------------------------------------------------------------------

type CliResult = {
  ok: boolean;
  evidence_record_id?: string | null;
  verdict?: string;
  case_id?: string;
  decided_at?: string;
  parent_record_id?: string | null;
  error?: string;
};

async function runAppendVerdict(payload: object): Promise<{
  ok: true;
  result: CliResult;
} | { ok: false; reason: 'spawn' | 'cli_fail'; detail: string }> {
  const script = appendVerdictScript();
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(pythonBin(), [script], {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        ok: false,
        reason: 'spawn',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', (err: Error) => {
      resolve({ ok: false, reason: 'spawn', detail: err.message });
    });
    proc.on('close', (code: number | null) => {
      // Try to parse stdout regardless of exit code — the CLI emits a JSON
      // payload on every termination path so the IDE has a structured
      // failure message even when exit != 0.
      let parsed: CliResult | null = null;
      try {
        parsed = JSON.parse((stdout || '').trim() || '{}') as CliResult;
      } catch {
        parsed = null;
      }
      if (code === 0 && parsed && parsed.ok) {
        resolve({ ok: true, result: parsed });
        return;
      }
      const detail =
        (parsed && parsed.error) ||
        (stderr.trim() ? stderr.trim().slice(-300) : `exit_code=${code ?? 'null'}`);
      resolve({ ok: false, reason: 'cli_fail', detail });
    });
    try {
      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    } catch (err) {
      resolve({
        ok: false,
        reason: 'spawn',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

type ExtendedArbiterVerdictRequest = ArbiterVerdictRequest & {
  case_evidence_record_id?: string;
  source?: 'tribunal' | 'race' | 'evidence' | 'manual';
  source_id?: string;
  tribunal_evidence_record_id?: string;
};

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

  const candidate = body as Partial<ExtendedArbiterVerdictRequest>;
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

  const payload: Record<string, unknown> = {
    case_id,
    verdict,
    reason: typeof candidate.reason === 'string' ? candidate.reason : '',
  };
  if (typeof candidate.case_evidence_record_id === 'string') {
    payload.case_evidence_record_id = candidate.case_evidence_record_id;
  }
  if (typeof candidate.source === 'string') {
    payload.source = candidate.source;
  }
  if (typeof candidate.source_id === 'string') {
    payload.source_id = candidate.source_id;
  }
  if (typeof candidate.tribunal_evidence_record_id === 'string') {
    payload.tribunal_evidence_record_id =
      candidate.tribunal_evidence_record_id;
  }

  let cli;
  try {
    cli = await runAppendVerdict(payload);
  } catch (err) {
    ARBITER_VERDICT_COUNTERS.error += 1;
    return rejectionResponse(
      `internal: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  if (!cli.ok) {
    if (cli.reason === 'spawn') {
      ARBITER_VERDICT_COUNTERS.spawn += 1;
    } else {
      ARBITER_VERDICT_COUNTERS.cli_fail += 1;
    }
    return rejectionResponse(`${cli.reason}: ${cli.detail}`, 500);
  }

  ARBITER_VERDICT_COUNTERS.recorded_ok += 1;
  const response: ArbiterVerdictResponse = {
    recorded: true,
    evidence_record_id: cli.result.evidence_record_id ?? null,
  };
  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
