'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen,
  Folder,
  FileText,
  FileCode,
  FileJson,
  Image,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

interface TreeNode extends FileEntry {
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// File icon helper
// ---------------------------------------------------------------------------
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
      return <FileCode className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
    case 'png':
    case 'jpg':
    case 'svg':
    case 'gif':
      return <Image className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-[#6b6b75] flex-shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Electron FS bridge (safe no-op when not in Electron)
// ---------------------------------------------------------------------------
function getElectronFs() {
  if (typeof window !== 'undefined' && (window as any).electron?.fs) {
    return (window as any).electron.fs;
  }
  return null;
}

// ---------------------------------------------------------------------------
// TreeItem component
// ---------------------------------------------------------------------------
function TreeItem({
  node,
  depth,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  onToggle: (node: TreeNode) => void;
}) {
  const paddingLeft = 12 + depth * 16;

  return (
    <>
      <button
        className="flex items-center gap-1.5 w-full text-left py-0.5 px-1 text-xs hover:bg-[#1a1a24] rounded transition-colors group"
        style={{ paddingLeft }}
        onClick={() => onToggle(node)}
      >
        {node.isDirectory ? (
          <>
            {node.expanded ? (
              <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
            )}
            {node.expanded ? (
              <FolderOpen className="w-4 h-4 text-[#22c55e] flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-[#22c55e]/70 flex-shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 flex-shrink-0" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className="truncate text-[#e5e5e5] group-hover:text-white">
          {node.name}
        </span>
        {node.loading && (
          <RefreshCw className="w-3 h-3 text-[#6b6b75] animate-spin ml-auto flex-shrink-0" />
        )}
      </button>
      {node.expanded && node.children?.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// FileExplorer panel
// ---------------------------------------------------------------------------
export function FileExplorer() {
  const [rootPath, setRootPath] = useState<string>('');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fs = useRef(getElectronFs());

  // Load root directory
  const loadDir = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    if (!fs.current) return [];
    try {
      const entries: FileEntry[] = await fs.current.readDir(dirPath);
      return entries
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .filter((e) => !e.name.startsWith('.')) // Hide dotfiles by default
        .map((e) => ({ ...e, expanded: false, children: undefined }));
    } catch {
      return [];
    }
  }, []);

  // Initialize with cwd or home
  useEffect(() => {
    if (!fs.current) {
      setError('File explorer requires Electron');
      return;
    }
    const cwd = process.env.INIT_CWD || process.env.HOME || '/';
    setRootPath(cwd);
    loadDir(cwd).then(setTree);
  }, [loadDir]);

  // Toggle directory expand/collapse
  const handleToggle = useCallback(async (target: TreeNode) => {
    if (!target.isDirectory) return;

    setTree((prev) => {
      const update = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => {
          if (n.path === target.path) {
            return { ...n, expanded: !n.expanded, loading: !n.expanded && !n.children };
          }
          if (n.children) return { ...n, children: update(n.children) };
          return n;
        });
      return update(prev);
    });

    // Load children if expanding and not yet loaded
    if (!target.expanded && !target.children) {
      const children = await loadDir(target.path);
      setTree((prev) => {
        const update = (nodes: TreeNode[]): TreeNode[] =>
          nodes.map((n) => {
            if (n.path === target.path) return { ...n, children, loading: false };
            if (n.children) return { ...n, children: update(n.children) };
            return n;
          });
        return update(prev);
      });
    }
  }, [loadDir]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2 p-4">
        <FolderOpen className="w-8 h-8 opacity-50" />
        <span>{error}</span>
        <span className="text-xs">Available in Electron desktop app</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <FolderOpen className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5] truncate flex-1">
          {rootPath.split('/').pop() || 'Explorer'}
        </span>
      </div>
      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        {tree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} onToggle={handleToggle} />
        ))}
      </div>
    </div>
  );
}
