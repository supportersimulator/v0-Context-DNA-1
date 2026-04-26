'use client';

// =============================================================================
// useFileTree — React hook wrapping /api/fs/list for the IDE file tree
// Stores expansion state, lazy-loads children per directory, exposes refresh.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export type FsEntryType = 'file' | 'dir';

export interface FsEntry {
  name: string;
  type: FsEntryType;
  size?: number;
  modified?: number;
}

export interface FsListResponse {
  ok: boolean;
  path: string;
  entries: FsEntry[];
  truncated?: boolean;
  error?: string;
}

export interface DirNode {
  /** Absolute path. */
  path: string;
  entries: FsEntry[] | null;
  loading: boolean;
  error: string | null;
  truncated: boolean;
}

export interface UseFileTreeOptions {
  /** Root absolute path, or undefined to let the API default to superrepo. */
  rootPath?: string;
  /** Include dotfiles + node_modules etc. */
  includeHidden?: boolean;
}

export interface UseFileTreeResult {
  rootPath: string | null;
  /** Map of absolute-dir-path -> node state. */
  dirs: Record<string, DirNode>;
  /** Set of expanded directory paths. */
  expanded: Set<string>;
  loading: boolean;
  error: string | null;
  toggle: (dirPath: string) => Promise<void>;
  expand: (dirPath: string) => Promise<void>;
  collapse: (dirPath: string) => void;
  refresh: (dirPath?: string) => Promise<void>;
}

function buildQuery(p: string | undefined, hidden: boolean): string {
  const params = new URLSearchParams();
  if (p) params.set('path', p);
  if (hidden) params.set('hidden', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function fetchList(p: string | undefined, hidden: boolean): Promise<FsListResponse> {
  const res = await fetch(`/api/fs/list${buildQuery(p, hidden)}`, { cache: 'no-store' });
  const json = (await res.json()) as FsListResponse;
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

export function useFileTree(opts: UseFileTreeOptions = {}): UseFileTreeResult {
  const { rootPath: rootPathOpt, includeHidden = false } = opts;

  const [rootPath, setRootPath] = useState<string | null>(rootPathOpt ?? null);
  const [dirs, setDirs] = useState<Record<string, DirNode>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const setNode = useCallback((p: string, patch: Partial<DirNode>) => {
    setDirs((prev) => {
      const existing = prev[p] ?? {
        path: p, entries: null, loading: false, error: null, truncated: false,
      };
      return { ...prev, [p]: { ...existing, ...patch } };
    });
  }, []);

  const loadDir = useCallback(async (p: string | undefined): Promise<string | null> => {
    setNode(p ?? '__root__', { loading: true, error: null });
    try {
      const json = await fetchList(p, includeHidden);
      if (!aliveRef.current) return null;
      setDirs((prev) => ({
        ...prev,
        [json.path]: {
          path: json.path,
          entries: json.entries,
          loading: false,
          error: null,
          truncated: Boolean(json.truncated),
        },
      }));
      return json.path;
    } catch (e) {
      if (!aliveRef.current) return null;
      const msg = e instanceof Error ? e.message : 'list failed';
      setNode(p ?? '__root__', { loading: false, error: msg });
      return null;
    }
  }, [includeHidden, setNode]);

  // Initial root load. Wrapped in queueMicrotask so we don't call setState
  // synchronously inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || !aliveRef.current) return;
      setLoading(true);
      setError(null);
      loadDir(rootPathOpt).then((resolvedPath) => {
        if (cancelled || !aliveRef.current) return;
        if (resolvedPath) {
          setRootPath(resolvedPath);
          setExpanded((prev) => new Set(prev).add(resolvedPath));
        } else {
          setError('failed to load root directory');
        }
        setLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [rootPathOpt, loadDir]);

  const expand = useCallback(async (dirPath: string) => {
    setExpanded((prev) => {
      if (prev.has(dirPath)) return prev;
      const next = new Set(prev);
      next.add(dirPath);
      return next;
    });
    if (!dirs[dirPath] || dirs[dirPath].entries === null) {
      await loadDir(dirPath);
    }
  }, [dirs, loadDir]);

  const collapse = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      if (!prev.has(dirPath)) return prev;
      const next = new Set(prev);
      next.delete(dirPath);
      return next;
    });
  }, []);

  const toggle = useCallback(async (dirPath: string) => {
    if (expanded.has(dirPath)) collapse(dirPath);
    else await expand(dirPath);
  }, [expanded, expand, collapse]);

  const refresh = useCallback(async (dirPath?: string) => {
    const target = dirPath ?? rootPath ?? undefined;
    await loadDir(target);
  }, [rootPath, loadDir]);

  return { rootPath, dirs, expanded, loading, error, toggle, expand, collapse, refresh };
}
