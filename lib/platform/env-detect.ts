// =============================================================================
// Platform / OS / Runtime detection — SSR-safe, cross-platform
// =============================================================================

export type OS = 'macos' | 'windows' | 'linux' | 'unknown';
export type Runtime = 'electron' | 'web' | 'tauri';

export interface PlatformInfo {
  os: OS;
  runtime: Runtime;
  /** Command key label: '⌘' on macOS, 'Ctrl' on others */
  modKey: string;
  /** Modifier key code for keybindings */
  modKeyCode: 'Meta' | 'Control';
  /** Does this platform have native file system access? */
  hasFileSystem: boolean;
  /** Does this platform have a native terminal? */
  hasTerminal: boolean;
  /** Does this platform have native git access? */
  hasGit: boolean;
  /** Is Docker likely available? */
  hasDocker: boolean;
  /** Can run local LLM (needs GPU or large memory)? */
  hasLocalLLM: boolean;
  /** User home directory (if available) */
  homeDir: string | null;
}

// SSR-safe defaults: assume web on unknown OS
const SSR_DEFAULTS: PlatformInfo = {
  os: 'unknown',
  runtime: 'web',
  modKey: 'Ctrl',
  modKeyCode: 'Control',
  hasFileSystem: false,
  hasTerminal: false,
  hasGit: false,
  hasDocker: false,
  hasLocalLLM: false,
  homeDir: null,
};

// -----------------------------------------------------------------------------
// Detection helpers
// -----------------------------------------------------------------------------

/**
 * Detect OS from Electron bridge first, then navigator.
 * Handles both navigator.userAgent and navigator.platform.
 */
function detectOS(): OS {
  if (typeof window === 'undefined') return 'unknown';

  // Electron bridge may expose platform directly
  const electronBridge = (window as unknown as Record<string, unknown>).electron as
    | Record<string, unknown>
    | undefined;

  if (electronBridge?.platform) {
    const p = String(electronBridge.platform).toLowerCase();
    if (p === 'darwin') return 'macos';
    if (p === 'win32') return 'windows';
    if (p === 'linux') return 'linux';
  }

  // Fallback: navigator (userAgent preferred, platform as backup)
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || navigator.platform || '';
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';

  return 'unknown';
}

/**
 * Detect runtime environment.
 * Priority: Electron > Tauri > Web
 */
function detectRuntime(): Runtime {
  if (typeof window === 'undefined') return 'web';

  const win = window as unknown as Record<string, unknown>;

  // Electron: preload script exposes window.electron
  const electronBridge = win.electron as Record<string, unknown> | undefined;
  if (electronBridge?.isElectron === true) return 'electron';

  // Tauri: injected __TAURI__ global
  if (win.__TAURI__ !== undefined) return 'tauri';

  return 'web';
}

/**
 * Attempt to read home directory from Electron bridge.
 */
function detectHomeDir(): string | null {
  if (typeof window === 'undefined') return null;

  const electronBridge = (window as unknown as Record<string, unknown>).electron as
    | Record<string, unknown>
    | undefined;

  if (electronBridge?.homeDir) {
    return String(electronBridge.homeDir);
  }

  return null;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Build a fresh PlatformInfo by probing the environment.
 * Safe to call during SSR (returns conservative defaults).
 */
export function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined') return { ...SSR_DEFAULTS };

  const os = detectOS();
  const runtime = detectRuntime();
  const isMac = os === 'macos';
  const isNative = runtime === 'electron' || runtime === 'tauri';

  return {
    os,
    runtime,
    modKey: isMac ? '\u2318' : 'Ctrl',      // ⌘ or Ctrl
    modKeyCode: isMac ? 'Meta' : 'Control',
    hasFileSystem: isNative,
    hasTerminal: isNative,
    hasGit: isNative,
    hasDocker: isNative,
    hasLocalLLM: isNative,
    homeDir: detectHomeDir(),
  };
}

// Singleton cache
let _cached: PlatformInfo | null = null;

/**
 * Cached singleton — detect once, reuse forever.
 * Safe to call from any context (SSR, browser, Electron).
 */
export function getPlatform(): PlatformInfo {
  if (!_cached) {
    _cached = detectPlatform();
  }
  return _cached;
}

/**
 * Reset cached platform info (for testing only).
 */
export function _resetPlatformCache(): void {
  _cached = null;
}
