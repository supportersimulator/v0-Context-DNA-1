'use client';

import { useState, useEffect, useCallback } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewReadyEvent, DockviewApi, SerializedDockview } from 'dockview';
import { useResponsive } from '@/lib/contexts/responsive-context';
import { ElectronWindowControls } from '@/components/electron/electron-window-controls';
import { panelComponents, getAllPanelMetadata } from './panel-factory';
import { RightHeaderActions } from './panel-header';
import { WorkspaceSlots, type WorkspaceConfig } from './workspace-slots';
import { MobileLayout } from './mobile-layout';
import { ExplorerShell } from './explorer-shell';

// ---------------------------------------------------------------------------
// Layout persistence (single layout — DashboardShell handles page switching)
// ---------------------------------------------------------------------------
const LAYOUT_STORAGE_KEY = 'contextdna_dockview_layout';

function saveLayout(layout: SerializedDockview) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
  } catch {
    /* storage full -- silent */
  }
}

// Layout schema version — bump when panel IDs change to invalidate stale layouts
const LAYOUT_VERSION = 1;
const LAYOUT_VERSION_KEY = 'contextdna_dockview_layout_v';

function loadLayout(): SerializedDockview | null {
  if (typeof window === 'undefined') return null;
  try {
    const savedVersion = localStorage.getItem(LAYOUT_VERSION_KEY);
    if (savedVersion !== String(LAYOUT_VERSION)) {
      // Schema changed — discard stale layout
      localStorage.removeItem(LAYOUT_STORAGE_KEY);
      localStorage.setItem(LAYOUT_VERSION_KEY, String(LAYOUT_VERSION));
      return null;
    }
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupted -- ignore */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Default layout: DashboardShell takes full view
// ---------------------------------------------------------------------------
function applyDefaultLayout(api: DockviewApi) {
  api.clear();
  const allMeta = getAllPanelMetadata();
  api.addPanel({
    id: 'dashboard-shell',
    component: 'dashboard-shell',
    title: allMeta['dashboard-shell']?.label ?? 'Context DNA',
  });
}

// ---------------------------------------------------------------------------
// DockviewShell — thin container around DockviewReact
//
// DashboardShell is the main panel and handles its own navigation
// (Dashboard / Synaptic / Live View). Its header bar is the TOPMOST element.
// Users can dock additional panels around it via dockview tab actions.
// ---------------------------------------------------------------------------
export function DockviewShell() {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const { state } = useResponsive();
  const isMobileView = state.isMobile || state.deviceMode === 'electron-mobile';

  // ------- Auto-save on layout change -------
  useEffect(() => {
    if (!dockviewApi) return;
    const disposable = dockviewApi.onDidLayoutChange(() => {
      saveLayout(dockviewApi.toJSON());
    });
    return () => disposable.dispose();
  }, [dockviewApi]);

  // ------- onReady handler -------
  const handleReady = useCallback((event: DockviewReadyEvent) => {
    setDockviewApi(event.api);

    const saved = loadLayout();
    if (saved) {
      try {
        event.api.fromJSON(saved);
      } catch {
        applyDefaultLayout(event.api);
      }
    } else {
      applyDefaultLayout(event.api);
    }
  }, []);

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

          {/* Workspace slots — right side, subtle numbered buttons */}
          <div className="flex items-center px-2 gap-1 no-drag">
            <WorkspaceSlots
              snapshotCurrentState={snapshotCurrentState}
              restoreWorkspace={restoreWorkspace}
            />
          </div>

          {/* Window controls (right edge) */}
          <div className="no-drag">
            <ElectronWindowControls />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Explorer Shell + Dockview container                              */}
      {/* ExplorerShell wraps dockview with an optional file sidebar       */}
      {/* (left or right, user-configurable, Cmd+B to toggle).            */}
      {/* When explorer is visible, its inner edge becomes the boundary    */}
      {/* that dockview panels dock against. Same across all parent pages. */}
      {/* ================================================================ */}
      <div className="flex-1 min-h-0">
        <ExplorerShell>
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
      </div>
    </div>
  );
}
