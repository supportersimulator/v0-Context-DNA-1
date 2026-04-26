/**
 * POST /api/terminal/exec
 *
 * Body: { command: string, cwd?: string }
 * Resp: { ok: true, sessionId } | { ok: false, error }
 *
 * Spawns a child process under the IDE's host. Output is buffered and made
 * available via GET /api/terminal/stream/[sessionId] (SSE).
 *
 * SECURITY (NON-NEGOTIABLE):
 *   - shell: false, argv array form — input never touches a shell.
 *   - command must pass the hard-coded whitelist (see lib/terminal/whitelist.ts).
 *   - cwd is resolved against the superrepo root and rejected if it escapes.
 *
 * NAIVE PARSING:
 *   `command` is split on whitespace (no quoted-string handling, no shell
 *   expansion). For commands needing complex args use `bash -c <single-token>`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  markClosed,
  pushChunk,
  registerSession,
  resolveSafeCwd,
  type Session,
} from '@/lib/terminal/sessions';
import { validateCommand } from '@/lib/terminal/whitelist';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ExecBody {
  command?: unknown;
  cwd?: unknown;
}

export async function POST(req: NextRequest) {
  let body: ExecBody;
  try {
    body = (await req.json()) as ExecBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const check = validateCommand(body.command);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: check.status });
  }

  const cwdInput = typeof body.cwd === 'string' ? body.cwd : undefined;
  const cwd = resolveSafeCwd(cwdInput);
  if (!cwd) {
    return NextResponse.json(
      { ok: false, error: 'cwd missing, not a directory, or outside superrepo root' },
      { status: 400 },
    );
  }

  const argv = check.argv;
  const sessionId = randomUUID();

  let proc: ReturnType<typeof spawn>;
  try {
    proc = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false, // see security note at top of file
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `spawn failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  if (!proc.stdout || !proc.stderr) {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { ok: false, error: 'spawn produced no stdio streams' },
      { status: 500 },
    );
  }

  const session: Session = {
    id: sessionId,
    proc: proc as Session['proc'],
    cwd,
    command: argv,
    buffer: [],
    bufferBytes: 0,
    closed: false,
    closeEvent: null,
    listeners: new Set(),
    createdAt: Date.now(),
  };
  registerSession(session);

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => pushChunk(session, { stream: 'stdout', chunk }));
  proc.stderr.on('data', (chunk: string) => pushChunk(session, { stream: 'stderr', chunk }));
  proc.on('error', (err) => {
    pushChunk(session, { stream: 'stderr', chunk: `\n[spawn error] ${err.message}\n` });
  });
  proc.on('close', (code, signal) => {
    markClosed(session, { code: code ?? null, signal: signal ?? null });
  });

  return NextResponse.json({
    ok: true,
    sessionId,
    cwd,
    command: argv,
  });
}
