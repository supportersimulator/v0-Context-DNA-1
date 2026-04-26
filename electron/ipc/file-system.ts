import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Watcher registry for cleanup
const watchers = new Map<string, fs.FSWatcher>();

// ---------------------------------------------------------------------------
// Path safety — ported verbatim from lib/api/fs/safety.ts so the Electron IPC
// path enforces the SAME allowed roots, null-byte rejection, and traversal
// defence as the HTTP route at app/api/fs/write/route.ts. Keep these in sync.
// ---------------------------------------------------------------------------

function superrepoRoot(): string {
  const start = process.cwd();
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.3-surgeons'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(start);
}

function allowedRoots(): string[] {
  const root = superrepoRoot();
  const sim = path.join(root, 'simulator-core');
  return [root, sim];
}

interface ResolvedPath { ok: true; absolute: string; root: string }
interface RejectedPath { ok: false; error: string }

function resolveSafePath(userPath: string | null | undefined): ResolvedPath | RejectedPath {
  if (typeof userPath !== 'string') return { ok: false, error: 'path is required' };
  const trimmed = userPath.trim();
  if (!trimmed) return { ok: false, error: 'path is required' };
  if (trimmed.includes('\0')) return { ok: false, error: 'null byte in path' };

  const roots = allowedRoots();
  const primaryRoot = roots[0];
  const absolute = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(primaryRoot, trimmed);

  const matchedRoot = roots.find(
    (r) => absolute === r || absolute.startsWith(r + path.sep),
  );
  if (!matchedRoot) return { ok: false, error: 'path escapes allowed roots' };
  return { ok: true, absolute, root: matchedRoot };
}

function withTimeout<T>(p: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

const TIMEOUT_MS = 5000;
const MAX_WRITE_BYTES = 5 * 1024 * 1024; // 5 MB — same envelope as HTTP route.

function backupDirFor(absolute: string): string {
  const sha = crypto.createHash('sha256').update(absolute).digest('hex').slice(0, 16);
  return path.join(superrepoRoot(), '.3-surgeons', 'file-backups', sha);
}

async function backupExisting(absolute: string): Promise<string | null> {
  try {
    await fs.promises.access(absolute);
  } catch {
    return null; // first write — nothing to back up.
  }
  const dir = backupDirFor(absolute);
  await fs.promises.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${stamp}__${path.basename(absolute)}`);
  await fs.promises.copyFile(absolute, dest);
  return dest;
}

export function registerFileSystemHandlers() {
  ipcMain.handle('fs:readDir', async (_event: IpcMainInvokeEvent, dirPath: string) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  });

  ipcMain.handle('fs:readFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stat = await fs.promises.stat(filePath);
    return {
      content,
      size: stat.size,
      modified: stat.mtimeMs,
    };
  });

  // Atomic write with backup — mirrors POST /api/fs/write so saves bypass the
  // HTTP round-trip when running inside Electron. Backup directory layout is
  // identical to the HTTP route so restore works regardless of which path
  // wrote the file.
  ipcMain.handle(
    'fs:write',
    async (_event: IpcMainInvokeEvent, args: { path: string; content: string }) => {
      try {
        if (!args || typeof args !== 'object') {
          return { ok: false, error: 'invalid args' };
        }
        if (typeof args.content !== 'string') {
          return { ok: false, error: 'content must be a string' };
        }

        const bytes = Buffer.byteLength(args.content, 'utf-8');
        if (bytes > MAX_WRITE_BYTES) {
          return {
            ok: false,
            error: `content too large: ${bytes} bytes (max ${MAX_WRITE_BYTES})`,
          };
        }

        const resolved = resolveSafePath(args.path);
        if (!resolved.ok) return { ok: false, error: resolved.error };

        // Refuse to overwrite a directory.
        try {
          const st = await fs.promises.stat(resolved.absolute);
          if (st.isDirectory()) {
            return { ok: false, error: 'path is a directory', path: resolved.absolute };
          }
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT') {
            return { ok: false, error: (err as Error).message, path: resolved.absolute };
          }
          // ENOENT — creating new file, fine.
        }

        // Ensure parent directory exists.
        try {
          await fs.promises.mkdir(path.dirname(resolved.absolute), { recursive: true });
        } catch (err) {
          return {
            ok: false,
            error: `mkdir parent failed: ${(err as Error).message}`,
            path: resolved.absolute,
          };
        }

        let backupPath: string | null = null;
        try {
          backupPath = await withTimeout(
            backupExisting(resolved.absolute),
            TIMEOUT_MS,
            'backup',
          );
        } catch (err) {
          return {
            ok: false,
            error: `backup failed: ${(err as Error).message}`,
            path: resolved.absolute,
          };
        }

        // Atomic write: tmp file in same directory, then rename.
        const tmpSuffix = crypto.randomBytes(6).toString('hex');
        const tmpPath = `${resolved.absolute}.tmp.${tmpSuffix}`;
        try {
          await withTimeout(
            fs.promises.writeFile(tmpPath, args.content, { encoding: 'utf-8' }),
            TIMEOUT_MS,
            'writeFile',
          );
          await withTimeout(
            fs.promises.rename(tmpPath, resolved.absolute),
            TIMEOUT_MS,
            'rename',
          );
        } catch (err) {
          let cleanupNote = '';
          try { await fs.promises.unlink(tmpPath); } catch (e) {
            cleanupNote = ` (tmp cleanup failed: ${(e as Error).message})`;
          }
          return {
            ok: false,
            error: `write failed: ${(err as Error).message}${cleanupNote}`,
            path: resolved.absolute,
            backup: backupPath,
          };
        }

        return {
          ok: true,
          path: resolved.absolute,
          bytes,
          backup: backupPath,
        };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  ipcMain.on('fs:watchDir', (event: IpcMainEvent, dirPath: string) => {
    // Cleanup existing watcher for this path
    if (watchers.has(dirPath)) {
      watchers.get(dirPath)!.close();
    }

    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (filename) {
        event.sender.send('fs:watchEvent', eventType, path.join(dirPath, filename));
      }
    });

    watchers.set(dirPath, watcher);
  });

  ipcMain.on('fs:unwatchDir', (_event: IpcMainEvent, dirPath: string) => {
    const watcher = watchers.get(dirPath);
    if (watcher) {
      watcher.close();
      watchers.delete(dirPath);
    }
  });
}
