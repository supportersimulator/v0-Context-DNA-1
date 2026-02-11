// =============================================================================
// Abstract platform API — unified interface for OS operations
// =============================================================================
//
// Implementations:
//   ElectronPlatformAPI  — IPC bridge to Electron main process
//   WebPlatformAPI       — REST fallback to local helper server
//
// Design: SSR-safe, zero macOS-specific code, graceful degradation.
// =============================================================================

import { getPlatform } from './env-detect';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface GitStatusResult {
  branch: string;
  files: Array<{ path: string; status: string }>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PlatformAPI {
  /** Read file contents as UTF-8 string */
  readFile(path: string): Promise<string>;
  /** Write UTF-8 string to file */
  writeFile(path: string, content: string): Promise<void>;
  /** List directory entries */
  listDirectory(path: string): Promise<FileInfo[]>;
  /** Check if path exists */
  exists(path: string): Promise<boolean>;
  /** Get git status for a working directory */
  gitStatus(cwd: string): Promise<GitStatusResult>;
  /** Execute a shell command */
  exec(cmd: string, cwd?: string): Promise<ExecResult>;
  /** Open URL or file in system default application */
  openExternal(url: string): Promise<void>;
  /** Read text from system clipboard */
  readClipboard(): Promise<string>;
  /** Write text to system clipboard */
  writeClipboard(text: string): Promise<void>;
}

// -----------------------------------------------------------------------------
// Error class
// -----------------------------------------------------------------------------

export class PlatformUnavailableError extends Error {
  constructor(feature: string) {
    const { runtime, os } = getPlatform();
    super(`${feature} is not available on this platform (${runtime}/${os})`);
    this.name = 'PlatformUnavailableError';
  }
}

// -----------------------------------------------------------------------------
// REST API base URL (used by WebPlatformAPI)
// -----------------------------------------------------------------------------

const REST_BASE =
  typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_HELPER_API
    ? process.env.NEXT_PUBLIC_HELPER_API
    : 'http://127.0.0.1:3456';

// -----------------------------------------------------------------------------
// Electron implementation — IPC bridge
// -----------------------------------------------------------------------------

/**
 * Helper to call into the Electron preload bridge.
 * Expects window.electron.invoke(channel, ...args).
 */
function electronInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (typeof window === 'undefined') {
    return Promise.reject(new PlatformUnavailableError('Electron IPC (SSR)'));
  }

  const bridge = (window as unknown as Record<string, unknown>).electron as
    | { invoke?: (channel: string, ...args: unknown[]) => Promise<T> }
    | undefined;

  if (!bridge?.invoke) {
    return Promise.reject(new PlatformUnavailableError('Electron IPC bridge'));
  }

  return bridge.invoke(channel, ...args);
}

class ElectronPlatformAPI implements PlatformAPI {
  async readFile(path: string): Promise<string> {
    return electronInvoke<string>('fs:readFile', path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await electronInvoke<void>('fs:writeFile', path, content);
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    return electronInvoke<FileInfo[]>('fs:listDirectory', path);
  }

  async exists(path: string): Promise<boolean> {
    return electronInvoke<boolean>('fs:exists', path);
  }

  async gitStatus(cwd: string): Promise<GitStatusResult> {
    return electronInvoke<GitStatusResult>('git:status', cwd);
  }

  async exec(cmd: string, cwd?: string): Promise<ExecResult> {
    return electronInvoke<ExecResult>('shell:exec', cmd, cwd);
  }

  async openExternal(url: string): Promise<void> {
    await electronInvoke<void>('shell:openExternal', url);
  }

  async readClipboard(): Promise<string> {
    return electronInvoke<string>('clipboard:read');
  }

  async writeClipboard(text: string): Promise<void> {
    await electronInvoke<void>('clipboard:write', text);
  }
}

// -----------------------------------------------------------------------------
// Web implementation — REST API fallback + browser APIs
// -----------------------------------------------------------------------------

async function restGet<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(endpoint, REST_BASE);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`REST ${endpoint} failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function restPost<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(new URL(endpoint, REST_BASE).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`REST ${endpoint} failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

class WebPlatformAPI implements PlatformAPI {
  async readFile(path: string): Promise<string> {
    const data = await restGet<{ content: string }>('/api/fs/read', { path });
    return data.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await restPost<{ ok: boolean }>('/api/fs/write', { path, content });
  }

  async listDirectory(path: string): Promise<FileInfo[]> {
    const data = await restGet<{ entries: FileInfo[] }>('/api/fs/list', { path });
    return data.entries;
  }

  async exists(path: string): Promise<boolean> {
    try {
      const data = await restGet<{ exists: boolean }>('/api/fs/exists', { path });
      return data.exists;
    } catch {
      return false;
    }
  }

  async gitStatus(cwd: string): Promise<GitStatusResult> {
    return restGet<GitStatusResult>('/api/git/status', { cwd });
  }

  async exec(cmd: string, cwd?: string): Promise<ExecResult> {
    return restPost<ExecResult>('/api/shell/exec', { cmd, cwd });
  }

  async openExternal(url: string): Promise<void> {
    // In web mode, open in a new tab
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new PlatformUnavailableError('openExternal');
  }

  async readClipboard(): Promise<string> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      return navigator.clipboard.readText();
    }
    throw new PlatformUnavailableError('clipboard read');
  }

  async writeClipboard(text: string): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new PlatformUnavailableError('clipboard write');
  }
}

// -----------------------------------------------------------------------------
// Singleton factory
// -----------------------------------------------------------------------------

let _api: PlatformAPI | null = null;

/**
 * Get the platform API singleton.
 * Automatically selects Electron or Web implementation based on detected runtime.
 */
export function getPlatformAPI(): PlatformAPI {
  if (!_api) {
    const { runtime } = getPlatform();
    _api = runtime === 'electron' ? new ElectronPlatformAPI() : new WebPlatformAPI();
  }
  return _api;
}

/**
 * Reset cached API instance (for testing only).
 */
export function _resetPlatformAPI(): void {
  _api = null;
}
