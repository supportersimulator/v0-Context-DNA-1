'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { getEventBus } from './event-bus';
import { getServiceUrl } from './service-registry';

// ---------------------------------------------------------------------------
// IDESettings — every setting in the system, strongly typed
//
// Convention: 'category.settingName' flat keys.
// Defaults defined in DEFAULTS below — single source of truth.
// ---------------------------------------------------------------------------

export interface IDESettings {
  // Appearance
  'appearance.theme': 'dark' | 'light' | 'system';
  'appearance.fontSize': number;
  'appearance.fontFamily': string;
  'appearance.accentColor': string;
  'appearance.compactMode': boolean;
  'appearance.colorblindMode': boolean;

  // Editor behavior
  'editor.tabSize': number;
  'editor.wordWrap': boolean;
  'editor.minimap': boolean;

  // Explorer
  'explorer.defaultSide': 'left' | 'right';
  'explorer.defaultWidth': number;
  'explorer.showHiddenFiles': boolean;

  // Synaptic / AI
  'ai.autoContext': boolean;
  'ai.streamingEnabled': boolean;
  'ai.maxTokens': number;
  'ai.localModel': string;

  // Notifications
  'notifications.enabled': boolean;
  'notifications.sound': boolean;
  'notifications.autoHideSeconds': number;

  // Backend
  'backend.apiUrl': string;
  'backend.wsUrl': string;

  // Performance
  'performance.animations': boolean;
  'performance.lazyPanels': boolean;

  // Models & Providers
  'models.enabled': Record<string, boolean>;
  'models.defaultModel': string;
  'providers.baseUrls': Record<string, string>;

  // Agent execution
  'agents.primaryMode': 'subscription' | 'api';
  'agents.autoFallback': boolean;

  // Custom env var names per provider (e.g., user has DS_KEY instead of DEEPSEEK_API_KEY)
  'providers.envKeys': Record<string, string>;

  // Keyboard
  'keyboard.customBindings': Record<string, string>;

  // Security — MCP Permission Tiers
  'security.permissionTier': 'full' | 'standard' | 'limited' | 'locked';
  'security.synapticTier': 'full' | 'standard' | 'limited' | 'locked';
  'security.confirmDestructive': boolean;
  'security.auditRetention': number;
  'security.mcpAllowedDirs': string[];
  'security.mcpBlockedCmds': string[];
}

// ---------------------------------------------------------------------------
// Defaults — single source of truth for every setting
// ---------------------------------------------------------------------------

export const SETTING_DEFAULTS: Readonly<IDESettings> = {
  'appearance.theme': 'dark',
  'appearance.fontSize': 13,
  'appearance.fontFamily': 'JetBrains Mono, monospace',
  'appearance.accentColor': '#22c55e',
  'appearance.compactMode': false,
  'appearance.colorblindMode': false,

  'editor.tabSize': 2,
  'editor.wordWrap': false,
  'editor.minimap': true,

  'explorer.defaultSide': 'left',
  'explorer.defaultWidth': 250,
  'explorer.showHiddenFiles': false,

  'ai.autoContext': true,
  'ai.streamingEnabled': true,
  'ai.maxTokens': 4096,
  'ai.localModel': 'Qwen3-14B',

  'notifications.enabled': true,
  'notifications.sound': false,
  'notifications.autoHideSeconds': 5,

  'backend.apiUrl': getServiceUrl('memory_api') || 'http://127.0.0.1:3456',
  'backend.wsUrl': '',

  'performance.animations': true,
  'performance.lazyPanels': true,

  'models.enabled': {},
  'models.defaultModel': 'anthropic/sonnet',
  'providers.baseUrls': {},

  'agents.primaryMode': 'subscription',
  'agents.autoFallback': true,
  'providers.envKeys': {},

  'keyboard.customBindings': {},

  'security.permissionTier': 'standard' as const,
  'security.synapticTier': 'limited' as const,
  'security.confirmDestructive': true,
  'security.auditRetention': 30,
  'security.mcpAllowedDirs': [] as string[],
  'security.mcpBlockedCmds': [] as string[],
};

// ---------------------------------------------------------------------------
// Setting metadata — used by the Settings panel for rendering controls
// ---------------------------------------------------------------------------

export type SettingType = 'boolean' | 'number' | 'string' | 'enum' | 'color' | 'json';

export interface SettingMeta {
  key: keyof IDESettings;
  label: string;
  description: string;
  category: string;
  type: SettingType;
  enumValues?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export const SETTING_CATEGORIES = [
  'Appearance',
  'Editor',
  'Explorer',
  'AI',
  'Security',
  'Notifications',
  'Backend',
  'Performance',
  'Keyboard',
] as const;

export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const SETTING_METADATA: SettingMeta[] = [
  // Appearance
  {
    key: 'appearance.theme',
    label: 'Theme',
    description: 'Color theme for the IDE',
    category: 'Appearance',
    type: 'enum',
    enumValues: ['dark', 'light', 'system'],
  },
  {
    key: 'appearance.fontSize',
    label: 'Font Size',
    description: 'Base font size in pixels',
    category: 'Appearance',
    type: 'number',
    min: 10,
    max: 24,
    step: 1,
  },
  {
    key: 'appearance.fontFamily',
    label: 'Font Family',
    description: 'Primary font for the editor and UI',
    category: 'Appearance',
    type: 'string',
  },
  {
    key: 'appearance.accentColor',
    label: 'Accent Color',
    description: 'Primary accent color used across the IDE',
    category: 'Appearance',
    type: 'color',
  },
  {
    key: 'appearance.compactMode',
    label: 'Compact Mode',
    description: 'Reduce padding and spacing for denser layouts',
    category: 'Appearance',
    type: 'boolean',
  },
  {
    key: 'appearance.colorblindMode',
    label: 'Colorblind Mode',
    description: 'Use blue/yellow palette instead of green/red for better deuteranopia accessibility',
    category: 'Appearance',
    type: 'boolean',
  },

  // Editor
  {
    key: 'editor.tabSize',
    label: 'Tab Size',
    description: 'Number of spaces per tab',
    category: 'Editor',
    type: 'number',
    min: 1,
    max: 8,
    step: 1,
  },
  {
    key: 'editor.wordWrap',
    label: 'Word Wrap',
    description: 'Wrap long lines instead of scrolling horizontally',
    category: 'Editor',
    type: 'boolean',
  },
  {
    key: 'editor.minimap',
    label: 'Minimap',
    description: 'Show a minimap overview of the file',
    category: 'Editor',
    type: 'boolean',
  },

  // Explorer
  {
    key: 'explorer.defaultSide',
    label: 'Default Side',
    description: 'Which side the explorer panel opens on',
    category: 'Explorer',
    type: 'enum',
    enumValues: ['left', 'right'],
  },
  {
    key: 'explorer.defaultWidth',
    label: 'Default Width',
    description: 'Default width of the explorer panel in pixels',
    category: 'Explorer',
    type: 'number',
    min: 150,
    max: 500,
    step: 10,
  },
  {
    key: 'explorer.showHiddenFiles',
    label: 'Show Hidden Files',
    description: 'Display dotfiles and hidden directories',
    category: 'Explorer',
    type: 'boolean',
  },

  // AI
  {
    key: 'ai.autoContext',
    label: 'Auto Context',
    description: 'Automatically inject context into AI conversations',
    category: 'AI',
    type: 'boolean',
  },
  {
    key: 'ai.streamingEnabled',
    label: 'Streaming',
    description: 'Stream AI responses token-by-token',
    category: 'AI',
    type: 'boolean',
  },
  {
    key: 'ai.maxTokens',
    label: 'Max Tokens',
    description: 'Maximum tokens per AI response',
    category: 'AI',
    type: 'number',
    min: 256,
    max: 32768,
    step: 256,
  },
  {
    key: 'ai.localModel',
    label: 'Local Model',
    description: 'Default local LLM model for Synaptic',
    category: 'AI',
    type: 'string',
  },

  // Notifications
  {
    key: 'notifications.enabled',
    label: 'Enable Notifications',
    description: 'Show notification toasts for system events',
    category: 'Notifications',
    type: 'boolean',
  },
  {
    key: 'notifications.sound',
    label: 'Sound',
    description: 'Play sounds with notifications',
    category: 'Notifications',
    type: 'boolean',
  },
  {
    key: 'notifications.autoHideSeconds',
    label: 'Auto-Hide Delay',
    description: 'Seconds before notifications auto-dismiss (0 = manual only)',
    category: 'Notifications',
    type: 'number',
    min: 0,
    max: 30,
    step: 1,
  },

  // Backend
  {
    key: 'backend.apiUrl',
    label: 'API URL',
    description: 'Base URL for the Context DNA backend API',
    category: 'Backend',
    type: 'string',
  },
  {
    key: 'backend.wsUrl',
    label: 'WebSocket URL',
    description: 'WebSocket URL (leave empty to derive from API URL)',
    category: 'Backend',
    type: 'string',
  },

  // Performance
  {
    key: 'performance.animations',
    label: 'Animations',
    description: 'Enable UI animations and transitions',
    category: 'Performance',
    type: 'boolean',
  },
  {
    key: 'performance.lazyPanels',
    label: 'Lazy Panel Loading',
    description: 'Only mount panels when they become visible',
    category: 'Performance',
    type: 'boolean',
  },

  // Security
  {
    key: 'security.permissionTier',
    label: 'Permission Tier',
    description: 'Controls what DesktopCommander MCP actions are allowed for user-initiated operations',
    category: 'Security',
    type: 'enum',
    enumValues: ['full', 'standard', 'limited', 'locked'],
  },
  {
    key: 'security.synapticTier',
    label: 'Synaptic Permission Tier',
    description: 'Controls what MCP actions the local LLM (Synaptic) can perform via chat',
    category: 'Security',
    type: 'enum',
    enumValues: ['full', 'standard', 'limited', 'locked'],
  },
  {
    key: 'security.confirmDestructive',
    label: 'Confirm Destructive Actions',
    description: 'Always show confirmation dialog for destructive operations (cannot be disabled)',
    category: 'Security',
    type: 'boolean',
  },
  {
    key: 'security.auditRetention',
    label: 'Audit Log Retention (days)',
    description: 'How many days to keep MCP action audit logs',
    category: 'Security',
    type: 'number',
    min: 1,
    max: 365,
    step: 1,
  },

  // Keyboard
  {
    key: 'keyboard.customBindings',
    label: 'Custom Key Bindings',
    description: 'Override default keyboard shortcuts (JSON)',
    category: 'Keyboard',
    type: 'json',
  },
];

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'contextdna_settings';

// ---------------------------------------------------------------------------
// SettingsStore — centralized, typed, persistent settings with subscriptions
//
// Design:
//   - In-memory Map<key, value> as primary store
//   - Persists overrides (non-default values) to localStorage
//   - Emits 'settings:changed' on EventBus for cross-component reactivity
//   - Internal subscriber Set for fine-grained React hook integration
//   - SSR-safe: no localStorage access until hydrated
// ---------------------------------------------------------------------------

type SettingsHandler = (key: keyof IDESettings, value: unknown, previous: unknown) => void;

class SettingsStore {
  private values: Map<keyof IDESettings, unknown> = new Map();
  private subscribers = new Set<SettingsHandler>();
  private version = 0; // incremented on every change for useSyncExternalStore

  constructor() {
    this.loadFromStorage();
  }

  // -----------------------------------------------------------------------
  // get — returns current value (or default if unset)
  // -----------------------------------------------------------------------

  get<K extends keyof IDESettings>(key: K): IDESettings[K] {
    if (this.values.has(key)) {
      return this.values.get(key) as IDESettings[K];
    }
    return SETTING_DEFAULTS[key];
  }

  // -----------------------------------------------------------------------
  // set — update a setting, persist, notify
  // -----------------------------------------------------------------------

  set<K extends keyof IDESettings>(key: K, value: IDESettings[K]): void {
    const previous = this.get(key);
    if (deepEqual(previous, value)) return;

    this.values.set(key, value);
    this.version++;
    this.persistToStorage();
    this.notify(key, value, previous);
  }

  // -----------------------------------------------------------------------
  // reset — remove override for a single key (reverts to default)
  // -----------------------------------------------------------------------

  reset(key: keyof IDESettings): void {
    const previous = this.get(key);
    this.values.delete(key);
    this.version++;
    this.persistToStorage();

    const now = this.get(key);
    if (!deepEqual(previous, now)) {
      this.notify(key, now, previous);
    }
  }

  // -----------------------------------------------------------------------
  // resetAll — clear all overrides
  // -----------------------------------------------------------------------

  resetAll(): void {
    const keys = Array.from(this.values.keys());
    this.values.clear();
    this.version++;
    this.persistToStorage();

    for (const key of keys) {
      this.notify(key, SETTING_DEFAULTS[key], undefined);
    }
  }

  // -----------------------------------------------------------------------
  // isModified — check if a key has a non-default value
  // -----------------------------------------------------------------------

  isModified(key: keyof IDESettings): boolean {
    if (!this.values.has(key)) return false;
    return !deepEqual(this.values.get(key), SETTING_DEFAULTS[key]);
  }

  // -----------------------------------------------------------------------
  // subscribe — register a handler for all setting changes. Returns unsubscribe.
  // -----------------------------------------------------------------------

  subscribe(handler: SettingsHandler): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  // -----------------------------------------------------------------------
  // export / import — settings portability
  // -----------------------------------------------------------------------

  export(): Partial<IDESettings> {
    const result: Partial<IDESettings> = {};
    for (const [key, value] of this.values.entries()) {
      (result as any)[key] = value;
    }
    return result;
  }

  import(settings: Partial<IDESettings>): void {
    for (const [key, value] of Object.entries(settings)) {
      if (key in SETTING_DEFAULTS) {
        this.set(key as keyof IDESettings, value as any);
      }
    }
  }

  // -----------------------------------------------------------------------
  // getVersion — for useSyncExternalStore snapshot identity
  // -----------------------------------------------------------------------

  getVersion(): number {
    return this.version;
  }

  // -----------------------------------------------------------------------
  // Internal: load overrides from localStorage
  // -----------------------------------------------------------------------

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(parsed)) {
          if (key in SETTING_DEFAULTS) {
            this.values.set(key as keyof IDESettings, value);
          }
        }
      }
    } catch {
      // Corrupted storage — start fresh
      console.warn('[SettingsStore] Failed to parse stored settings, using defaults');
    }
  }

  // -----------------------------------------------------------------------
  // Internal: persist overrides to localStorage
  // -----------------------------------------------------------------------

  private persistToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const overrides: Record<string, unknown> = {};
      for (const [key, value] of this.values.entries()) {
        // Only persist non-default values
        if (!deepEqual(value, SETTING_DEFAULTS[key])) {
          overrides[key] = value;
        }
      }
      if (Object.keys(overrides).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      }
    } catch {
      console.warn('[SettingsStore] Failed to persist settings');
    }
  }

  // -----------------------------------------------------------------------
  // Internal: notify subscribers + EventBus
  // -----------------------------------------------------------------------

  private notify(key: keyof IDESettings, value: unknown, previous: unknown): void {
    // Internal subscribers (React hooks)
    for (const handler of this.subscribers) {
      try {
        handler(key, value, previous);
      } catch (err) {
        console.error('[SettingsStore] Subscriber error:', err);
      }
    }

    // EventBus broadcast (cross-component, devtools, etc.)
    try {
      const bus = getEventBus();
      bus.emit('settings:changed', { key, value, previous });
    } catch {
      // EventBus not available (SSR) — silently skip
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _store: SettingsStore | null = null;

export function getSettingsStore(): SettingsStore {
  if (!_store) {
    _store = new SettingsStore();
  }
  return _store;
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * useSetting — read and write a single setting with automatic re-render.
 *
 * Uses useSyncExternalStore for tear-free reads, even during concurrent mode.
 *
 * Usage:
 *   const [fontSize, setFontSize] = useSetting('appearance.fontSize');
 */
export function useSetting<K extends keyof IDESettings>(
  key: K,
): [IDESettings[K], (value: IDESettings[K]) => void] {
  const store = getSettingsStore();

  // Snapshot function for useSyncExternalStore
  const getSnapshot = useCallback(() => {
    return { version: store.getVersion(), value: store.get(key) };
  }, [store, key]);

  // Server snapshot (defaults)
  const getServerSnapshot = useCallback(() => {
    return { version: 0, value: SETTING_DEFAULTS[key] };
  }, [key]);

  // Subscribe bridge
  const subscribeToStore = useCallback(
    (onStoreChange: () => void) => {
      return store.subscribe((changedKey) => {
        if (changedKey === key) {
          onStoreChange();
        }
      });
    },
    [store, key],
  );

  const snapshot = useSyncExternalStore(subscribeToStore, getSnapshot, getServerSnapshot);

  const setValue = useCallback(
    (value: IDESettings[K]) => {
      store.set(key, value);
    },
    [store, key],
  );

  return [snapshot.value, setValue];
}

/**
 * useSettings — returns the SettingsStore singleton for imperative access.
 *
 * Usage:
 *   const settings = useSettings();
 *   settings.set('appearance.theme', 'light');
 *   const exported = settings.export();
 */
export function useSettings(): SettingsStore {
  const storeRef = useRef<SettingsStore>(getSettingsStore());
  return storeRef.current;
}

/**
 * useSettingsVersion — triggers re-render on ANY setting change.
 * Useful for components that depend on multiple settings.
 */
export function useSettingsVersion(): number {
  const store = getSettingsStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return store.subscribe(() => onStoreChange());
    },
    [store],
  );

  const getSnapshot = useCallback(() => store.getVersion(), [store]);
  const getServerSnapshot = useCallback(() => 0, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// Utility: deep equality for plain values (not full deep-equal — sufficient
// for settings which are primitives, simple objects, or arrays)
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}
