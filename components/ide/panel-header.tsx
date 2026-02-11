'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Pin,
  PinOff,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Check,
  Square,
} from 'lucide-react';
import type { DockviewApi, DockviewGroupPanel, IDockviewHeaderActionsProps } from 'dockview';
import { getAllPanelMetadata } from './panel-factory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelHeaderState = 'expanded' | 'minimized';

export interface PanelHeaderProps {
  /** Display name shown in the header bar */
  title: string;
  /** Dockview group for maximize/restore operations */
  group: DockviewGroupPanel;
  /** Top-level dockview API for container operations */
  containerApi: DockviewApi;
  /** Whether the panel is currently pinned (sticky) */
  isSticky?: boolean;
  /** Called when sticky state is toggled */
  onStickyToggle?: (sticky: boolean) => void;
  /** Called when minimize/expand state changes */
  onMinimizeToggle?: (minimized: boolean) => void;
  /** Called when the close button is clicked */
  onClose?: () => void;
}

// ---------------------------------------------------------------------------
// PanelHeader component
// ---------------------------------------------------------------------------

export function PanelHeader({
  title,
  group,
  containerApi,
  isSticky = false,
  onStickyToggle,
  onMinimizeToggle,
  onClose,
}: PanelHeaderProps) {
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [sticky, setSticky] = useState(isSticky);

  // ------ Sticky / Pin ------
  const handleStickyToggle = useCallback(() => {
    const next = !sticky;
    setSticky(next);
    onStickyToggle?.(next);
  }, [sticky, onStickyToggle]);

  // ------ Maximize / Restore ------
  const handleMaximizeToggle = useCallback(() => {
    if (maximized) {
      containerApi.exitMaximizedGroup();
      setMaximized(false);
    } else {
      containerApi.maximizeGroup(group.activePanel!);
      setMaximized(true);
    }
  }, [maximized, containerApi, group]);

  // ------ Minimize / Expand ------
  const handleMinimizeToggle = useCallback(() => {
    const next = !minimized;
    setMinimized(next);
    onMinimizeToggle?.(next);
  }, [minimized, onMinimizeToggle]);

  // ------ Close ------
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // ------ Button helper ------
  const iconBtnClass =
    'flex items-center justify-center w-6 h-6 rounded transition-colors text-[#6b6b75] hover:bg-[#1a1a24] hover:text-[#e5e5e5]';

  // ====================================================================
  // MINIMIZED state: narrow 30px label bar
  // ====================================================================
  if (minimized) {
    return (
      <div className="flex items-center justify-between h-[30px] px-2 bg-[#111118] border-b border-[#2a2a35] select-none">
        <span className="text-xs font-medium text-[#e5e5e5] truncate">
          {title}
        </span>
        <div className="flex items-center gap-0.5">
          {/* Sticky */}
          <button
            className={iconBtnClass}
            onClick={handleStickyToggle}
            title={sticky ? 'Unpin panel' : 'Pin panel'}
          >
            {sticky ? (
              <Pin className="w-3.5 h-3.5 text-[#22c55e]" />
            ) : (
              <PinOff className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Maximize */}
          <button
            className={iconBtnClass}
            onClick={handleMaximizeToggle}
            title={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Expand (restore from minimized) */}
          <button
            className={iconBtnClass}
            onClick={handleMinimizeToggle}
            title="Expand"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>

          {/* Close */}
          <button
            className={`${iconBtnClass} hover:bg-red-500/20 hover:text-red-400`}
            onClick={handleClose}
            title="Close panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ====================================================================
  // EXPANDED state: full header with all controls
  // ====================================================================
  return (
    <div className="flex items-center justify-between h-9 px-3 bg-[#111118] border-b border-[#2a2a35] select-none">
      <span className="text-sm font-medium text-[#e5e5e5] truncate">
        {title}
      </span>

      <div className="flex items-center gap-0.5">
        {/* Sticky */}
        <button
          className={iconBtnClass}
          onClick={handleStickyToggle}
          title={sticky ? 'Unpin panel' : 'Pin panel'}
        >
          {sticky ? (
            <Pin className="w-3.5 h-3.5 text-[#22c55e]" />
          ) : (
            <PinOff className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Maximize */}
        <button
          className={iconBtnClass}
          onClick={handleMaximizeToggle}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Minimize */}
        <button
          className={iconBtnClass}
          onClick={handleMinimizeToggle}
          title="Minimize"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {/* Close */}
        <button
          className={`${iconBtnClass} hover:bg-red-500/20 hover:text-red-400`}
          onClick={handleClose}
          title="Close panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RightHeaderActions: used as DockviewReact rightHeaderActionsComponent
//
// This integrates into dockview's built-in header actions slot.
// Receives { api, containerApi, panels, activePanel, isGroupActive, group }
// from dockview-react's ReactHeaderActionsRendererPart.
// ---------------------------------------------------------------------------

export function RightHeaderActions({
  containerApi,
  activePanel,
  group,
}: IDockviewHeaderActionsProps) {
  const [maximized, setMaximized] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [showPanelPicker, setShowPanelPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Sync floating state from group location on mount and location changes
  useEffect(() => {
    setIsFloating(group.api.location.type === 'floating');
    const disposable = group.api.onDidLocationChange(() => {
      setIsFloating(group.api.location.type === 'floating');
    });
    return () => disposable.dispose();
  }, [group]);

  // Close picker on click outside
  useEffect(() => {
    if (!showPanelPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPanelPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPanelPicker]);

  const handleFloat = useCallback(() => {
    if (!activePanel) return;

    if (isFloating) {
      // Dock back: re-add panel to the main grid
      containerApi.addPanel({
        id: `${activePanel.id}_docked`,
        component: activePanel.id,
        title: activePanel.title ?? activePanel.id,
      });
      containerApi.removePanel(activePanel);
    } else {
      // Float: detach to bottom-right corner
      const floatW = 400;
      const floatH = 350;
      containerApi.addFloatingGroup(activePanel, {
        x: Math.max(0, containerApi.width - floatW - 16),
        y: Math.max(0, containerApi.height - floatH - 16),
        width: floatW,
        height: floatH,
      });
    }
  }, [activePanel, containerApi, isFloating]);

  const handleMaximize = useCallback(() => {
    if (maximized) {
      containerApi.exitMaximizedGroup();
      setMaximized(false);
    } else if (activePanel) {
      containerApi.maximizeGroup(activePanel);
      setMaximized(true);
    }
  }, [maximized, containerApi, activePanel]);

  const handleClose = useCallback(() => {
    if (activePanel) {
      containerApi.removePanel(activePanel);
    }
  }, [containerApi, activePanel]);

  // Get active panel IDs from the containerApi
  const getActivePanelIds = useCallback((): string[] => {
    const ids: string[] = [];
    containerApi.panels.forEach((p) => ids.push(p.id));
    return ids;
  }, [containerApi]);

  const togglePanel = useCallback(
    (panelId: string) => {
      const activeIds = getActivePanelIds();
      if (activeIds.includes(panelId)) {
        const panel = containerApi.getPanel(panelId);
        if (panel) containerApi.removePanel(panel);
      } else {
        const allMeta = getAllPanelMetadata();
        containerApi.addPanel({
          id: panelId,
          component: panelId,
          title: allMeta[panelId]?.label ?? panelId,
        });
      }
    },
    [containerApi, getActivePanelIds],
  );

  const btnClass =
    'flex items-center justify-center w-5 h-5 rounded transition-colors text-[#6b6b75] hover:bg-[#1a1a24] hover:text-[#e5e5e5]';

  // Build panel picker list
  const allMeta = getAllPanelMetadata();
  const activeIds = showPanelPicker ? getActivePanelIds() : [];
  const availablePanels = Object.keys(allMeta).filter((id) => id !== 'dashboard-shell');

  return (
    <div className="flex items-center gap-0.5 pr-1">
      {/* Add panel (+) */}
      <div ref={pickerRef} className="relative">
        <button
          className={`${btnClass} ${showPanelPicker ? 'text-[#22c55e]' : ''}`}
          onClick={() => setShowPanelPicker(!showPanelPicker)}
          title="Add panel"
        >
          <Plus className="w-3 h-3" />
        </button>
        {showPanelPicker && (
          <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-lg">
            <div className="px-3 py-1.5 border-b border-[#2a2a35]/50">
              <span className="text-xs font-semibold text-[#e5e5e5]">Panels</span>
            </div>
            <div className="py-1 max-h-[320px] overflow-y-auto">
              {availablePanels.map((panelId) => {
                const isActive = activeIds.includes(panelId);
                const meta = allMeta[panelId];
                return (
                  <button
                    key={panelId}
                    onClick={() => togglePanel(panelId)}
                    className="w-full px-3 py-1.5 text-left hover:bg-[#111118] transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {isActive ? (
                      <Check className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
                    )}
                    <span className="text-xs text-[#e5e5e5]">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {/* Float / Dock toggle */}
      <button
        className={`${btnClass} ${isFloating ? 'text-[#22c55e]' : ''}`}
        onClick={handleFloat}
        title={isFloating ? 'Dock panel' : 'Float panel'}
      >
        {isFloating ? (
          <PinOff className="w-3 h-3" />
        ) : (
          <Pin className="w-3 h-3" />
        )}
      </button>
      {/* Maximize / Restore */}
      <button
        className={btnClass}
        onClick={handleMaximize}
        title={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? (
          <Minimize2 className="w-3 h-3" />
        ) : (
          <Maximize2 className="w-3 h-3" />
        )}
      </button>
      {/* Close */}
      <button
        className={`${btnClass} hover:bg-red-500/20 hover:text-red-400`}
        onClick={handleClose}
        title="Close panel"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
