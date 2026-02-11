'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeftRight,
} from 'lucide-react';
import { FileExplorer } from './panels/file-explorer';

// ---------------------------------------------------------------------------
// Explorer preference persistence
// ---------------------------------------------------------------------------
const EXPLORER_PREFS_KEY = 'contextdna_explorer_prefs';

interface ExplorerPrefs {
  visible: boolean;
  side: 'left' | 'right';
  width: number; // px
}

const DEFAULT_PREFS: ExplorerPrefs = {
  visible: false, // Off by default (Electron enables it)
  side: 'left',
  width: 250, // VS Code default
};

const MIN_WIDTH = 170;
const MAX_WIDTH = 600;

function loadExplorerPrefs(): ExplorerPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(EXPLORER_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        visible: typeof parsed.visible === 'boolean' ? parsed.visible : DEFAULT_PREFS.visible,
        side: parsed.side === 'right' ? 'right' : 'left',
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed.width ?? DEFAULT_PREFS.width)),
      };
    }
  } catch { /* corrupted */ }
  return DEFAULT_PREFS;
}

function saveExplorerPrefs(prefs: ExplorerPrefs) {
  try {
    localStorage.setItem(EXPLORER_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* storage full */ }
}

// ---------------------------------------------------------------------------
// ExplorerShell
//
// Wraps the inner dockview content area with an optional file explorer sidebar.
// The sidebar lives OUTSIDE dockview — it's a fixed structural element
// (like VS Code's Primary Sidebar) that defines the boundary for panel docking.
//
// Props:
//   children — the dockview content area (DockviewReact + its container)
//
// Behavior:
//   - Explorer sidebar on left (default) or right, user-configurable
//   - Draggable border between explorer and content area
//   - Persists position, width, visibility to localStorage
//   - Keyboard shortcut: Cmd/Ctrl+B to toggle (same as VS Code)
//   - When hidden, inner content fills the full width
//   - Explorer panel persists identically across all parent pages
// ---------------------------------------------------------------------------

export interface ExplorerShellProps {
  children: ReactNode;
  /** When provided, visibility is controlled externally (e.g. by Activity Bar) */
  visible?: boolean;
  /** Called when visibility changes (controlled mode) */
  onVisibleChange?: (visible: boolean) => void;
}

export function ExplorerShell({ children, visible: controlledVisible, onVisibleChange }: ExplorerShellProps) {
  const [prefs, setPrefs] = useState<ExplorerPrefs>(DEFAULT_PREFS);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Load prefs on mount (client-only)
  useEffect(() => {
    if (!initialized.current) {
      setPrefs(loadExplorerPrefs());
      initialized.current = true;
    }
  }, []);

  // Persist prefs on change
  useEffect(() => {
    if (initialized.current) {
      saveExplorerPrefs(prefs);
    }
  }, [prefs]);

  // ------ Sync controlled visibility to prefs (for localStorage persistence) ------
  useEffect(() => {
    if (controlledVisible !== undefined && initialized.current && prefs.visible !== controlledVisible) {
      setPrefs((p) => ({ ...p, visible: controlledVisible }));
    }
  }, [controlledVisible, prefs.visible]);

  // ------ Toggle visibility ------
  const toggleVisible = useCallback(() => {
    if (controlledVisible !== undefined) {
      onVisibleChange?.(!controlledVisible);
    } else {
      setPrefs((p) => ({ ...p, visible: !p.visible }));
    }
  }, [controlledVisible, onVisibleChange]);

  // ------ Swap side ------
  const swapSide = useCallback(() => {
    setPrefs((p) => ({ ...p, side: p.side === 'left' ? 'right' : 'left' }));
  }, []);

  // ------ Keyboard shortcut: Cmd/Ctrl+B ------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        // Don't intercept if user is typing in an input
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }
        e.preventDefault();
        toggleVisible();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleVisible]);

  // ------ Drag resize ------
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      let newWidth: number;
      if (prefs.side === 'left') {
        newWidth = e.clientX - rect.left;
      } else {
        newWidth = rect.right - e.clientX;
      }

      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      setPrefs((p) => ({ ...p, width: newWidth }));
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, prefs.side]);

  // Prevent text selection while dragging
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  // Effective visibility: controlled prop takes precedence over internal prefs
  const effectiveVisible = controlledVisible !== undefined ? controlledVisible : prefs.visible;

  // ------ Render: Explorer hidden → just children ------
  if (!effectiveVisible) {
    return (
      <div ref={containerRef} className="flex flex-col h-full w-full relative">
        {children}
        {/* Floating toggle button — bottom-left or bottom-right */}
        <button
          onClick={toggleVisible}
          className="absolute bottom-3 z-20 flex items-center gap-1 px-2 py-1 rounded-md
                     bg-[#1a1a24]/90 border border-[#2a2a35] text-[#6b6b75]
                     hover:text-[#e5e5e5] hover:bg-[#1a1a24] transition-colors text-xs"
          style={{ [prefs.side]: 12 }}
          title={`Show Explorer (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+B)`}
        >
          {prefs.side === 'left' ? (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5" />
          )}
          <span>Explorer</span>
        </button>
      </div>
    );
  }

  // ------ Render: Explorer visible ------
  const explorerPanel = (
    <div
      className="explorer-sidebar flex flex-col h-full bg-[#0a0a0f] flex-shrink-0 overflow-hidden"
      style={{ width: prefs.width }}
    >
      {/* Explorer header with controls */}
      <div className="flex items-center gap-1 h-8 px-2 border-b border-[#2a2a35] flex-shrink-0 select-none">
        <FolderOpen className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0" />
        <span className="text-xs font-semibold text-[#e5e5e5] uppercase tracking-wide flex-1">
          Explorer
        </span>

        {/* Swap side button */}
        <button
          onClick={swapSide}
          className="flex items-center justify-center w-5 h-5 rounded text-[#6b6b75]
                     hover:text-[#e5e5e5] hover:bg-[#1a1a24] transition-colors"
          title={`Move to ${prefs.side === 'left' ? 'right' : 'left'}`}
        >
          <ArrowLeftRight className="w-3 h-3" />
        </button>

        {/* Close button */}
        <button
          onClick={toggleVisible}
          className="flex items-center justify-center w-5 h-5 rounded text-[#6b6b75]
                     hover:text-[#e5e5e5] hover:bg-[#1a1a24] transition-colors"
          title={`Hide Explorer (${navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+B)`}
        >
          {prefs.side === 'left' ? (
            <PanelLeftClose className="w-3 h-3" />
          ) : (
            <PanelRightClose className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <FileExplorer />
      </div>
    </div>
  );

  const divider = (
    <div
      onMouseDown={handleMouseDown}
      className={`
        w-1 flex-shrink-0 cursor-col-resize select-none transition-colors duration-150
        ${isDragging ? 'bg-[#22c55e]' : 'bg-[#2a2a35] hover:bg-[#22c55e]/50'}
      `}
      role="separator"
      aria-orientation="vertical"
    />
  );

  const contentArea = (
    <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
      {children}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-row h-full w-full overflow-hidden${isDragging ? ' panel-resize-active' : ''}`}
    >
      {prefs.side === 'left' ? (
        <>
          {explorerPanel}
          {divider}
          {contentArea}
        </>
      ) : (
        <>
          {contentArea}
          {divider}
          {explorerPanel}
        </>
      )}
    </div>
  );
}
