'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceConfig {
  id: string;
  name: string;
  /** Per-page serialized dockview layouts */
  layouts: Record<string, object | null>;
  /** Which page was active when saved */
  activePage: string;
  createdAt: number;
}

interface WorkspaceStore {
  /** Ordered list of workspace configs */
  workspaces: WorkspaceConfig[];
  /** ID of the active workspace (currently loaded) */
  activeId: string | null;
  /** ID of the default workspace (loads on startup) */
  defaultId: string | null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const WORKSPACE_KEY = 'contextdna_workspaces';

function loadStore(): WorkspaceStore {
  if (typeof window === 'undefined') {
    return { workspaces: [], activeId: null, defaultId: null };
  }
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.workspaces)) return parsed;
    }
  } catch {
    /* corrupted */
  }
  return { workspaces: [], activeId: null, defaultId: null };
}

function persistStore(store: WorkspaceStore) {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(store));
  } catch {
    /* storage full */
  }
}

// ---------------------------------------------------------------------------
// WorkspaceSlots component
// ---------------------------------------------------------------------------

interface WorkspaceSlotsProps {
  /** Snapshot the current full state (all page layouts + active page) */
  snapshotCurrentState: () => { layouts: Record<string, object | null>; activePage: string };
  /** Restore a workspace (apply all page layouts + switch to saved page) */
  restoreWorkspace: (config: WorkspaceConfig) => void;
}

export function WorkspaceSlots({
  snapshotCurrentState,
  restoreWorkspace,
}: WorkspaceSlotsProps) {
  const [store, setStore] = useState<WorkspaceStore>(loadStore);
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Persist on every store change
  useEffect(() => {
    persistStore(store);
  }, [store]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  // Focus rename input when it appears
  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  // ------- Actions -------

  const saveNewWorkspace = useCallback(() => {
    const snapshot = snapshotCurrentState();
    const nextNum = store.workspaces.length + 1;
    const ws: WorkspaceConfig = {
      id: `ws_${Date.now()}`,
      name: `Workspace ${nextNum}`,
      layouts: snapshot.layouts,
      activePage: snapshot.activePage,
      createdAt: Date.now(),
    };
    const updated = {
      ...store,
      workspaces: [...store.workspaces, ws],
      activeId: ws.id,
      defaultId: store.defaultId ?? ws.id, // first workspace becomes default
    };
    setStore(updated);
  }, [store, snapshotCurrentState]);

  const loadWorkspace = useCallback(
    (ws: WorkspaceConfig) => {
      restoreWorkspace(ws);
      setStore((prev) => ({ ...prev, activeId: ws.id }));
    },
    [restoreWorkspace],
  );

  const setAsDefault = useCallback((id: string) => {
    setStore((prev) => {
      // Move the target workspace to position 0
      const idx = prev.workspaces.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const reordered = [...prev.workspaces];
      const [target] = reordered.splice(idx, 1);
      reordered.unshift(target);
      return { ...prev, workspaces: reordered, defaultId: id };
    });
    setContextMenu(null);
  }, []);

  const deleteWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const filtered = prev.workspaces.filter((w) => w.id !== id);
      return {
        ...prev,
        workspaces: filtered,
        activeId: prev.activeId === id ? null : prev.activeId,
        defaultId: prev.defaultId === id ? (filtered[0]?.id ?? null) : prev.defaultId,
      };
    });
    setContextMenu(null);
  }, []);

  const startRename = useCallback(
    (id: string) => {
      const ws = store.workspaces.find((w) => w.id === id);
      if (!ws) return;
      setRenaming(id);
      setRenameValue(ws.name);
      setContextMenu(null);
    },
    [store.workspaces],
  );

  const commitRename = useCallback(() => {
    if (!renaming || !renameValue.trim()) {
      setRenaming(null);
      return;
    }
    setStore((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) =>
        w.id === renaming ? { ...w, name: renameValue.trim() } : w,
      ),
    }));
    setRenaming(null);
  }, [renaming, renameValue]);

  const updateCurrentWorkspace = useCallback(() => {
    if (!store.activeId) return;
    const snapshot = snapshotCurrentState();
    setStore((prev) => ({
      ...prev,
      workspaces: prev.workspaces.map((w) =>
        w.id === prev.activeId
          ? { ...w, layouts: snapshot.layouts, activePage: snapshot.activePage }
          : w,
      ),
    }));
    setContextMenu(null);
  }, [store.activeId, snapshotCurrentState]);

  // ------- Handle right-click -------
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      setContextMenu({ id, x: e.clientX, y: e.clientY });
    },
    [],
  );

  // ------- Render -------
  return (
    <div className="flex items-center gap-0.5">
      {store.workspaces.map((ws, i) => {
        const isActive = ws.id === store.activeId;
        const isDefault = ws.id === store.defaultId;
        const displayNum = i + 1;

        if (renaming === ws.id) {
          return (
            <input
              key={ws.id}
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="w-20 h-5 px-1 text-[10px] bg-[#1a1a24] border border-[#22c55e]/50 rounded text-[#e5e5e5] outline-none"
            />
          );
        }

        return (
          <button
            key={ws.id}
            onClick={() => loadWorkspace(ws)}
            onContextMenu={(e) => handleContextMenu(e, ws.id)}
            className={cn(
              'relative flex items-center justify-center min-w-[18px] h-[18px] rounded text-[10px] font-medium transition-all leading-none',
              isActive
                ? 'bg-[#22c55e]/25 text-[#22c55e] border border-[#22c55e]/40'
                : 'text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24]',
              isDefault && !isActive && 'text-[#8b8b95]',
            )}
            title={ws.name + (isDefault ? ' (default)' : '')}
          >
            {displayNum}
          </button>
        );
      })}

      {/* + button to save new workspace */}
      <button
        onClick={saveNewWorkspace}
        className="flex items-center justify-center w-[18px] h-[18px] rounded text-[#6b6b75] hover:text-[#22c55e] hover:bg-[#1a1a24] transition-colors"
        title="Save current layout as workspace"
      >
        <Plus className="w-3 h-3" />
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] min-w-[160px] rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-lg py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {store.activeId === contextMenu.id && (
            <button
              onClick={updateCurrentWorkspace}
              className="w-full px-3 py-1.5 text-left text-xs text-[#e5e5e5] hover:bg-[#111118] transition-colors"
            >
              Update with current layout
            </button>
          )}
          {store.defaultId !== contextMenu.id && (
            <button
              onClick={() => setAsDefault(contextMenu.id)}
              className="w-full px-3 py-1.5 text-left text-xs text-[#e5e5e5] hover:bg-[#111118] transition-colors"
            >
              Set as default
            </button>
          )}
          <button
            onClick={() => startRename(contextMenu.id)}
            className="w-full px-3 py-1.5 text-left text-xs text-[#e5e5e5] hover:bg-[#111118] transition-colors"
          >
            Rename
          </button>
          <div className="border-t border-[#2a2a35] my-1" />
          <button
            onClick={() => deleteWorkspace(contextMenu.id)}
            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete workspace
          </button>
        </div>
      )}
    </div>
  );
}
