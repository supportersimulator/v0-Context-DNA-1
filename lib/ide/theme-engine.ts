'use client';

import { getSettingsStore } from './settings-store';
import { getEventBus } from './event-bus';

// ---------------------------------------------------------------------------
// Theme — full color definition for the IDE
//
// Colors use CSS hex values. The theme engine applies them as CSS custom
// properties on document.documentElement, matching the token names already
// established in globals.css (:root variables).
// ---------------------------------------------------------------------------

export interface ThemeColors {
  // Surface hierarchy
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgHover: string;
  bgActive: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  borderSubtle: string;
  borderDefault: string;
  borderFocus: string;

  // Accent
  accent: string;
  accentHover: string;
  accentMuted: string;

  // Status
  success: string;
  warning: string;
  error: string;
  info: string;

  // IDE-specific
  tabActiveBg: string;
  tabInactiveBg: string;
  statusBarBg: string;
  activityBarBg: string;
  sidebarBg: string;

  // Git / file decoration
  gitAdded: string;
  gitModified: string;
  gitDeleted: string;
  gitRenamed: string;
  gitUntracked: string;
  gitIgnored: string;
  gitConflicting: string;
  gitSubmodule: string;
}

export interface Theme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  colors: ThemeColors;
}

// ---------------------------------------------------------------------------
// Built-in Themes
// ---------------------------------------------------------------------------

/**
 * Context DNA Dark — the default theme.
 * Green accent on deep dark. Matches existing globals.css exactly.
 */
export const contextDNADark: Theme = {
  id: 'contextdna-dark',
  name: 'Context DNA Dark',
  mode: 'dark',
  colors: {
    bgBase: '#0a0a0f',
    bgSurface: '#111118',
    bgElevated: '#1a1a24',
    bgHover: '#1e1e28',
    bgActive: '#16161d',

    textPrimary: '#e5e5e5',
    textSecondary: '#a1a1aa',
    textMuted: '#6b6b75',

    borderSubtle: '#1e1e28',
    borderDefault: '#2a2a35',
    borderFocus: '#22c55e',

    accent: '#22c55e',
    accentHover: '#16a34a',
    accentMuted: '#22c55e33',

    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',

    tabActiveBg: '#1a1a24',
    tabInactiveBg: '#111118',
    statusBarBg: '#0a0a0f',
    activityBarBg: '#0a0a0f',
    sidebarBg: '#0a0a0f',

    gitAdded: '#2ea043',
    gitModified: '#0078d4',
    gitDeleted: '#f85149',
    gitRenamed: '#73c991',
    gitUntracked: '#73c991',
    gitIgnored: '#6b6b75',
    gitConflicting: '#e3b341',
    gitSubmodule: '#8b5cf6',
  },
};

/**
 * Context DNA Light — light variant with green accent.
 */
export const contextDNALight: Theme = {
  id: 'contextdna-light',
  name: 'Context DNA Light',
  mode: 'light',
  colors: {
    bgBase: '#ffffff',
    bgSurface: '#f8f8fa',
    bgElevated: '#ffffff',
    bgHover: '#f0f0f4',
    bgActive: '#e8e8ee',

    textPrimary: '#1a1a2e',
    textSecondary: '#4a4a5a',
    textMuted: '#8b8b9a',

    borderSubtle: '#e8e8ee',
    borderDefault: '#d4d4dc',
    borderFocus: '#16a34a',

    accent: '#16a34a',
    accentHover: '#15803d',
    accentMuted: '#16a34a22',

    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    info: '#2563eb',

    tabActiveBg: '#ffffff',
    tabInactiveBg: '#f0f0f4',
    statusBarBg: '#16a34a',
    activityBarBg: '#f8f8fa',
    sidebarBg: '#f8f8fa',

    gitAdded: '#1a7f37',
    gitModified: '#0550ae',
    gitDeleted: '#cf222e',
    gitRenamed: '#116329',
    gitUntracked: '#116329',
    gitIgnored: '#8b8b9a',
    gitConflicting: '#9a6700',
    gitSubmodule: '#6639ba',
  },
};

/**
 * Midnight — deep blue-black for late night sessions.
 */
export const midnight: Theme = {
  id: 'midnight',
  name: 'Midnight',
  mode: 'dark',
  colors: {
    bgBase: '#0b0d14',
    bgSurface: '#10131c',
    bgElevated: '#171b27',
    bgHover: '#1c2030',
    bgActive: '#141825',

    textPrimary: '#d4d9e8',
    textSecondary: '#8891a8',
    textMuted: '#5a6380',

    borderSubtle: '#1c2030',
    borderDefault: '#252b3d',
    borderFocus: '#6366f1',

    accent: '#6366f1',
    accentHover: '#4f46e5',
    accentMuted: '#6366f133',

    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',

    tabActiveBg: '#171b27',
    tabInactiveBg: '#10131c',
    statusBarBg: '#0b0d14',
    activityBarBg: '#0b0d14',
    sidebarBg: '#0b0d14',

    gitAdded: '#3fb950',
    gitModified: '#58a6ff',
    gitDeleted: '#f85149',
    gitRenamed: '#7ee787',
    gitUntracked: '#7ee787',
    gitIgnored: '#5a6380',
    gitConflicting: '#d29922',
    gitSubmodule: '#a78bfa',
  },
};

// ---------------------------------------------------------------------------
// Theme registry
// ---------------------------------------------------------------------------

const BUILTIN_THEMES: Theme[] = [contextDNADark, contextDNALight, midnight];

let _activeTheme: Theme = contextDNADark;

// ---------------------------------------------------------------------------
// getAvailableThemes — list all registered themes
// ---------------------------------------------------------------------------

export function getAvailableThemes(): Theme[] {
  return [...BUILTIN_THEMES];
}

// ---------------------------------------------------------------------------
// getCurrentTheme — returns the active theme
// ---------------------------------------------------------------------------

export function getCurrentTheme(): Theme {
  return _activeTheme;
}

// ---------------------------------------------------------------------------
// getThemeById — find a theme by ID
// ---------------------------------------------------------------------------

export function getThemeById(id: string): Theme | undefined {
  return BUILTIN_THEMES.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// applyTheme — sets CSS custom properties on :root
//
// Maps Theme.colors to the CSS variable names already used in globals.css.
// This means existing Tailwind classes and component styles continue to work.
// ---------------------------------------------------------------------------

export function applyTheme(theme: Theme): void {
  _activeTheme = theme;

  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const c = theme.colors;

  // Surface hierarchy
  root.style.setProperty('--bg-base', c.bgBase);
  root.style.setProperty('--bg-surface', c.bgSurface);
  root.style.setProperty('--bg-elevated', c.bgElevated);
  root.style.setProperty('--bg-hover', c.bgHover);
  root.style.setProperty('--bg-active', c.bgActive);

  // Core theme tokens (shadcn-compatible)
  root.style.setProperty('--background', c.bgBase);
  root.style.setProperty('--foreground', c.textPrimary);
  root.style.setProperty('--card', c.bgActive);
  root.style.setProperty('--card-foreground', c.textPrimary);
  root.style.setProperty('--popover', c.bgElevated);
  root.style.setProperty('--popover-foreground', c.textPrimary);

  // Accent / primary
  root.style.setProperty('--primary', c.accent);
  root.style.setProperty('--primary-foreground', c.bgBase);
  root.style.setProperty('--secondary', c.bgSurface);
  root.style.setProperty('--secondary-foreground', c.textPrimary);
  root.style.setProperty('--muted', c.bgHover);
  root.style.setProperty('--muted-foreground', c.textMuted);
  root.style.setProperty('--accent', c.accentHover);
  root.style.setProperty('--accent-foreground', c.bgBase);

  // Status
  root.style.setProperty('--destructive', c.error);
  root.style.setProperty('--warning', c.warning);
  root.style.setProperty('--info', c.info);
  root.style.setProperty('--success', c.success);

  // Borders
  root.style.setProperty('--border', c.borderDefault);
  root.style.setProperty('--input', c.bgHover);
  root.style.setProperty('--ring', c.accent);

  // Sidebar
  root.style.setProperty('--sidebar', c.sidebarBg);
  root.style.setProperty('--sidebar-foreground', c.textPrimary);
  root.style.setProperty('--sidebar-primary', c.accent);
  root.style.setProperty('--sidebar-primary-foreground', c.bgBase);
  root.style.setProperty('--sidebar-accent', c.accentHover);
  root.style.setProperty('--sidebar-accent-foreground', c.bgBase);
  root.style.setProperty('--sidebar-border', c.borderDefault);
  root.style.setProperty('--sidebar-ring', c.accent);

  // Dockview overrides
  root.style.setProperty('--dv-background-color', c.bgBase);
  root.style.setProperty('--dv-paneview-header-border-color', c.borderDefault);
  root.style.setProperty('--dv-tabs-and-actions-container-background-color', c.bgSurface);
  root.style.setProperty('--dv-activegroup-visiblepanel-tab-background-color', c.tabActiveBg);
  root.style.setProperty('--dv-activegroup-visiblepanel-tab-color', c.textPrimary);
  root.style.setProperty('--dv-activegroup-hiddenpanel-tab-background-color', c.bgSurface);
  root.style.setProperty('--dv-activegroup-hiddenpanel-tab-color', c.textMuted);
  root.style.setProperty('--dv-inactivegroup-visiblepanel-tab-background-color', c.bgActive);
  root.style.setProperty('--dv-inactivegroup-visiblepanel-tab-color', c.textMuted);
  root.style.setProperty('--dv-inactivegroup-hiddenpanel-tab-background-color', c.bgSurface);
  root.style.setProperty('--dv-inactivegroup-hiddenpanel-tab-color', c.textMuted);
  root.style.setProperty('--dv-tab-divider-color', c.borderDefault);
  root.style.setProperty('--dv-separator-border', c.borderDefault);
  root.style.setProperty('--dv-group-view-background-color', c.bgBase);
  root.style.setProperty('--dv-tabs-container-scrollbar-color', c.accent);
  root.style.setProperty('--dv-drag-over-background-color', c.accentMuted);
  root.style.setProperty('--dv-drag-over-border-color', c.accent);

  // Git / file decoration colors
  root.style.setProperty('--ide-color-git-added', c.gitAdded);
  root.style.setProperty('--ide-color-git-modified', c.gitModified);
  root.style.setProperty('--ide-color-git-deleted', c.gitDeleted);
  root.style.setProperty('--ide-color-git-renamed', c.gitRenamed);
  root.style.setProperty('--ide-color-git-untracked', c.gitUntracked);
  root.style.setProperty('--ide-color-git-ignored', c.gitIgnored);
  root.style.setProperty('--ide-color-git-conflicting', c.gitConflicting);
  root.style.setProperty('--ide-color-git-submodule', c.gitSubmodule);

  // Accent color override — allow user-configured accent
  const store = getSettingsStore();
  const userAccent = store.get('appearance.accentColor');
  if (userAccent && userAccent !== '#22c55e') {
    root.style.setProperty('--primary', userAccent);
    root.style.setProperty('--ring', userAccent);
    root.style.setProperty('--sidebar-primary', userAccent);
    root.style.setProperty('--sidebar-ring', userAccent);
    root.style.setProperty('--dv-tabs-container-scrollbar-color', userAccent);
    root.style.setProperty('--dv-drag-over-border-color', userAccent);
  }

  // Colorblind mode — swap green/red for blue/yellow (deuteranopia safe)
  if (store.get('appearance.colorblindMode')) {
    root.style.setProperty('--ide-color-git-added', '#2563eb');     // blue
    root.style.setProperty('--ide-color-git-deleted', '#eab308');   // yellow
    root.style.setProperty('--ide-color-git-modified', '#60a5fa');  // light blue
    root.style.setProperty('--ide-color-git-untracked', '#60a5fa');
    root.style.setProperty('--ide-color-git-renamed', '#93c5fd');
    root.style.setProperty('--success', '#2563eb');
    root.style.setProperty('--destructive', '#eab308');
  }

  // Emit theme:changed event
  try {
    const bus = getEventBus();
    bus.emit('theme:changed', { theme: theme.id, mode: theme.mode });
  } catch {
    // SSR or bus not available
  }
}

// ---------------------------------------------------------------------------
// resolveThemeFromSettings — pick theme based on current settings
// ---------------------------------------------------------------------------

export function resolveThemeFromSettings(): Theme {
  const store = getSettingsStore();
  const pref = store.get('appearance.theme');

  if (pref === 'system') {
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? contextDNADark : contextDNALight;
    }
    return contextDNADark; // SSR fallback
  }

  if (pref === 'light') return contextDNALight;
  return contextDNADark; // default
}

// ---------------------------------------------------------------------------
// initThemeEngine — call once at app startup to:
//   1. Apply the theme from settings
//   2. Listen for setting changes and re-apply
//   3. Listen for system color scheme changes (when theme = 'system')
// ---------------------------------------------------------------------------

let _initialized = false;
let _mediaQueryCleanup: (() => void) | null = null;

export function initThemeEngine(): () => void {
  if (_initialized) return () => {};

  _initialized = true;

  // Apply initial theme
  applyTheme(resolveThemeFromSettings());

  // React to setting changes
  const store = getSettingsStore();
  const unsubSettings = store.subscribe((key) => {
    if (key === 'appearance.theme' || key === 'appearance.accentColor' || key === 'appearance.colorblindMode') {
      applyTheme(resolveThemeFromSettings());
    }
  });

  // React to OS color scheme changes (for 'system' theme)
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (store.get('appearance.theme') === 'system') {
        applyTheme(resolveThemeFromSettings());
      }
    };
    mq.addEventListener('change', handler);
    _mediaQueryCleanup = () => mq.removeEventListener('change', handler);
  }

  // Return cleanup function
  return () => {
    _initialized = false;
    unsubSettings();
    if (_mediaQueryCleanup) {
      _mediaQueryCleanup();
      _mediaQueryCleanup = null;
    }
  };
}
