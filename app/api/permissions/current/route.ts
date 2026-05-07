/**
 * Permission Map — current snapshot (Z2 scaffold, 2026-05-07).
 *
 * GET /api/permissions/current
 *
 * Reads the latest PermissionGovernor snapshot by spawning
 * `scripts/dump-permission-snapshot.py` (the Python helper that opens
 * `memory/permission_governor.db` and prints the latest row as JSON).
 *
 * Architecture choice (`.fleet/audits/2026-05-07-Z2-permission-governor-scaffold.md`):
 *   - Spawn-then-parse pattern, mirroring `dump-evidence-ledger-summary.py` and
 *     `dump-race-events-snapshot.py`. This keeps the Next.js process stdlib-only
 *     and lets the same snapshot be consumed by other tools (CLI, fleet probes).
 *   - Read-side ONLY in Z2. Z3+ wires write-side gating into GovernedPacket
 *     emission paths.
 *
 * Graceful degradation:
 *   - No snapshot exists           -> `{permissions: [], schema_version: 0,
 *                                       generated_at: null, source: 'no-snapshot'}`
 *   - Helper exits non-zero        -> `{... source: 'error', error: '...'}`
 *   - Helper times out             -> `{... source: 'error', error: 'timeout'}`
 *   - The route NEVER 500s — the dashboard pill always renders.
 *
 * ZSF: every fetch path bumps a counter in `PERMISSION_FETCH_COUNTERS` (ok /
 * missing / error / timeout). Counters are exposed to tests via
 * `__permissionFetchCountersForTests` so cardio sentinels can assert they move.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';
import {
  EMPTY_PERMISSION_MAP,
  type PermissionEntry,
  type PermissionMap,
} from '@/lib/ide/permission-types';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.SUPERREPO_ROOT
  ? path.resolve(process.env.SUPERREPO_ROOT)
  : path.resolve(process.cwd(), '..');

const DUMP_SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'dump-permission-snapshot.py',
);

// Helper exec timeout. The dump script is a single SQLite read on a tiny
// table — should comfortably complete in <300ms locally. We give 5s headroom
// for cold-start Python interpreter + SSD warm-up; over that, declare timeout.
const HELPER_TIMEOUT_MS = 5000;

// Python interpreter override (matches the rest of the admin routes that
// shell out to memory/* helpers).
function pythonBin(): string {
  return process.env.PYTHON_BIN || 'python3';
}

// ZSF: monotonic, process-local. Mirrors LEDGER_FETCH_COUNTERS / RACE_FETCH_COUNTERS.
const PERMISSION_FETCH_COUNTERS: {
  ok: number;
  missing: number;
  error: number;
  timeout: number;
} = { ok: 0, missing: 0, error: 0, timeout: 0 };

/** Test-only accessor — exported so unit tests can assert counter deltas. */
export function __permissionFetchCountersForTests(): typeof PERMISSION_FETCH_COUNTERS {
  return { ...PERMISSION_FETCH_COUNTERS };
}

// ---------------------------------------------------------------------------
// Helper exec
// ---------------------------------------------------------------------------

type HelperResult =
  | { ok: true; payload: unknown }
  | { ok: false; reason: 'timeout' | 'spawn' | 'exit' | 'parse'; detail?: string };

async function runHelper(): Promise<HelperResult> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (r: HelperResult) => {
      if (resolved) return;
      resolved = true;
      resolve(r);
    };

    let proc;
    try {
      proc = spawn(pythonBin(), [DUMP_SCRIPT], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PYTHONPATH: [
            path.join(REPO_ROOT, 'multi-fleet'),
            REPO_ROOT,
            process.env.PYTHONPATH ?? '',
          ]
            .filter(Boolean)
            .join(path.delimiter),
        },
      });
    } catch (err) {
      finish({
        ok: false,
        reason: 'spawn',
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
      finish({
        ok: false,
        reason: 'timeout',
        detail: `helper exceeded ${HELPER_TIMEOUT_MS}ms`,
      });
    }, HELPER_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        reason: 'spawn',
        detail: err instanceof Error ? err.message : String(err),
      });
    });

    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish({
          ok: false,
          reason: 'exit',
          detail: `code=${code} stderr=${stderr.slice(0, 200)}`,
        });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch (err) {
        finish({
          ok: false,
          reason: 'parse',
          detail: ((err as Error)?.message ?? String(err)).slice(0, 200),
        });
        return;
      }
      finish({ ok: true, payload: parsed });
    });
  });
}

// ---------------------------------------------------------------------------
// Shape coercion
// ---------------------------------------------------------------------------

function coercePayload(raw: unknown): PermissionMap {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_PERMISSION_MAP, source: 'error', error: 'helper returned non-object' };
  }
  const obj = raw as Record<string, unknown>;
  const entries = Array.isArray(obj.entries)
    ? (obj.entries as unknown[]).filter(
        (e): e is PermissionEntry =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as Record<string, unknown>).capability === 'string' &&
          typeof (e as Record<string, unknown>).actor === 'string' &&
          typeof (e as Record<string, unknown>).status === 'string',
      )
    : [];
  const sourceRaw = obj.source;
  const source: PermissionMap['source'] =
    sourceRaw === 'snapshot' ||
    sourceRaw === 'no-snapshot' ||
    sourceRaw === 'error' ||
    sourceRaw === 'import-error'
      ? sourceRaw
      : 'no-snapshot';
  return {
    schema_version: (obj.schema_version as string | number | undefined) ?? 0,
    generated_at:
      typeof obj.generated_at === 'string' ? obj.generated_at : null,
    entries,
    hash: typeof obj.hash === 'string' ? obj.hash : undefined,
    source,
    error: typeof obj.error === 'string' ? obj.error : undefined,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<PermissionMap>> {
  try {
    const result = await runHelper();
    if (!result.ok) {
      if (result.reason === 'timeout') {
        PERMISSION_FETCH_COUNTERS.timeout += 1;
      } else {
        PERMISSION_FETCH_COUNTERS.error += 1;
      }
      try {
        logAppend({
          ts: Date.now(),
          level: 'warn',
          source: 'permissions/current',
          msg: `permission helper failed: ${result.reason}`,
          detail: result.detail ?? '',
        });
      } catch {
        /* logAppend itself failing must not crash the route */
      }
      return NextResponse.json(
        {
          ...EMPTY_PERMISSION_MAP,
          source: 'error',
          error: `${result.reason}${result.detail ? `: ${result.detail}` : ''}`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const map = coercePayload(result.payload);
    if (map.source === 'no-snapshot') {
      PERMISSION_FETCH_COUNTERS.missing += 1;
    } else if (map.source === 'snapshot') {
      PERMISSION_FETCH_COUNTERS.ok += 1;
    } else {
      PERMISSION_FETCH_COUNTERS.error += 1;
    }
    return NextResponse.json(map, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    PERMISSION_FETCH_COUNTERS.error += 1;
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'permissions/current',
        msg: 'unexpected error in /api/permissions/current',
        detail: ((error as Error)?.stack || String(error)).slice(0, 500),
      });
    } catch {
      /* logAppend itself failing must not crash the route */
    }
    return NextResponse.json(
      {
        ...EMPTY_PERMISSION_MAP,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
