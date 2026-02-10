'use client';

import { useState, useCallback } from 'react';
import {
  Pin,
  PinOff,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import type { DockviewApi, DockviewGroupPanel, IDockviewHeaderActionsProps } from 'dockview';

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
}: IDockviewHeaderActionsProps) {
  const [maximized, setMaximized] = useState(false);

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

  const btnClass =
    'flex items-center justify-center w-5 h-5 rounded transition-colors text-[#6b6b75] hover:bg-[#1a1a24] hover:text-[#e5e5e5]';

  return (
    <div className="flex items-center gap-0.5 pr-1">
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
