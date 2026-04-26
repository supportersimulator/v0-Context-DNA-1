/**
 * POST /api/build/run
 *
 * Body: { cwd?: string, target?: 'web' | 'build' | 'test' | 'lint' }
 *
 * Runs an npm script inside a repo under the superrepo and waits for it to
 * complete. Captures stdout/stderr (last 2000 chars each), exit code, and
 * duration. Spawned via execFile (argv form) — no shell, no interpolation
 * of user input.
 *
 * Hard timeout: 5 minutes (300 000 ms). Builds longer than that are killed
 * with SIGTERM and the route reports timeout via stderr. This is the absolute
 * maximum — RUN-ONCE-AND-WAIT semantics. For long-running dev servers
 * (`expo start --web`) use /api/er-sim/launch which spawns detached.
 *
 * Target → npm script mapping:
 *   web   → `npm run web`   (er-sim: expo start --web — fine for short
 *                            test launches but you usually want
 *                            /api/er-sim/launch instead)
 *   build → `npm run build` (NOTE: er-sim doesn't define this script; npm
 *                            will exit with an error and we surface it.)
 *   test  → `npm test`      (NOTE: er-sim doesn't define this either today.)
 *   lint  → `npm run lint`  (er-sim: expo lint)
 *
 * READ-ONLY w.r.t. git: never invokes git, never mutates the working tree.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import path from 'node:path';

import { resolveSafePath, superrepoRoot } from '@/lib/api/fs/safety';
import { setBuildStarted, setBuildFinished } from '@/lib/api/build/state';

export const dynamic = 'force-dynamic';

/** Absolute hard cap for any single build invocation. */
const BUILD_TIMEOUT_MS = 5 * 60 * 1000;

/** Truncate captured streams to keep the JSON response bounded. */
const STREAM_TAIL_CHARS = 2000;

/** Allowed targets — keep narrow so the route can never run arbitrary scripts. */
const TARGETS = ['web', 'build', 'test', 'lint'] as const;
type BuildTarget = (typeof TARGETS)[number];

const DEFAULT_REPO = path.join(
  superrepoRoot(),
  'simulator-core',
  'er-sim-monitor',
);

interface RunBody {
  cwd?: unknown;
  target?: unknown;
}

function npmArgsFor(target: BuildTarget): string[] {
  // 'test' uses `npm test` (npm shorthand), the rest go through `npm run X`
  if (target === 'test') return ['test'];
  return ['run', target];
}

function tail(str: string, n: number): string {
  if (str.length <= n) return str;
  return '…' + str.slice(-n);
}

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  pid: number | null;
}

function runNpm(cwd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = execFile(
      'npm',
      args,
      {
        cwd,
        timeout: BUILD_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10 MB stream buffer cap
        windowsHide: true,
        env: { ...process.env, CI: '1', BROWSER: 'none' },
      },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - startedAt;
        const timedOut =
          !!err && (err as NodeJS.ErrnoException).code === 'ETIMEDOUT';
        // err is also set on non-zero exit; we still want stdout/stderr.
        const exitCode =
          err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
            ? ((err as unknown as { code: number }).code as number)
            : err
              ? null
              : 0;
        resolve({
          exitCode,
          stdout: tail(stdout?.toString() ?? '', STREAM_TAIL_CHARS),
          stderr: tail(
            (stderr?.toString() ?? '') +
              (timedOut ? `\n[killed after ${BUILD_TIMEOUT_MS}ms — hard timeout]` : ''),
            STREAM_TAIL_CHARS,
          ),
          durationMs,
          timedOut,
          pid: child.pid ?? null,
        });
      },
    );
    setBuildStarted(args.join(' '), child.pid ?? null);
  });
}

export async function POST(req: NextRequest) {
  let body: RunBody;
  try {
    body = (await req.json()) as RunBody;
  } catch {
    body = {};
  }

  const target = (body.target ?? 'build') as string;
  if (!TARGETS.includes(target as BuildTarget)) {
    return NextResponse.json(
      { ok: false, error: `target must be one of: ${TARGETS.join(', ')}` },
      { status: 400 },
    );
  }

  const rawCwd = typeof body.cwd === 'string' && body.cwd ? body.cwd : DEFAULT_REPO;
  const resolved = resolveSafePath(rawCwd);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: 403 },
    );
  }

  try {
    const result = await runNpm(resolved.absolute, npmArgsFor(target as BuildTarget));
    setBuildFinished(result.exitCode);

    return NextResponse.json({
      ok: result.exitCode === 0,
      target,
      cwd: resolved.absolute,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.durationMs,
      timed_out: result.timedOut,
      pid: result.pid,
    });
  } catch (err) {
    setBuildFinished(null);
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message || 'spawn failed',
        target,
        cwd: resolved.absolute,
      },
      { status: 500 },
    );
  }
}
