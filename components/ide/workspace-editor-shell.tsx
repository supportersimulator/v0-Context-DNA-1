'use client';

/**
 * WorkspaceEditorShell — two-column layout that pairs the file tree (left)
 * with the CodeEditor (right). Tree.onOpenFile sets local state which the
 * editor consumes via its `filePath` prop.
 *
 * Also owns the IDE's default file watcher (simulator-core dirs Aaron is
 * usually iterating on). Events flow into the global file-events store; this
 * component additionally listens for events whose path matches the currently
 * open file and surfaces a "File changed on disk. Reload?" banner — but only
 * when the change came from outside (CodeEditor marks self-writes so its own
 * Cmd-S doesn't trigger the banner).
 *
 * The FileTree component is loaded lazily via `next/dynamic` because it is
 * being built by a parallel agent; eager imports would break the build until
 * that file lands.
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileText, RefreshCw, X } from 'lucide-react';
import { CodeEditor } from './code-editor';
import { useFileWatch } from '@/lib/hooks/use-file-watch';
import { isRecentSelfWrite, subscribe as subscribeFileEvents } from '@/lib/state/file-events';

// Default watch roots — superrepo-relative. Conservative: just the
// simulator-core dirs Aaron iterates on. Watching the whole superrepo would
// fan out thousands of events during /node_modules churn even with the
// chokidar ignore list (the walker still has to descend before ignoring).
const DEFAULT_WATCH_PATHS = [
  'simulator-core/er-sim-monitor',
  'simulator-core/er-sim',
  'admin.contextdna.io/app',
  'admin.contextdna.io/components',
];

// Fallback shown when the file-tree module isn't yet available (the parallel
// agent owns it). Named so eslint's react/display-name rule is satisfied.
function FileTreeUnavailable() {
  return (
    <div className="flex items-center justify-center h-full text-[10px] text-[#4a4a55] px-3 text-center">
      File tree unavailable
    </div>
  );
}

// Lazy import — the parallel agent owns this file. ssr:false because the tree
// most likely uses browser-only APIs (Electron IPC, drag/drop, etc).
const FileTree = dynamic(
  () =>
    import('./file-tree')
      .then((m) => m.FileTree)
      .catch(() => FileTreeUnavailable),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-[#6b6b75] text-xs">
        Loading file tree...
      </div>
    ),
  },
);

function EmptyEditorState() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0f] text-[#4a4a55] gap-3 select-none">
      <FileText className="w-12 h-12 opacity-30" />
      <span className="text-sm">No file open</span>
      <span className="text-xs opacity-60">
        Pick a file from the tree on the left to start editing.
      </span>
    </div>
  );
}

interface BannerProps {
  onReload: () => void;
  onDismiss: () => void;
}

function FileChangedBanner({ onReload, onDismiss }: BannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 bg-[#3b2f0a] border-b border-[#7a5d10] text-[#facc15] text-xs px-3 py-2"
    >
      <span>File changed on disk.</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-1 rounded bg-[#facc15] text-[#1a1a1f] hover:bg-[#fde047] px-2 py-0.5 text-[11px] font-medium"
        >
          <RefreshCw className="w-3 h-3" />
          Reload
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[#facc15]/70 hover:text-[#facc15]"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function WorkspaceEditorShell() {
  const [openPath, setOpenPath] = useState<string | null>(null);
  // reloadKey forces CodeEditor to remount and re-fetch when Reload is pressed.
  const [reloadKey, setReloadKey] = useState(0);
  const [externalChange, setExternalChange] = useState(false);

  // Default watcher — runs whenever the shell is mounted. The hook handles
  // start/stop and is a no-op when the route layer can't resolve a path
  // (e.g. simulator-core not present in this checkout — error surfaces in
  // the hook return value rather than throwing).
  useFileWatch({ paths: DEFAULT_WATCH_PATHS });

  // Subscribe to the global event store. Show the banner when the currently
  // open file changes from outside this editor instance. Self-writes are
  // suppressed via lib/state/file-events.isRecentSelfWrite().
  useEffect(() => {
    if (!openPath) {
      setExternalChange(false);
      return;
    }
    const unsubscribe = subscribeFileEvents((evt) => {
      // chokidar emits absolute paths; openPath may be relative. Match on
      // suffix — good enough because the path-safety helper guarantees
      // unambiguous resolution.
      const matches = evt.path === openPath || evt.path.endsWith(openPath);
      if (!matches) return;
      if (evt.event !== 'change' && evt.event !== 'add') return;
      if (isRecentSelfWrite(evt.path)) return;
      setExternalChange(true);
    });
    return unsubscribe;
  }, [openPath, reloadKey]);

  const reload = () => {
    setExternalChange(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="flex h-full w-full bg-[#0a0a0f]">
      {/* Left: file tree (fixed 280px) */}
      <div className="w-[280px] flex-shrink-0 border-r border-[#2a2a35] overflow-auto">
        <FileTree onOpenFile={(p: string) => { setOpenPath(p); setExternalChange(false); }} />
      </div>

      {/* Right: editor or empty state */}
      <div className="flex-1 min-w-0 flex flex-col">
        {openPath && externalChange ? (
          <FileChangedBanner
            onReload={reload}
            onDismiss={() => setExternalChange(false)}
          />
        ) : null}
        <div className="flex-1 min-h-0">
          {openPath ? (
            <CodeEditor key={`${openPath}:${reloadKey}`} filePath={openPath} />
          ) : (
            <EmptyEditorState />
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkspaceEditorShell;
