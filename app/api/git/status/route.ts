/**
 * GET /api/git/status?cwd=<path>
 *
 * Returns the git working-tree status of a repo inside the superrepo.
 *
 * Defaults to simulator-core/er-sim-monitor (the ER Simulator project).
 * Validates `cwd` stays inside the superrepo using lib/api/fs/safety helpers.
 *
 * Spawns `git status --porcelain=v1 --branch` and `git log -1 ...` via
 * execFile (argv form, no shell) — user input never reaches a shell. Hard
 * 5s timeout per child so a hung git process can't pin the route.
 *
 * Response (success):
 *   {
 *     ok: true,
 *     cwd: "/abs/path/to/repo",
 *     branch: "main",
 *     ahead: 0,
 *     behind: 0,
 *     staged: [{ path, status }],
 *     unstaged: [{ path, status }],
 *     untracked: [{ path }],
 *     last_commit: { hash, subject, when, author }
 *   }
 *
 * Response (error): { ok: false, error: <string>, cwd?: <string> } with HTTP 4xx/5xx.
 *
 * Read-only — never mutates the working tree.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import path from 'node:path';

import { resolveSafePath, superrepoRoot } from '@/lib/api/fs/safety';

export const dynamic = 'force-dynamic';

const GIT_TIMEOUT_MS = 5_000;

const DEFAULT_REPO = path.join(
  superrepoRoot(),
  'simulator-core',
  'er-sim-monitor',
);

interface FileEntry {
  path: string;
  status: string;
}

interface UntrackedEntry {
  path: string;
}

interface ParsedStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: UntrackedEntry[];
}

/**
 * Run a git command in argv form. Captures stdout — never uses a shell.
 * Throws on non-zero exit, timeout, or spawn failure.
 */
function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024, // 1 MB stdout cap
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.toString().trim() || (err as Error).message;
          reject(new Error(`git ${args.join(' ')}: ${msg}`));
          return;
        }
        resolve(stdout.toString());
      },
    );
  });
}

/**
 * Parse `git status --porcelain=v1 --branch` output into structured groups.
 *
 * Branch line format:
 *   ## main...origin/main [ahead 1, behind 2]
 *   ## HEAD (no branch)
 *
 * Entry format (porcelain v1, two-char prefix):
 *   XY <path>           — X = staged status, Y = unstaged status
 *   ?? <path>           — untracked
 *   R  old -> new       — rename (XY = "R "/"RM"/etc.)
 */
function parsePorcelain(raw: string): ParsedStatus {
  const out: ParsedStatus = {
    branch: 'unknown',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
  };

  for (const line of raw.split('\n')) {
    if (!line) continue;

    if (line.startsWith('## ')) {
      const rest = line.slice(3);
      // Detached HEAD: "## HEAD (no branch)"
      if (rest.startsWith('HEAD (no branch)')) {
        out.branch = 'HEAD (detached)';
        continue;
      }
      // "main...origin/main [ahead 1, behind 2]"
      const branchMatch = rest.match(/^([^.\s]+)/);
      out.branch = branchMatch ? branchMatch[1] : rest.trim();
      const aheadMatch = rest.match(/ahead (\d+)/);
      const behindMatch = rest.match(/behind (\d+)/);
      if (aheadMatch) out.ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) out.behind = parseInt(behindMatch[1], 10);
      continue;
    }

    if (line.length < 3) continue;
    const xy = line.slice(0, 2);
    const filePart = line.slice(3);

    // Untracked
    if (xy === '??') {
      out.untracked.push({ path: filePart });
      continue;
    }

    // Rename: "R  old -> new"
    const displayPath = filePart.includes(' -> ')
      ? filePart.split(' -> ').pop()!
      : filePart;

    const x = xy[0];
    const y = xy[1];

    if (x !== ' ' && x !== '?') {
      out.staged.push({ path: displayPath, status: x });
    }
    if (y !== ' ' && y !== '?') {
      out.unstaged.push({ path: displayPath, status: y });
    }
  }

  return out;
}

interface LastCommit {
  hash: string;
  subject: string;
  when: string;
  author: string;
}

function parseLastCommit(raw: string): LastCommit | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Format string: %H|%s|%ar|%an
  // Subject can contain '|', so split limited to 4 parts from the LEFT
  // by walking manually so the subject keeps any embedded '|'.
  const parts = trimmed.split('|');
  if (parts.length < 4) return null;
  // hash, subject, when, author — recombine middle if subject had '|'
  const hash = parts[0];
  const author = parts[parts.length - 1];
  const when = parts[parts.length - 2];
  const subject = parts.slice(1, parts.length - 2).join('|');
  return { hash, subject, when, author };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawCwd = searchParams.get('cwd') ?? DEFAULT_REPO;

  const resolved = resolveSafePath(rawCwd);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: 403 },
    );
  }

  try {
    const [statusOut, logOut] = await Promise.all([
      runGit(resolved.absolute, ['status', '--porcelain=v1', '--branch']),
      runGit(resolved.absolute, [
        'log',
        '-1',
        '--format=%H|%s|%ar|%an',
      ]).catch((e: Error) => {
        // Empty repo (no commits yet) — surface but don't fail the route.
        return `__NOLOG__:${e.message}`;
      }),
    ]);

    const parsed = parsePorcelain(statusOut);
    const last_commit = logOut.startsWith('__NOLOG__:')
      ? null
      : parseLastCommit(logOut);

    return NextResponse.json({
      ok: true,
      cwd: resolved.absolute,
      branch: parsed.branch,
      ahead: parsed.ahead,
      behind: parsed.behind,
      staged: parsed.staged,
      unstaged: parsed.unstaged,
      untracked: parsed.untracked,
      last_commit,
    });
  } catch (err) {
    const message = (err as Error).message || 'git status failed';
    // Distinguish "not a git repo" from other failures
    const status = /not a git repository/i.test(message) ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: message, cwd: resolved.absolute },
      { status },
    );
  }
}
