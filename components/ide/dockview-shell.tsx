'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewReadyEvent, DockviewApi, SerializedDockview } from 'dockview';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Brain, Syringe } from 'lucide-react';
import { useResponsive } from '@/lib/contexts/responsive-context';
import { useIsDesktop, useIsTabletUp } from '@/lib/hooks/use-media-query';
import { ElectronWindowControls } from '@/components/electron/electron-window-controls';
import { PanelDropdown } from './panel-dropdown';
import { panelComponents, PANEL_METADATA, getAllPanelMetadata, type ParentPage } from './panel-factory';
import { RightHeaderActions } from './panel-header';
import { WorkspaceSlots, type WorkspaceConfig } from './workspace-slots';
import { MobileLayout } from './mobile-layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PageId = ParentPage;

const LAYOUT_STORAGE_KEY = 'contextdna_dockview_layouts';

// ---------------------------------------------------------------------------
// Default panel sets per page
// ---------------------------------------------------------------------------
function getDefaultPanelsForPage(page: PageId): string[] {
  switch (page) {
    case 'dashboard':
      // All dashboard views as tabs in one group (mimics DashboardShell TabList)
      return ['home', 'activity', 'professor', 'search', 'health', 'models'];
    case 'synaptic':
      return ['synaptic'];
    case 'live':
      // 3-panel layout: injection (left) + learnings (right-top) + architecture (right-bottom)
      return ['injection', 'learnings', 'architecture'];
    default:
      return ['home'];
  }
}

// ---------------------------------------------------------------------------
// Layout persistence helpers
// ---------------------------------------------------------------------------
function loadAllLayouts(): Record<PageId, SerializedDockview | null> {
  if (typeof window === 'undefined') {
    return { dashboard: null, synaptic: null, live: null };
  }
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupted -- ignore */
  }
  return { dashboard: null, synaptic: null, live: null };
}

function saveLayout(page: PageId, layout: SerializedDockview) {
  try {
    const all = loadAllLayouts();
    all[page] = layout;
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage full -- silent */
  }
}

function loadLayout(page: PageId): SerializedDockview | null {
  return loadAllLayouts()[page];
}

// ---------------------------------------------------------------------------
// Build default layouts programmatically per page
// ---------------------------------------------------------------------------
function applyDefaultLayout(api: DockviewApi, page: PageId) {
  api.clear();

  const allMeta = getAllPanelMetadata();

  switch (page) {
    case 'dashboard': {
      // Dashboard: all views as TABS in one group (mimics DashboardShell TabList)
      const tabs = getDefaultPanelsForPage('dashboard');
      if (tabs.length === 0) return;

      const first = tabs[0];
      api.addPanel({
        id: first,
        component: first,
        title: allMeta[first]?.label ?? first,
      });

      // Add remaining as tabs in the SAME group (no direction = same group)
      for (let i = 1; i < tabs.length; i++) {
        const panelId = tabs[i];
        api.addPanel({
          id: panelId,
          component: panelId,
          title: allMeta[panelId]?.label ?? panelId,
          position: { referencePanel: first },
        });
      }
      break;
    }

    case 'synaptic': {
      // Synaptic: single full-screen panel
      api.addPanel({
        id: 'synaptic',
        component: 'synaptic',
        title: allMeta['synaptic']?.label ?? 'Synaptic',
      });
      break;
    }

    case 'live': {
      // Live View: 3-panel split matching the original SplitPanelLayout
      // Left (60%): Injection with calendar, history, WebSocket
      // Right-top: Today's Learnings
      // Right-bottom: Architecture awareness

      // 1. Injection panel (fills left ~60%)
      api.addPanel({
        id: 'injection',
        component: 'injection',
        title: allMeta['injection']?.label ?? 'Injection',
      });

      // 2. Learnings to the right of injection
      api.addPanel({
        id: 'learnings',
        component: 'learnings',
        title: allMeta['learnings']?.label ?? 'Learnings',
        position: { referencePanel: 'injection', direction: 'right' },
      });

      // 3. Architecture below learnings (stacked right column)
      api.addPanel({
        id: 'architecture',
        component: 'architecture',
        title: allMeta['architecture']?.label ?? 'Architecture',
        position: { referencePanel: 'learnings', direction: 'below' },
      });
      break;
    }

    default: {
      api.addPanel({
        id: 'home',
        component: 'home',
        title: allMeta['home']?.label ?? 'Home',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Nav button config
// ---------------------------------------------------------------------------
const NAV_ITEMS: {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  shortcut: string;
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'Cmd+3' },
  { id: 'synaptic', label: 'Synaptic', icon: Brain, shortcut: 'Cmd+2' },
  { id: 'live', label: 'Live View', icon: Syringe, shortcut: 'Cmd+1' },
];

// ---------------------------------------------------------------------------
// DockviewShell Component
// ---------------------------------------------------------------------------
export function DockviewShell() {
  const [activePage, setActivePage] = useState<PageId>('synaptic');
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { state } = useResponsive();
  const activePageRef = useRef<PageId>('synaptic');
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Responsive breakpoint hooks
  const isDesktop = useIsDesktop(); // >= 1024px
  const isTabletUp = useIsTabletUp(); // >= 768px
  // mobile = !isTabletUp (< 768px)
  const isMobileView = state.isMobile || state.deviceMode === 'electron-mobile';

  // Keep ref in sync for use inside event listeners
  activePageRef.current = activePage;

  // ------- Close mobile menu on outside click -------
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(e.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mobileMenuOpen]);

  // ------- Page switching -------
  const switchPage = useCallback(
    (newPage: PageId) => {
      if (!dockviewApi) return;
      if (newPage === activePageRef.current) return;

      // Save current page layout
      const currentLayout = dockviewApi.toJSON();
      saveLayout(activePageRef.current, currentLayout);

      // Load new page layout
      const saved = loadLayout(newPage);
      if (saved) {
        try {
          dockviewApi.fromJSON(saved);
        } catch {
          // Saved layout incompatible -- rebuild default
          applyDefaultLayout(dockviewApi, newPage);
        }
      } else {
        applyDefaultLayout(dockviewApi, newPage);
      }

      setActivePage(newPage);
      setMobileMenuOpen(false);
    },
    [dockviewApi],
  );

  // ------- Keyboard shortcuts -------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === '1') {
        e.preventDefault();
        switchPage('live');
        return;
      }
      if (isMod && e.key === '2') {
        e.preventDefault();
        switchPage('synaptic');
        return;
      }
      if (isMod && e.key === '3') {
        e.preventDefault();
        switchPage('dashboard');
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switchPage]);

  // ------- Auto-save on layout change -------
  useEffect(() => {
    if (!dockviewApi) return;

    const disposable = dockviewApi.onDidLayoutChange(() => {
      const layout = dockviewApi.toJSON();
      saveLayout(activePageRef.current, layout);
    });

    return () => disposable.dispose();
  }, [dockviewApi]);

  // ------- onReady handler -------
  const handleReady = useCallback(
    (event: DockviewReadyEvent) => {
      setDockviewApi(event.api);

      // Apply initial layout for default page
      const saved = loadLayout('synaptic');
      if (saved) {
        try {
          event.api.fromJSON(saved);
        } catch {
          applyDefaultLayout(event.api, 'synaptic');
        }
      } else {
        applyDefaultLayout(event.api, 'synaptic');
      }
    },
    [],
  );

  // ------- Get active panel IDs from dockview -------
  const getActivePanelIds = useCallback((): string[] => {
    if (!dockviewApi) return [];
    return dockviewApi.panels.map((p) => p.id);
  }, [dockviewApi]);

  // ------- Workspace snapshot/restore -------
  const snapshotCurrentState = useCallback(() => {
    if (!dockviewApi) {
      return {
        layouts: { dashboard: null, synaptic: null, live: null },
        activePage,
      };
    }
    // Save current page first
    const currentLayout = dockviewApi.toJSON();
    const all = loadAllLayouts();
    all[activePageRef.current] = currentLayout;
    return { layouts: all as Record<string, object | null>, activePage };
  }, [dockviewApi, activePage]);

  const restoreWorkspace = useCallback(
    (config: WorkspaceConfig) => {
      if (!dockviewApi) return;
      // Restore all page layouts to localStorage
      const pages: PageId[] = ['dashboard', 'synaptic', 'live'];
      for (const page of pages) {
        const layout = config.layouts[page];
        if (layout) {
          saveLayout(page, layout as SerializedDockview);
        }
      }
      // Switch to the saved active page
      const targetPage = (config.activePage as PageId) || 'synaptic';
      const layout = config.layouts[targetPage];
      if (layout) {
        try {
          dockviewApi.fromJSON(layout as SerializedDockview);
        } catch {
          applyDefaultLayout(dockviewApi, targetPage);
        }
      } else {
        applyDefaultLayout(dockviewApi, targetPage);
      }
      setActivePage(targetPage);
    },
    [dockviewApi],
  );

  // ------- Render a single nav button, responsive to breakpoint -------
  const renderNavButton = (item: (typeof NAV_ITEMS)[number]) => {
    const Icon = item.icon;
    const isActive = activePage === item.id;

    // "Live View" gets a special active style (solid green bg)
    const isLive = item.id === 'live';

    // Determine size classes by breakpoint
    // Desktop (>= 1024): icon + text label, full padding
    // Tablet (768-1023): icon only, medium padding, tooltip on hover
    const buttonPadding = isDesktop ? 'px-3 py-1.5' : 'px-2 py-1.5';
    const iconSize = 'w-3.5 h-3.5';
    const showLabel = isDesktop;

    const activeClasses =
      isLive && isActive
        ? 'bg-[#22c55e] text-[#0a0a0f] shadow-[0_0_10px_rgba(34,197,94,0.4)]'
        : isActive
          ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
          : 'text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#0a0a0f]/50';

    return (
      <button
        key={item.id}
        onClick={() => switchPage(item.id)}
        className={cn(
          'flex items-center gap-1.5 rounded-md text-xs font-medium transition-all',
          buttonPadding,
          activeClasses,
        )}
        title={`${item.label} (${item.shortcut})`}
      >
        <Icon className={iconSize} />
        {showLabel && <span>{item.label}</span>}
      </button>
    );
  };

  // -----------------------------------------------------------------------
  // Mobile fallback: render MobileLayout instead of DockviewReact
  // when viewport < 768px (or Electron resized to mobile size).
  // Placed AFTER all hooks to satisfy React rules-of-hooks.
  // -----------------------------------------------------------------------
  if (isMobileView) {
    return <MobileLayout />;
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f]">
      {/* ================================================================ */}
      {/* Top bar: workspace slots + window controls (outermost border)    */}
      {/* Visible on tablet+ (>= 768px). Hidden on mobile (< 768px) --    */}
      {/* mobile is handled by MobileLayout above, but this also covers   */}
      {/* the case where isTabletUp might flicker during resize.          */}
      {/* ================================================================ */}
      {isTabletUp && (
        <div className="flex items-center h-7 bg-[#0a0a0f] border-b border-[#2a2a35]/50 flex-shrink-0 select-none app-drag-region">
          {/* macOS traffic lights spacer (Electron only) */}
          {state.isElectron && <div className="w-[78px] flex-shrink-0" />}

          {/* Workspace slots -- left side, subtle */}
          <div className="flex items-center px-2 gap-1 no-drag">
            <WorkspaceSlots
              snapshotCurrentState={snapshotCurrentState}
              restoreWorkspace={restoreWorkspace}
            />
          </div>

          {/* Draggable spacer (for Electron window dragging) */}
          <div className="flex-1" />

          {/* Electron window controls (right side) */}
          {state.isElectron && (
            <div className="no-drag">
              <ElectronWindowControls />
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Toolbar -- ALWAYS visible                                        */}
      {/* Desktop (>= 1024): logo emoji + "Context DNA" text              */}
      {/*                     icon + text label on nav buttons             */}
      {/*                     standard PanelDropdown                       */}
      {/* Tablet (768-1023):  logo emoji only (no text)                   */}
      {/*                     icon-only nav buttons (tooltip on hover)    */}
      {/*                     standard PanelDropdown                       */}
      {/* ================================================================ */}
      <div className="flex items-center gap-1 px-4 py-2 bg-[#111118] border-b border-[#2a2a35] w-full flex-shrink-0">
        {/* Logo -- icon-only on tablet, full on desktop */}
        <div
          className={cn(
            'flex items-center flex-shrink-0 select-none',
            isDesktop ? 'gap-1 mr-4' : 'mr-3',
          )}
        >
          <span className={isDesktop ? 'text-xl' : 'text-lg'}>
            &#x1F9EC;
          </span>
          {isDesktop && (
            <span className="text-sm font-semibold text-[#e5e5e5]">
              Context DNA
            </span>
          )}
        </div>

        {/* Nav buttons -- always visible, adapt per breakpoint */}
        <div className="flex items-center mr-4 flex-shrink-0 border-r border-[#2a2a35] pr-4">
          <div className="flex bg-[#0a0a0f]/30 rounded-lg p-0.5 gap-0.5">
            {NAV_ITEMS.map(renderNavButton)}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Panel dropdown -- visible at all dockview sizes */}
        <PanelDropdown
          activePage={activePage}
          dockviewApi={dockviewApi}
          getActivePanelIds={getActivePanelIds}
        />
      </div>

      {/* ================================================================ */}
      {/* Dockview container -- fills remaining height                     */}
      {/* Toolbar is OUTSIDE dockview, so it stays visible even when a     */}
      {/* panel is maximized within dockview.                              */}
      {/* ================================================================ */}
      <div className="flex-1 min-h-0 dockview-theme-dark">
        <DockviewReact
          className="dockview-theme-dark"
          onReady={handleReady}
          components={panelComponents}
          rightHeaderActionsComponent={RightHeaderActions}
          floatingGroupBounds="boundedWithinViewport"
        />
      </div>
    </div>
  );
}
