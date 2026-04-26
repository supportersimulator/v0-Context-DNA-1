'use client';

/**
 * FileTree — collapsible directory tree backed by /api/fs/list.
 *
 * Lazy-loads each directory on first expand. Click a file to call onOpenFile.
 * 14px monospace, 18px row height. Stays under 250 LOC by keeping rendering
 * iterative and pushing all state into useFileTree.
 */
import { useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import { useFileTree, type FsEntry, type DirNode } from '@/lib/hooks/use-file-tree';

export interface FileTreeProps {
  /** Absolute root path. Omit to use API default (superrepo root). */
  rootPath?: string;
  includeHidden?: boolean;
  /** Called with absolute file path when a file row is clicked. */
  onOpenFile?: (absolutePath: string) => void;
  /** Optional currently-open file path (for highlight). */
  activePath?: string;
  className?: string;
}

const ROW_HEIGHT = 18;
const INDENT_PX = 14;
const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

interface RenderRow {
  key: string;
  depth: number;
  entry: FsEntry;
  absolutePath: string;
  parentPath: string;
}

function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  return parent.endsWith('/') ? `${parent}${name}` : `${parent}/${name}`;
}

/**
 * Walk the loaded dir map iteratively, emitting one row per visible entry.
 * Closed dirs short-circuit; not-yet-loaded expanded dirs emit a loading row.
 */
function flatten(
  rootPath: string,
  dirs: Record<string, DirNode>,
  expanded: Set<string>,
): RenderRow[] {
  const rows: RenderRow[] = [];
  const stack: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];

  while (stack.length) {
    const { path: dirPath, depth } = stack.shift()!;
    const node = dirs[dirPath];
    if (!node || !node.entries) continue;

    for (const entry of node.entries) {
      const absolutePath = joinPath(dirPath, entry.name);
      rows.push({
        key: absolutePath,
        depth,
        entry,
        absolutePath,
        parentPath: dirPath,
      });

      if (entry.type === 'dir' && expanded.has(absolutePath)) {
        const child = dirs[absolutePath];
        if (child && child.entries) {
          stack.unshift({ path: absolutePath, depth: depth + 1 });
        } else {
          // Lazy-load placeholder row injected by the renderer below.
        }
      }
    }
  }
  return rows;
}

interface RowProps {
  row: RenderRow;
  expanded: boolean;
  active: boolean;
  childNode: DirNode | undefined;
  onToggle: (p: string) => void;
  onOpen: (p: string) => void;
}

function TreeRow({ row, expanded, active, childNode, onToggle, onOpen }: RowProps) {
  const { entry, depth, absolutePath } = row;
  const isDir = entry.type === 'dir';
  const indent = depth * INDENT_PX + 4;

  const handleClick = useCallback(() => {
    if (isDir) onToggle(absolutePath);
    else onOpen(absolutePath);
  }, [isDir, absolutePath, onToggle, onOpen]);

  const Chevron = expanded ? ChevronDown : ChevronRight;
  const FolderIcon = expanded ? FolderOpen : Folder;

  return (
    <div
      role="treeitem"
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={active || undefined}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      style={{
        height: ROW_HEIGHT,
        paddingLeft: indent,
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: `${ROW_HEIGHT}px`,
      }}
      className={`flex items-center gap-1 cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis ${
        active ? 'bg-accent/40 text-accent-foreground' : 'hover:bg-muted/40'
      }`}
      title={absolutePath}
    >
      {isDir ? (
        <Chevron size={12} className="shrink-0 opacity-70" />
      ) : (
        <span className="inline-block" style={{ width: 12 }} />
      )}
      {isDir ? (
        <FolderIcon size={13} className="shrink-0 text-blue-400/80" />
      ) : (
        <FileText size={13} className="shrink-0 opacity-70" />
      )}
      <span className="truncate">{entry.name}</span>
      {isDir && expanded && childNode?.loading ? (
        <Loader2 size={11} className="ml-auto mr-2 shrink-0 animate-spin opacity-60" />
      ) : null}
      {isDir && expanded && childNode?.error ? (
        <AlertCircle size={11} className="ml-auto mr-2 shrink-0 text-destructive" />
      ) : null}
    </div>
  );
}

export function FileTree({
  rootPath,
  includeHidden = false,
  onOpenFile,
  activePath,
  className,
}: FileTreeProps) {
  const tree = useFileTree({ rootPath, includeHidden });

  const handleOpen = useCallback(
    (p: string) => { onOpenFile?.(p); },
    [onOpenFile],
  );

  const rows = useMemo(() => {
    if (!tree.rootPath) return [];
    return flatten(tree.rootPath, tree.dirs, tree.expanded);
  }, [tree.rootPath, tree.dirs, tree.expanded]);

  if (tree.loading && !tree.rootPath) {
    return (
      <div className={className} style={{ fontFamily: FONT_FAMILY, fontSize: 14, padding: 8 }}>
        <Loader2 size={13} className="inline mr-2 animate-spin opacity-60" />
        loading file tree...
      </div>
    );
  }

  if (tree.error || !tree.rootPath) {
    return (
      <div
        className={className}
        style={{ fontFamily: FONT_FAMILY, fontSize: 14, padding: 8 }}
        role="alert"
      >
        <AlertCircle size={13} className="inline mr-2 text-destructive" />
        {tree.error || 'file tree unavailable'}
      </div>
    );
  }

  const rootNode = tree.dirs[tree.rootPath];

  return (
    <div
      role="tree"
      className={className}
      style={{ fontFamily: FONT_FAMILY, fontSize: 14, userSelect: 'none' }}
    >
      <div
        style={{
          height: ROW_HEIGHT,
          paddingLeft: 4,
          lineHeight: `${ROW_HEIGHT}px`,
          fontSize: 12,
        }}
        className="opacity-60 truncate"
        title={tree.rootPath}
      >
        {tree.rootPath}
      </div>
      {rootNode?.truncated ? (
        <div
          style={{ fontSize: 11, paddingLeft: 4, lineHeight: `${ROW_HEIGHT}px` }}
          className="text-amber-500"
        >
          (truncated to 1000 entries)
        </div>
      ) : null}
      {rows.map((row) => {
        const childNode = row.entry.type === 'dir' ? tree.dirs[row.absolutePath] : undefined;
        return (
          <TreeRow
            key={row.key}
            row={row}
            expanded={tree.expanded.has(row.absolutePath)}
            active={activePath === row.absolutePath}
            childNode={childNode}
            onToggle={tree.toggle}
            onOpen={handleOpen}
          />
        );
      })}
    </div>
  );
}

export default FileTree;
