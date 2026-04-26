/**
 * 3-Surgeons Health Check
 *
 * GET /api/3s/health
 * Returns: { ok: boolean, version?: string, detail?: object, error?: string }
 *
 * Runs `python3 -m three_surgeons.cli.main bridge-status --json-output`
 * via execFile (never exec/eval) and surfaces version + bridge state.
 */

import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { append as logAppend } from '@/lib/log/buffer';

const execFileP = promisify(execFile);

const SURGEONS_DIR =
  process.env.THREE_SURGEONS_DIR ||
  path.resolve(process.cwd(), '..', '3-surgeons');
const PYTHON_BIN = process.env.THREE_SURGEONS_PYTHON || 'python3';
const TIMEOUT_MS = 10_000;

export async function GET() {
  try {
    const { stdout } = await execFileP(
      PYTHON_BIN,
      ['-m', 'three_surgeons.cli.main', 'bridge-status', '--json-output'],
      {
        cwd: SURGEONS_DIR,
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      },
    );

    // bridge-status emits a JSON object on stdout (warnings go to stderr)
    const jsonStart = stdout.indexOf('{');
    const jsonText = jsonStart >= 0 ? stdout.slice(jsonStart) : stdout;
    let detail: Record<string, unknown> | undefined;
    try {
      detail = JSON.parse(jsonText);
    } catch {
      detail = undefined;
    }

    const version =
      typeof detail?.plugin_version === 'string'
        ? (detail.plugin_version as string)
        : undefined;

    return NextResponse.json({ ok: true, version, detail });
  } catch (e) {
    const err = e as { message?: string; stderr?: string; code?: number; stack?: string };
    try { logAppend({ ts: Date.now(), level: 'error', source: '3s/health', msg: err?.message || String(e), detail: (err?.stack || err?.stderr || '').slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || String(e),
        stderr: err?.stderr,
        code: err?.code,
      },
      { status: 503 },
    );
  }
}
