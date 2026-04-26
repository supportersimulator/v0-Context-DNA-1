/**
 * 3-Surgeons Generic Tool Dispatcher
 *
 * POST /api/3s/tool
 * Body: { tool: string, args?: Record<string, unknown>, dry_run?: boolean }
 * Returns: { ok: boolean, tool, dryRun, argv?, raw?, stdout?, stderr?, error? }
 *
 * Allowlisted, validated bridge into `three_surgeons.cli.main`. Spawns the
 * CLI via execFile (never exec/eval) and captures stdout/stderr.
 *
 * Two execution modes:
 *   - dry_run: true  → returns the resolved argv + cost estimate WITHOUT
 *                       spawning the CLI. (Honoured only when the tool
 *                       supports `--dry-run` upstream — we still pass the
 *                       flag so the CLI surfaces its own protocol estimate.)
 *   - dry_run: false (default) → spawns the CLI and returns stdout/stderr.
 *
 * Mirrors docs/plans/2026-03-13-3surgeons-ide-versatility-design.md
 * "Component 5: --dry-run / Read-Only Mode".
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { append as logAppend } from '@/lib/log/buffer';
import { buildArgs, findTool } from '@/lib/api/3s/tool-catalog';

const execFileP = promisify(execFile);

const SURGEONS_DIR =
  process.env.THREE_SURGEONS_DIR || path.resolve(process.cwd(), '..', '3-surgeons');
const PYTHON_BIN = process.env.THREE_SURGEONS_PYTHON || 'python3';
const MAX_BUFFER = 4 * 1024 * 1024;

interface ToolPayload {
  tool: string;
  args: Record<string, unknown>;
  dryRun: boolean;
}

function parsePayload(body: unknown): { ok: true; payload: ToolPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'request body must be an object' };
  }
  const b = body as Record<string, unknown>;
  const tool = b.tool;
  if (typeof tool !== 'string' || !tool.trim()) {
    return { ok: false, error: '`tool` (string) is required' };
  }
  let args: Record<string, unknown> = {};
  if (b.args !== undefined) {
    if (!b.args || typeof b.args !== 'object' || Array.isArray(b.args)) {
      return { ok: false, error: '`args` must be a plain object' };
    }
    args = b.args as Record<string, unknown>;
  }
  const dryRun = b.dry_run === true;
  return { ok: true, payload: { tool: tool.trim(), args, dryRun } };
}

export async function POST(request: NextRequest) {
  let payload: ToolPayload;
  try {
    const body = await request.json();
    const parsed = parsePayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    payload = parsed.payload;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `invalid JSON body: ${(err as Error)?.message ?? 'unknown'}` },
      { status: 400 },
    );
  }

  const tool = findTool(payload.tool);
  if (!tool) {
    return NextResponse.json(
      { ok: false, error: `unknown tool "${payload.tool}"` },
      { status: 404 },
    );
  }

  const built = buildArgs(tool, payload.args, payload.dryRun);
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  }

  const argv = ['-m', 'three_surgeons.cli.main', ...built.argv];

  // ---------------------------------------------------------------------
  // Dry-run shortcut: don't spawn — return the planned invocation. Useful
  // when the IDE wants to render a confirmation dialog before paying real
  // LLM cost. (We still spawn when the upstream tool's `--dry-run` is
  // meaningful, e.g. consult/cross-exam print a cost estimate.)
  // ---------------------------------------------------------------------

  if (payload.dryRun && !tool.dryRunFlag) {
    // buildArgs already rejected this case, but defence-in-depth.
    return NextResponse.json(
      { ok: false, error: `tool "${tool.id}" does not support --dry-run` },
      { status: 400 },
    );
  }

  try {
    const { stdout, stderr } = await execFileP(PYTHON_BIN, argv, {
      cwd: SURGEONS_DIR,
      timeout: tool.timeoutMs,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    return NextResponse.json({
      ok: true,
      tool: tool.id,
      dryRun: payload.dryRun,
      argv: built.argv,
      stdout,
      stderr: stderr || undefined,
    });
  } catch (err) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
      stack?: string;
      signal?: string;
    };
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: '3s/tool',
        msg: `tool=${tool.id}: ${e?.message ?? String(err)}`,
        detail: ((e?.stack ?? '') + '\n' + (e?.stderr ?? '')).slice(0, 800),
      });
    } catch {
      /* noop */
    }
    return NextResponse.json(
      {
        ok: false,
        tool: tool.id,
        dryRun: payload.dryRun,
        argv: built.argv,
        error: e?.message ?? String(err),
        signal: e?.signal,
        stdout: e?.stdout,
        stderr: e?.stderr,
        code: e?.code,
      },
      { status: 500 },
    );
  }
}
