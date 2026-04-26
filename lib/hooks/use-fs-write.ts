'use client';

// =============================================================================
// useFsWrite — atomic file save with Electron IPC fast-path + HTTP fallback
//
// When running inside Electron, calls window.electron.fs.write directly so the
// save bypasses the Next.js HTTP API and the loopback round-trip. When running
// in pure web mode (or if the IPC bridge is missing), falls back to
// POST /api/fs/write. Both paths share the same backup directory at
// .3-surgeons/file-backups/<sha16>/<ISO-stamp>__<filename>.
// =============================================================================

import { useCallback } from 'react';

export interface FsWriteResult {
  ok: boolean;
  path?: string;
  bytes?: number;
  backup?: string | null;
  error?: string;
}

interface ElectronFsBridge {
  write?: (filePath: string, content: string) => Promise<FsWriteResult>;
}
interface ElectronBridge {
  fs?: ElectronFsBridge;
}

function getElectronWrite():
  | ((filePath: string, content: string) => Promise<FsWriteResult>)
  | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { electron?: ElectronBridge };
  const fn = w.electron?.fs?.write;
  return typeof fn === 'function' ? fn : null;
}

async function writeViaHttp(filePath: string, content: string): Promise<FsWriteResult> {
  try {
    const res = await fetch('/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const text = await res.text();
    let parsed: FsWriteResult | null = null;
    try {
      parsed = text ? (JSON.parse(text) as FsWriteResult) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      return {
        ok: false,
        error: parsed?.error ?? `HTTP ${res.status}: ${text || res.statusText}`,
      };
    }
    return parsed ?? { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface UseFsWriteApi {
  /** Whether the Electron IPC fast-path is available right now. */
  hasIpc: boolean;
  /**
   * Write a file. Uses Electron IPC if present, otherwise POST /api/fs/write.
   * Always resolves — never throws — so the editor save state machine can
   * branch on result.ok.
   */
  writeFile: (filePath: string, content: string) => Promise<FsWriteResult>;
}

export function useFsWrite(): UseFsWriteApi {
  const writeFile = useCallback(
    async (filePath: string, content: string): Promise<FsWriteResult> => {
      const ipc = getElectronWrite();
      if (ipc) {
        try {
          const result = await ipc(filePath, content);
          // If the IPC handler returned a structured failure, fall back to
          // HTTP — the daemon may have a fix the IPC path lacks (e.g. the
          // route is up but the user is mid-restart of the Electron main
          // process). If both fail, the UI surfaces the IPC error.
          if (result && result.ok) return result;
          const httpResult = await writeViaHttp(filePath, content);
          if (httpResult.ok) return httpResult;
          return {
            ok: false,
            error: `IPC: ${result?.error ?? 'unknown error'} | HTTP: ${httpResult.error ?? 'unknown error'}`,
          };
        } catch (err) {
          // IPC threw — fall back to HTTP.
          const ipcErr = err instanceof Error ? err.message : String(err);
          const httpResult = await writeViaHttp(filePath, content);
          if (httpResult.ok) return httpResult;
          return {
            ok: false,
            error: `IPC threw: ${ipcErr} | HTTP: ${httpResult.error ?? 'unknown error'}`,
          };
        }
      }
      return writeViaHttp(filePath, content);
    },
    [],
  );

  return { hasIpc: getElectronWrite() !== null, writeFile };
}
