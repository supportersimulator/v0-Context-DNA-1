'use client';

/**
 * WorkspaceEditorShell — two-column layout that pairs the file tree (left)
 * with the CodeEditor (right). Tree.onOpenFile sets local state which the
 * editor consumes via its `filePath` prop.
 *
 * The FileTree component is loaded lazily via `next/dynamic` because it is
 * being built by a parallel agent; eager imports would break the build until
 * that file lands.
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { FileText } from 'lucide-react';
import { CodeEditor } from './code-editor';

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

export function WorkspaceEditorShell() {
  const [openPath, setOpenPath] = useState<string | null>(null);

  return (
    <div className="flex h-full w-full bg-[#0a0a0f]">
      {/* Left: file tree (fixed 280px) */}
      <div className="w-[280px] flex-shrink-0 border-r border-[#2a2a35] overflow-auto">
        <FileTree onOpenFile={(p: string) => setOpenPath(p)} />
      </div>

      {/* Right: editor or empty state */}
      <div className="flex-1 min-w-0">
        {openPath ? <CodeEditor filePath={openPath} /> : <EmptyEditorState />}
      </div>
    </div>
  );
}

export default WorkspaceEditorShell;
