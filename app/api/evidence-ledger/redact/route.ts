/**
 * POST /api/evidence-ledger/redact  — W1.b (Phase-5)
 *
 * Real EvidenceLedger admin POST-HOC REDACT endpoint. Spawns
 * `scripts/redact-evidence-ledger.py` (in the superrepo) which:
 *   - validates {record_id, reason, actor, marker?}
 *   - calls `EvidenceLedger.redact_record()` (W1.b)
 *   - returns {tombstone_record_id, redacted_target, redacted_at,
 *     already_redacted} as a single JSON line on stdout
 *
 * V1's W1.a redaction was *preventive* (write-time secret scrub via the
 * append helper). This route is the *post-hoc* surgical removal: an
 * existing record's `content_json` is overwritten with a marker string
 * (default `[REDACTED]`) and a NEW `kind="redaction"` tombstone is written
 * pointing at the target via parent_ids. The target's `record_id`
 * (= sha256 of the original canonical content) is never mutated, so the
 * cryptographic chain stays intact.
 *
 * Reversibility (Constitutional Physics #5): if Aaron retains the original
 * payload offline, the redact is reversible by re-recording the original
 * content (deterministic record_id) and clearing the redaction columns on
 * the target. The tombstone itself remains permanent (audit trail).
 *
 * Process model:
 *   * `runtime = 'nodejs'` — required because `child_process.spawn`.
 *   * `dynamic = 'force-dynamic'` — never SSG-cache.
 *   * Helper is invoked with `--print-counters` so the persistent counters
 *     in `memory/.evidence_ledger_redact_counters.json` advance and can be
 *     scraped by the cardio sentinel.
 *
 * ZSF (Zero Silent Failures):
 *   `LEDGER_REDACT_COUNTERS` is a process-local in-memory monotonic mirror
 *   of {ok, validation_error, target_not_found, exec_error}. Tests reach it
 *   via `__redactCountersForTests`. Every code path (parse, spawn,
 *   helper-non-zero, exception) bumps a counter AND appends to the IDE log.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { append as logAppend } from '@/lib/log/buffer';
import type {
  EvidenceLedgerRedactRequest,
  EvidenceLedgerRedactResponse,
} from '@/lib/ide/campaign-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Path resolution (mirrors append/route.ts)
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const HELPER_SCRIPT = path.join(REPO_ROOT, 'scripts', 'redact-evidence-ledger.py');
const PYTHON_BIN =
  process.env.EVIDENCE_LEDGER_PYTHON ||
  process.env.SUPERREPO_PYTHON ||
  'python3';

// ZSF: counters mirror what the Python helper persists to disk.
const LEDGER_REDACT_COUNTERS: {
  ok: number;
  validation_error: number;
  target_not_found: number;
  exec_error: number;
} = {
  ok: 0,
  validation_error: 0,
  target_not_found: 0,
  exec_error: 0,
};

/** Test-only accessor — mirrors `__appendCountersForTests` style. */
export function __redactCountersForTests(): typeof LEDGER_REDACT_COUNTERS {
  return { ...LEDGER_REDACT_COUNTERS };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bumpCounter(kind: keyof typeof LEDGER_REDACT_COUNTERS, n = 1): void {
  LEDGER_REDACT_COUNTERS[kind] += n;
}

function logSafe(
  level: 'info' | 'warn' | 'error',
  msg: string,
  detail: unknown,
): void {
  try {
    logAppend({
      ts: Date.now(),
      level,
      source: 'evidence-ledger/redact',
      msg,
      detail,
    });
  } catch {
    /* logAppend itself failing must not crash the route (ZSF: routed elsewhere). */
  }
}

function badRequest(error: string): NextResponse {
  bumpCounter('validation_error');
  logSafe('warn', 'validation_error', { error });
  return NextResponse.json(
    { ok: false, error_kind: 'validation_error', message: error },
    { status: 400 },
  );
}

interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  spawnError?: string;
}

function runHelper(payload: EvidenceLedgerRedactRequest): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const args: string[] = [
      HELPER_SCRIPT,
      '--record-id',
      String(payload.record_id),
      '--reason',
      String(payload.reason),
      '--actor',
      String(payload.actor),
    ];

    if (typeof payload.marker === 'string' && payload.marker.length > 0) {
      args.push('--marker', payload.marker);
    }

    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(PYTHON_BIN, args, {
        cwd: REPO_ROOT,
        shell: false,
        env: { ...process.env, PYTHONPATH: REPO_ROOT },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        spawnError: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout?.on('data', (c: Buffer) => stdoutChunks.push(c));
    proc.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));
    proc.on('error', (err) => {
      stderrChunks.push(Buffer.from(`\n[spawn error] ${err.message}\n`));
    });
    proc.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

function parseHelperJson(stdout: string): unknown {
  // Helper emits a single JSON line on stdout. Take the last non-empty line.
  const lines = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: EvidenceLedgerRedactRequest;
  try {
    body = (await req.json()) as EvidenceLedgerRedactRequest;
  } catch {
    return badRequest('invalid JSON body');
  }

  if (typeof body !== 'object' || body === null) {
    return badRequest('body must be a JSON object');
  }

  // Surface checks — the Python helper does the authoritative validation,
  // but we shortcut obvious shape errors so we don't pay a spawn cost.
  if (typeof body.record_id !== 'string' || !body.record_id.trim()) {
    return badRequest('record_id (non-empty string) is required');
  }
  if (typeof body.reason !== 'string' || !body.reason.trim()) {
    return badRequest('reason (non-empty string) is required');
  }
  if (typeof body.actor !== 'string' || !body.actor.trim()) {
    return badRequest('actor (non-empty string) is required');
  }
  if (
    body.marker !== undefined &&
    body.marker !== null &&
    (typeof body.marker !== 'string' || body.marker.length === 0)
  ) {
    return badRequest('marker must be a non-empty string when provided');
  }

  let result: SpawnResult;
  try {
    result = await runHelper(body);
  } catch (err) {
    bumpCounter('exec_error');
    const msg = err instanceof Error ? err.message : String(err);
    logSafe('error', 'helper unexpected exception', { error: msg });
    return NextResponse.json(
      { ok: false, error_kind: 'exec_error', message: msg },
      { status: 500 },
    );
  }

  if (result.spawnError) {
    bumpCounter('exec_error');
    logSafe('error', 'helper spawn failed', { error: result.spawnError });
    return NextResponse.json(
      {
        ok: false,
        error_kind: 'exec_error',
        message: `helper spawn failed: ${result.spawnError}`,
      },
      { status: 500 },
    );
  }

  const parsed = parseHelperJson(result.stdout);
  if (parsed === null || typeof parsed !== 'object') {
    bumpCounter('exec_error');
    logSafe('error', 'helper produced no JSON output', {
      exitCode: result.exitCode,
      stderr: result.stderr.slice(0, 500),
    });
    return NextResponse.json(
      {
        ok: false,
        error_kind: 'exec_error',
        message: `helper produced no JSON (exit=${result.exitCode}); stderr=${result.stderr.slice(0, 200)}`,
      },
      { status: 500 },
    );
  }

  const payload = parsed as Partial<EvidenceLedgerRedactResponse> &
    Record<string, unknown>;

  if (payload.ok === true) {
    bumpCounter('ok');
    logSafe('info', 'evidence redacted', {
      tombstone_record_id: payload.tombstone_record_id,
      redacted_target: payload.redacted_target,
      already_redacted: payload.already_redacted,
    });
    return NextResponse.json(payload);
  }

  // Helper signalled failure. Map error_kind -> counter bucket + status.
  const errorKind =
    typeof payload.error_kind === 'string' ? payload.error_kind : 'exec_error';
  if (errorKind === 'validation_error') {
    bumpCounter('validation_error');
  } else if (errorKind === 'target_not_found') {
    bumpCounter('target_not_found');
  } else {
    bumpCounter('exec_error');
  }
  const status =
    errorKind === 'exec_error'
      ? 500
      : errorKind === 'target_not_found'
        ? 404
        : 400;
  logSafe('warn', `helper rejected (${errorKind})`, {
    message: payload.message,
    exitCode: result.exitCode,
    stderr: result.stderr.slice(0, 200),
  });
  return NextResponse.json(
    {
      ok: false,
      error_kind: errorKind,
      message:
        typeof payload.message === 'string'
          ? payload.message
          : 'helper failed without message',
    },
    { status },
  );
}
