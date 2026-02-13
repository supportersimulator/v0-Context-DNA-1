'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewReadyEvent, DockviewApi, SerializedDockview } from 'dockview';
import { RotateCcw } from 'lucide-react';
import { useResponsive } from '@/lib/contexts/responsive-context';
import { ElectronWindowControls } from '@/components/electron/electron-window-controls';
import { panelComponents, getAllPanelMetadata } from './panel-factory';
import { RightHeaderActions } from './panel-header';
import { WorkspaceSlots, type WorkspaceConfig } from './workspace-slots';
import { MobileLayout } from './mobile-layout';
import { ExplorerShell } from './explorer-shell';
import { ActivityBar, type ActivityBadge } from './activity-bar';
import { StatusBar } from './status-bar';
import { CommandPalette, useCommandPalette, createDefaultCommands } from './command-palette';
import { ToastContainer } from './notification-center';
import { OfflineIndicator } from './offline-indicator';
import { useKeybindingInit, useKeybindings, useKeyContext } from '@/lib/ide/keybinding-registry';
import { initThemeEngine } from '@/lib/ide/theme-engine';
import { useLayoutPersistence } from '@/lib/ide/panel-lifecycle';
import { useDiagnostics } from '@/lib/hooks/use-diagnostics';
import { useEighthIntelligenceStatus } from '@/lib/hooks/use-eighth-intelligence';
import { useRealtimeBadges } from '@/lib/hooks/use-realtime-badges';
import { InlineAssistant } from './inline-assistant';
import { useActiveFile } from '@/lib/ide/editor-store';

// ---------------------------------------------------------------------------
// Layout persistence (single layout — DashboardShell handles page switching)
// ---------------------------------------------------------------------------
const LAYOUT_STORAGE_KEY = 'contextdna_dockview_layout';

// Layout schema version — bump when panel IDs change to invalidate stale layouts
const LAYOUT_VERSION = 1;
const LAYOUT_VERSION_KEY = 'contextdna_dockview_layout_v';

/** Envelope wrapping the serialized dockview layout in localStorage. */
interface LayoutEnvelope {
  version: number;
  layout: SerializedDockview;
  savedAt: number;
}

function saveLayout(layout: SerializedDockview) {
  try {
    const envelope: LayoutEnvelope = {
      version: LAYOUT_VERSION,
      layout,
      savedAt: Date.now(),
    };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(envelope));
    localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
  } catch {
    /* storage full -- silent */
  }
}

function clearSavedLayout() {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    localStorage.removeItem(LAYOUT_VERSION_KEY);
  } catch {
    /* silent */
  }
}

function loadLayout(): SerializedDockview | null {
  if (typeof window === 'undefined') return null;
  try {
    const savedVersion = localStorage.getItem(LAYOUT_VERSION_KEY);
    if (savedVersion !== String(LAYOUT_VERSION)) {
      // Schema changed — discard stale layout
      clearSavedLayout();
      localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
      return null;
    }
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    // Support both envelope format and legacy bare SerializedDockview
    if (parsed && typeof parsed === 'object' && 'layout' in parsed && 'version' in parsed) {
      const envelope = parsed as LayoutEnvelope;
      if (envelope.version !== LAYOUT_VERSION) {
        clearSavedLayout();
        return null;
      }
      return envelope.layout;
    }

    // Legacy: bare SerializedDockview stored directly
    return parsed as SerializedDockview;
  } catch {
    /* corrupted -- ignore */
    clearSavedLayout();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Debounce helper — returns [debouncedFn, cancel]
// ---------------------------------------------------------------------------
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): [T, () => void] {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: unknown[]) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as T;
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return [debounced, cancel];
}

// ---------------------------------------------------------------------------
// Default layout: DashboardShell takes full view
// ---------------------------------------------------------------------------
function applyDefaultLayout(api: DockviewApi, initialTab?: string) {
  api.clear();
  const allMeta = getAllPanelMetadata();
  api.addPanel({
    id: 'dashboard-shell',
    component: 'dashboard-shell',
    title: allMeta['dashboard-shell']?.label ?? 'Context DNA',
    params: initialTab ? { initialTab } : undefined,
  });
}

// ---------------------------------------------------------------------------
// DockviewShell — thin container around DockviewReact
//
// DashboardShell is the main panel and handles its own navigation
// (Dashboard / Workspace / Live View). Its header bar is the TOPMOST element.
// Users can dock additional panels around it via dockview tab actions.
// ---------------------------------------------------------------------------

export interface DockviewShellProps {
  /** Optional initial tab to activate in DashboardShell (e.g. 'home', 'synaptic', 'injection'). */
  initialTab?: string;
}

export function DockviewShell({ initialTab }: DockviewShellProps = {}) {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const dockviewApiRef = useRef<{ toJSON(): unknown } | null>(null);
  const { state } = useResponsive();
  const isMobileView = state.isMobile || state.deviceMode === 'electron-mobile';

  // ------- Infrastructure: keybindings, theme, layout persistence -------
  useKeybindingInit();

  useEffect(() => {
    const cleanup = initThemeEngine();
    return cleanup;
  }, []);

  useLayoutPersistence(dockviewApiRef);

  // Restore saved UI scale
  useEffect(() => {
    try {
      const saved = localStorage.getItem('contextdna_ide_ui_scale');
      if (saved) {
        document.documentElement.style.setProperty('--ide-ui-scale', saved);
      }
    } catch {}
  }, []);

  // Keep ref in sync with dockview API
  useEffect(() => {
    dockviewApiRef.current = dockviewApi;
  }, [dockviewApi]);

  // ------- Explorer visibility (lifted for Activity Bar control) -------
  const [explorerVisible, setExplorerVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = localStorage.getItem('contextdna_explorer_prefs');
      if (raw) return JSON.parse(raw).visible ?? false;
    } catch { /* corrupted */ }
    return false;
  });

  // ------- Active panel tracking for Activity Bar -------
  const [activePanelIds, setActivePanelIds] = useState<string[]>(['dashboard-shell']);

  // ------- Real-time diagnostics + 8th Intelligence status for badges -------
  const diagnostics = useDiagnostics();
  const eighthIntel = useEighthIntelligenceStatus();

  // ------- Activity Bar badges (real-time via WebSocket + HTTP fallback) -------
  const realtimeBadges = useRealtimeBadges();

  // Merge: real-time badges take priority, fall back to local diagnostics/8th intel
  const activityBadges = useMemo<Record<string, ActivityBadge>>(() => {
    // Start with local diagnostics as baseline
    const badges: Record<string, ActivityBadge> = {};
    if (diagnostics.errors > 0) {
      badges['health'] = { count: diagnostics.errors, variant: 'error' };
    } else if (diagnostics.warnings > 0) {
      badges['health'] = { count: diagnostics.warnings, variant: 'warning' };
    }
    if (eighthIntel.active) {
      badges['synaptic'] = { count: 0, dot: true, variant: 'success' };
    }
    // Overlay real-time badges (WebSocket data overrides local)
    return { ...badges, ...realtimeBadges };
  }, [diagnostics.errors, diagnostics.warnings, eighthIntel.active, realtimeBadges]);

  // ------- Command palette -------
  const { isOpen: cmdPaletteOpen, close: closeCmdPalette } = useCommandPalette();

  // ------- Inline LLM Assistant -------
  const [assistantOpen, setAssistantOpen] = useState(false);
  const activeFile = useActiveFile();

  // ------- Debounced auto-save on layout change (300ms) -------
  useEffect(() => {
    if (!dockviewApi) return;
    const [debouncedSave, cancelSave] = debounce(() => {
      saveLayout(dockviewApi.toJSON());
    }, 300);
    const disposable = dockviewApi.onDidLayoutChange(() => {
      debouncedSave();
    });
    return () => {
      cancelSave();
      disposable.dispose();
    };
  }, [dockviewApi]);

  // ------- Reset layout to default -------
  const resetLayoutToDefault = useCallback(() => {
    clearSavedLayout();
    if (dockviewApi) {
      applyDefaultLayout(dockviewApi);
    }
  }, [dockviewApi]);

  // ------- Track active panels for Activity Bar -------
  useEffect(() => {
    if (!dockviewApi) return;
    const update = () => {
      setActivePanelIds(dockviewApi.panels.map((p) => p.id));
    };
    update();
    const disposable = dockviewApi.onDidLayoutChange(update);
    return () => disposable.dispose();
  }, [dockviewApi]);

  // ------- Toggle dockview panel (add/remove) -------
  const togglePanel = useCallback(
    (panelId: string) => {
      if (!dockviewApi) return;
      const existing = dockviewApi.panels.find((p) => p.id === panelId);
      if (existing) {
        if (dockviewApi.panels.length > 1) {
          dockviewApi.removePanel(existing);
        }
      } else {
        const allMeta = getAllPanelMetadata();
        dockviewApi.addPanel({
          id: panelId,
          component: panelId,
          title: allMeta[panelId]?.label ?? panelId,
        });
      }
    },
    [dockviewApi],
  );

  // ------- Command palette commands -------
  const commands = useMemo(
    () =>
      createDefaultCommands({
        toggleExplorer: () => setExplorerVisible((v: boolean) => !v),
        toggleTerminal: () => togglePanel('terminal'),
        toggleHealth: () => togglePanel('health'),
        toggleSynapticChat: () => togglePanel('synaptic'),
        toggleInjection: () => togglePanel('injection'),
        toggleSearch: () => togglePanel('search'),
        toggleSwarm: () => togglePanel('swarm'),
        toggleHarmonizer: () => togglePanel('harmonizer'),
        toggleEvidence: () => togglePanel('evidence'),
        toggleEditor: () => togglePanel('editor'),
        toggleGit: () => togglePanel('git'),
        toggleDiff: () => togglePanel('diff'),
        toggleProblems: () => togglePanel('problems'),
        toggleFindReplace: () => togglePanel('find-replace'),
        toggleMemory: () => togglePanel('memory'),
        toggleTimeline: () => togglePanel('timeline'),
        toggleDebug: () => togglePanel('debug'),
        toggleExtensions: () => togglePanel('extensions'),
        toggleCollaboration: () => togglePanel('collaboration'),
        toggleMinimap: () => togglePanel('minimap'),
        toggleContextBus: () => togglePanel('context-bus'),
        toggleSync: () => togglePanel('sync'),
        toggleInjectionViewer: () => togglePanel('injection-viewer'),
        toggleEpistemic: () => togglePanel('epistemic'),
        toggleLLMOrchestration: () => togglePanel('llm-orchestration'),
        toggleAgents: () => togglePanel('agents'),
        toggleLibrarian: () => togglePanel('librarian'),
        toggleSettings: () => togglePanel('settings'),
        toggleNotifications: () => togglePanel('notifications'),
        toggleInlineAssistant: () => setAssistantOpen((v) => !v),
        saveLayout: () => { if (dockviewApi) saveLayout(dockviewApi.toJSON()); },
        resetLayout: resetLayoutToDefault,
      }),
    [togglePanel, dockviewApi, resetLayoutToDefault],
  );

  // ------- Keybinding handlers (wired to keybinding-registry) -------
  useKeybindings({
    'view.toggleExplorer': () => setExplorerVisible((v: boolean) => !v),
    'view.toggleTerminal': () => togglePanel('terminal'),
    'view.commandPalette': () => {}, // handled by command-palette's own useEffect
    'ai.inlineAssistant': () => setAssistantOpen((v) => !v),
    'workspace.save': () => {
      if (dockviewApi) saveLayout(dockviewApi.toJSON());
    },
    'view.zoomIn': () => {
      const root = document.documentElement;
      const current = parseFloat(getComputedStyle(root).getPropertyValue('--ide-ui-scale')) || 1;
      const next = Math.min(1.5, +(current + 0.1).toFixed(1));
      root.style.setProperty('--ide-ui-scale', String(next));
      try { localStorage.setItem('contextdna_ide_ui_scale', String(next)); } catch {}
    },
    'view.zoomOut': () => {
      const root = document.documentElement;
      const current = parseFloat(getComputedStyle(root).getPropertyValue('--ide-ui-scale')) || 1;
      const next = Math.max(0.8, +(current - 0.1).toFixed(1));
      root.style.setProperty('--ide-ui-scale', String(next));
      try { localStorage.setItem('contextdna_ide_ui_scale', String(next)); } catch {}
    },
    'view.zoomReset': () => {
      document.documentElement.style.setProperty('--ide-ui-scale', '1');
      try { localStorage.setItem('contextdna_ide_ui_scale', '1'); } catch {}
    },
  });

  // ------- Keybinding context values -------
  useKeyContext('explorerVisible', explorerVisible);
  useKeyContext('commandPaletteVisible', cmdPaletteOpen);

  // ------- onReady handler -------
  const handleReady = useCallback((event: DockviewReadyEvent) => {
    setDockviewApi(event.api);

    const saved = loadLayout();
    if (saved) {
      try {
        event.api.fromJSON(saved);
      } catch {
        applyDefaultLayout(event.api, initialTab);
      }
    } else {
      applyDefaultLayout(event.api, initialTab);
    }
  }, [initialTab]);

  // ------- Workspace snapshot/restore -------
  const snapshotCurrentState = useCallback((): {
    layouts: Record<string, object | null>;
    activePage: string;
  } => {
    if (!dockviewApi) {
      return { layouts: { main: null }, activePage: 'dashboard' };
    }
    return {
      layouts: { main: dockviewApi.toJSON() },
      activePage: 'dashboard',
    };
  }, [dockviewApi]);

  const restoreWorkspace = useCallback(
    (config: WorkspaceConfig) => {
      if (!dockviewApi) return;
      const layout =
        config.layouts['main'] ??
        config.layouts['synaptic'] ??
        config.layouts['dashboard'];
      if (layout) {
        try {
          dockviewApi.fromJSON(layout as SerializedDockview);
        } catch {
          applyDefaultLayout(dockviewApi);
        }
      } else {
        applyDefaultLayout(dockviewApi);
      }
    },
    [dockviewApi],
  );

  // ------- Mobile fallback -------
  if (isMobileView) {
    return <MobileLayout />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f]">
      {/* ================================================================ */}
      {/* Electron title bar — outermost border, like VS Code/Cursor       */}
      {/* Left: macOS traffic lights (close/minimize/maximize)             */}
      {/* Right: Workspace slots (1, 2, 3, +)                             */}
      {/* Only visible in Electron. Web users go straight to DashboardShell */}
      {/* ================================================================ */}
      {state.isElectron && (
        <div className="flex items-center h-7 bg-[#0a0a0f] border-b border-[#2a2a35]/30 flex-shrink-0 select-none app-drag-region">
          {/* macOS traffic lights spacer */}
          <div className="w-[78px] flex-shrink-0" />

          {/* Draggable spacer (window dragging) */}
          <div className="flex-1" />

          {/* Workspace slots + reset layout — right side, subtle buttons */}
          <div className="flex items-center px-2 gap-1 no-drag">
            <WorkspaceSlots
              snapshotCurrentState={snapshotCurrentState}
              restoreWorkspace={restoreWorkspace}
            />
            <button
              onClick={resetLayoutToDefault}
              title="Reset layout to default"
              className="flex items-center justify-center w-5 h-5 rounded text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24] transition-colors duration-100"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Window controls (right edge) */}
          <div className="no-drag">
            <ElectronWindowControls />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Offline / degraded banner — below title bar, above dockview     */}
      {/* ================================================================ */}
      <OfflineIndicator />

      {/* ================================================================ */}
      {/* Main IDE area: Activity Bar + Explorer + Dockview + Status Bar   */}
      {/* ================================================================ */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex flex-row">
          {/* Activity Bar — outermost left icon strip (Electron only) */}
          {state.isElectron && (
            <ActivityBar
              onToggleExplorer={() => setExplorerVisible((v: boolean) => !v)}
              explorerVisible={explorerVisible}
              onTogglePanel={togglePanel}
              activePanelIds={activePanelIds}
              badges={activityBadges}
            />
          )}

          {/* Center: ExplorerShell + DockviewReact */}
          <div className="flex-1 min-w-0 min-h-0 relative">
            <ExplorerShell
              visible={explorerVisible}
              onVisibleChange={setExplorerVisible}
            >
              <div className="h-full w-full dockview-theme-dark">
                <DockviewReact
                  className="dockview-theme-dark"
                  onReady={handleReady}
                  components={panelComponents}
                  rightHeaderActionsComponent={RightHeaderActions}
                  floatingGroupBounds="boundedWithinViewport"
                />
              </div>
            </ExplorerShell>

            {/* Reset Layout button — web mode (Electron has it in title bar) */}
            {!state.isElectron && (
              <button
                onClick={resetLayoutToDefault}
                title="Reset layout to default (Ctrl+Shift+P → Reset Layout)"
                className="absolute top-1 right-1 z-30 flex items-center justify-center w-6 h-6 rounded opacity-30 hover:opacity-100 text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24]/80 transition-all duration-150"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Status Bar — bottom */}
        <StatusBar />
      </div>

      {/* Command Palette (overlay) */}
      <CommandPalette commands={commands} isOpen={cmdPaletteOpen} onClose={closeCmdPalette} />

      {/* Inline LLM Assistant (overlay — Cmd+I) */}
      <InlineAssistant
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        contextCode={activeFile?.content}
        contextLanguage={activeFile?.language}
        contextFile={activeFile?.path}
      />

      {/* Toast notifications (fixed bottom-right) */}
      <ToastContainer />
    </div>
  );
}
