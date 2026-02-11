'use client';

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';

// ---------------------------------------------------------------------------
// Panel Loader — React.lazy wrappers + preload infrastructure
//
// All heavy panel components are lazy-loaded. When a user hovers an Activity
// Bar icon, we trigger the preload so the chunk is already cached when they
// click. The actual <Suspense> boundary lives in the panel-factory wrapper.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Loader registry — maps panel ID to the dynamic import function
//
// Each entry is a function that returns the import() promise.
// This lets us call the loader to preload without actually mounting.
// ---------------------------------------------------------------------------

type PanelImportFn = () => Promise<{ default: ComponentType<any> }>;

const panelLoaders: Record<string, PanelImportFn> = {
  // ---- IDE panels (Electron) ----
  terminal: () =>
    import('@/components/ide/panels/terminal-panel').then((m) => ({
      default: m.TerminalPanel as ComponentType<any>,
    })),
  docker: () =>
    import('@/components/ide/panels/docker-panel').then((m) => ({
      default: m.DockerPanel as ComponentType<any>,
    })),
  explorer: () =>
    import('@/components/ide/panels/file-explorer').then((m) => ({
      default: m.FileExplorer as ComponentType<any>,
    })),
  openhands: () =>
    import('@/components/ide/panels/openhands-panel').then((m) => ({
      default: m.OpenHandsPanel as ComponentType<any>,
    })),

  // ---- Dashboard views ----
  home: () =>
    import('@/components/dashboard/views/home-view').then((m) => ({
      default: m.HomeView as ComponentType<any>,
    })),
  activity: () =>
    import('@/components/dashboard/views/activity-view').then((m) => ({
      default: m.ActivityView as ComponentType<any>,
    })),
  professor: () =>
    import('@/components/dashboard/views/professor-view').then((m) => ({
      default: m.ProfessorView as ComponentType<any>,
    })),
  search: () =>
    import('@/components/dashboard/views/search-view').then((m) => ({
      default: m.SearchView as ComponentType<any>,
    })),
  health: () =>
    import('@/components/dashboard/views/health-view').then((m) => ({
      default: m.HealthView as ComponentType<any>,
    })),
  models: () =>
    import('@/components/dashboard/views/models-view').then((m) => ({
      default: m.ModelsView as ComponentType<any>,
    })),
  install: () =>
    import('@/components/dashboard/views/install-wizard-view').then((m) => ({
      default: m.InstallWizardView as ComponentType<any>,
    })),
  synaptic: () =>
    import('@/components/dashboard/views/synaptic-split-view').then((m) => ({
      default: m.SynapticSplitView as ComponentType<any>,
    })),
  injection: () =>
    import('@/components/dashboard/views/injection-focus-view').then((m) => ({
      default: m.InjectionFocusView as ComponentType<any>,
    })),
  learnings: () =>
    import('@/components/dashboard/views/learning-panel').then((m) => ({
      default: m.LearningPanel as ComponentType<any>,
    })),
  architecture: () =>
    import('@/components/dashboard/views/architectural-awareness').then((m) => ({
      default: m.ArchitecturalAwarenessPanel as ComponentType<any>,
    })),
  voicechat: () =>
    import('@/components/dashboard/views/voice-chat-view').then((m) => ({
      default: m.VoiceChatView as ComponentType<any>,
    })),
};

// ---------------------------------------------------------------------------
// Lazy panel components — wrapped with React.lazy for use with <Suspense>
// ---------------------------------------------------------------------------

const lazyCache = new Map<string, LazyExoticComponent<ComponentType<any>>>();

/**
 * Get a React.lazy component for the given panel ID.
 * Returns undefined if the panel ID has no registered loader.
 * Components are cached — same ID always returns the same lazy reference.
 */
export function getLazyPanel(
  panelId: string,
): LazyExoticComponent<ComponentType<any>> | undefined {
  const loader = panelLoaders[panelId];
  if (!loader) return undefined;

  let cached = lazyCache.get(panelId);
  if (!cached) {
    cached = lazy(loader);
    lazyCache.set(panelId, cached);
  }
  return cached;
}

/**
 * Complete lazy panel registry for direct access.
 * Each value is a React.lazy component. Use with <Suspense fallback={...}>.
 */
export const lazyPanels: Record<
  string,
  LazyExoticComponent<ComponentType<any>>
> = new Proxy({} as any, {
  get(_target, prop: string) {
    return getLazyPanel(prop);
  },
  has(_target, prop: string) {
    return prop in panelLoaders;
  },
  ownKeys() {
    return Object.keys(panelLoaders);
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    if (prop in panelLoaders) {
      return { configurable: true, enumerable: true, writable: false };
    }
    return undefined;
  },
});

// ---------------------------------------------------------------------------
// Preloading — trigger the dynamic import ahead of time
// ---------------------------------------------------------------------------

/** Set of panel IDs already preloaded (or in-progress) */
const preloaded = new Set<string>();

/**
 * Preload a panel's chunk. Call this on hover over an Activity Bar icon
 * so the component is ready when the user clicks.
 *
 * Safe to call multiple times — only triggers the import once.
 */
export function preloadPanel(panelId: string): void {
  if (preloaded.has(panelId)) return;

  const loader = panelLoaders[panelId];
  if (!loader) return;

  preloaded.add(panelId);

  // Fire-and-forget the import — the browser caches the chunk
  loader().catch(() => {
    // Import failed — remove from preloaded so it can be retried
    preloaded.delete(panelId);
  });
}

/**
 * Preload multiple panels at once. Useful for preloading a workspace's
 * panel set during idle time.
 */
export function preloadPanels(panelIds: string[]): void {
  for (const id of panelIds) {
    preloadPanel(id);
  }
}

/**
 * Returns all registered panel IDs that have lazy loaders.
 */
export function getLoadablePanelIds(): string[] {
  return Object.keys(panelLoaders);
}

/**
 * Check if a panel ID has a registered lazy loader.
 */
export function hasLazyLoader(panelId: string): boolean {
  return panelId in panelLoaders;
}
