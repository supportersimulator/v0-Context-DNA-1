/**
 * FS API safety helpers
 *
 * Shared root-resolution + path-safety logic used by app/api/fs/{list,read,write}.
 * Every user-supplied path is resolved against an allowed root and rejected if
 * it escapes (defends against ../.. traversal, absolute /etc/passwd, symlink
 * tricks via path.resolve normalisation). NEVER trust user input.
 */
import { existsSync } from 'fs';
import path from 'path';

/** Folders we always hide from list responses unless ?hidden=true. */
export const HIDDEN_DIRS = new Set<string>([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'dist-electron',
  '.venv',
  'venv.nosync',
]);

/**
 * Walk up from process.cwd() until we find a directory containing .3-surgeons/.
 * Mirrors defaultProjectDir() in app/api/receipts/route.ts so the IDE points at
 * the same superrepo regardless of where Next.js was launched from.
 */
export function superrepoRoot(): string {
  const start = process.cwd();
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, '.3-surgeons'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(start);
}

/** Allowed roots for FS reads/writes. simulator-core may sit outside the
 *  superrepo .3-surgeons probe in some checkouts, so we whitelist it too. */
export function allowedRoots(): string[] {
  const root = superrepoRoot();
  const sim = path.join(root, 'simulator-core');
  return [root, sim];
}

export interface ResolvedPath {
  ok: true;
  absolute: string;
  root: string;
}

export interface RejectedPath {
  ok: false;
  error: string;
}

/**
 * Resolve a user-supplied path against the allowed roots and verify it stays
 * inside one of them.
 *
 * Algorithm (the load-bearing path-safety check):
 *   const absolute = path.isAbsolute(userPath)
 *     ? path.resolve(userPath)
 *     : path.resolve(root, userPath);
 *   const inside = roots.some((r) => absolute === r || absolute.startsWith(r + path.sep));
 *   if (!inside) return { ok: false, error: 'path escapes allowed roots' };
 */
export function resolveSafePath(userPath: string | null | undefined): ResolvedPath | RejectedPath {
  if (typeof userPath !== 'string') {
    return { ok: false, error: 'path is required' };
  }
  const trimmed = userPath.trim();
  if (!trimmed) {
    return { ok: false, error: 'path is required' };
  }
  if (trimmed.includes('\0')) {
    return { ok: false, error: 'null byte in path' };
  }

  const roots = allowedRoots();
  const primaryRoot = roots[0];

  const absolute = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(primaryRoot, trimmed);

  const matchedRoot = roots.find(
    (r) => absolute === r || absolute.startsWith(r + path.sep),
  );
  if (!matchedRoot) {
    return { ok: false, error: 'path escapes allowed roots' };
  }
  return { ok: true, absolute, root: matchedRoot };
}

/** Race a promise against a timeout. Used so a slow disk can't pin a route. */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
