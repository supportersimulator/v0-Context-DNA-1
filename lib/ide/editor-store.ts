'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { getEventBus } from './event-bus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorFile {
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
  isReadOnly: boolean;
}

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  svg: 'xml',
  env: 'dotenv',
  dockerfile: 'dockerfile',
};

function detectLanguage(filePath: string): string {
  const name = filePath.split('/').pop() ?? '';
  const lower = name.toLowerCase();

  // Special filenames
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';

  const ext = lower.split('.').pop() ?? '';
  return EXTENSION_LANGUAGE[ext] ?? 'plaintext';
}

function extractName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

// ---------------------------------------------------------------------------
// Storage key — persists open file paths (not content)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'contextdna_editor_open_paths';

// ---------------------------------------------------------------------------
// EditorStore
// ---------------------------------------------------------------------------

type Subscriber = () => void;

class EditorStore {
  private files: Map<string, EditorFile> = new Map();
  private activeFilePath: string | null = null;
  private subscribers = new Set<Subscriber>();
  private version = 0;

  constructor() {
    this.loadFromStorage();
  }

  // -----------------------------------------------------------------------
  // openFile — open or focus a file tab
  // -----------------------------------------------------------------------

  openFile(path: string, content: string, isReadOnly = false): void {
    if (!this.files.has(path)) {
      this.files.set(path, {
        path,
        name: extractName(path),
        language: detectLanguage(path),
        content,
        isDirty: false,
        isReadOnly,
      });

      this.emitBus('editor:file-opened' as any, { path });
    }

    this.activeFilePath = path;
    this.bump();
    this.persistToStorage();
  }

  // -----------------------------------------------------------------------
  // closeFile — close a tab, adjust active file
  // -----------------------------------------------------------------------

  closeFile(path: string): void {
    if (!this.files.has(path)) return;
    this.files.delete(path);

    if (this.activeFilePath === path) {
      // Activate the last remaining tab, or null
      const keys = Array.from(this.files.keys());
      this.activeFilePath = keys.length > 0 ? keys[keys.length - 1] : null;
    }

    this.emitBus('editor:file-closed' as any, { path });
    this.bump();
    this.persistToStorage();
  }

  // -----------------------------------------------------------------------
  // setActiveFile
  // -----------------------------------------------------------------------

  setActiveFile(path: string): void {
    if (!this.files.has(path)) return;
    if (this.activeFilePath === path) return;
    this.activeFilePath = path;
    this.bump();
  }

  // -----------------------------------------------------------------------
  // updateContent — replace file content, mark dirty
  // -----------------------------------------------------------------------

  updateContent(path: string, content: string): void {
    const file = this.files.get(path);
    if (!file || file.isReadOnly) return;

    file.content = content;
    file.isDirty = true;

    this.emitBus('editor:file-changed' as any, { path });
    this.bump();
  }

  // -----------------------------------------------------------------------
  // markDirty / markClean
  // -----------------------------------------------------------------------

  markDirty(path: string): void {
    const file = this.files.get(path);
    if (!file || file.isDirty) return;
    file.isDirty = true;
    this.bump();
  }

  markClean(path: string): void {
    const file = this.files.get(path);
    if (!file || !file.isDirty) return;
    file.isDirty = false;
    this.bump();
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getOpenFiles(): EditorFile[] {
    return Array.from(this.files.values());
  }

  getActiveFilePath(): string | null {
    return this.activeFilePath;
  }

  getActiveFile(): EditorFile | null {
    if (!this.activeFilePath) return null;
    return this.files.get(this.activeFilePath) ?? null;
  }

  getFile(path: string): EditorFile | null {
    return this.files.get(path) ?? null;
  }

  getVersion(): number {
    return this.version;
  }

  // -----------------------------------------------------------------------
  // subscribe — for useSyncExternalStore
  // -----------------------------------------------------------------------

  subscribe(handler: Subscriber): () => void {
    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private bump(): void {
    this.version++;
    for (const handler of this.subscribers) {
      try {
        handler();
      } catch (err) {
        console.error('[EditorStore] Subscriber error:', err);
      }
    }
  }

  private emitBus(event: string, data: unknown): void {
    try {
      const bus = getEventBus();
      (bus as any).emit(event, data);
    } catch {
      // EventBus not available (SSR)
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const paths: string[] = JSON.parse(raw);
      if (Array.isArray(paths)) {
        // Restore empty tabs — content must be loaded externally
        for (const p of paths) {
          if (typeof p === 'string' && p.length > 0) {
            this.files.set(p, {
              path: p,
              name: extractName(p),
              language: detectLanguage(p),
              content: '',
              isDirty: false,
              isReadOnly: false,
            });
          }
        }
        if (paths.length > 0) {
          this.activeFilePath = paths[paths.length - 1];
        }
      }
    } catch {
      console.warn('[EditorStore] Failed to parse stored editor paths');
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const paths = Array.from(this.files.keys());
      if (paths.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
      }
    } catch {
      console.warn('[EditorStore] Failed to persist editor paths');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _store: EditorStore | null = null;

export function getEditorStore(): EditorStore {
  if (!_store) {
    _store = new EditorStore();
  }
  return _store;
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * useEditorStore — returns the EditorStore singleton for imperative access.
 */
export function useEditorStore(): EditorStore {
  return getEditorStore();
}

/**
 * useOpenFiles — reactive list of open editor tabs.
 */
export function useOpenFiles(): EditorFile[] {
  const store = getEditorStore();

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );
  const getSnapshot = useCallback(() => store.getOpenFiles(), [store]);
  const getServerSnapshot = useCallback(() => [] as EditorFile[], []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * useActiveFile — reactive active EditorFile (or null).
 */
export function useActiveFile(): EditorFile | null {
  const store = getEditorStore();

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );
  const getSnapshot = useCallback(() => store.getActiveFile(), [store]);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * useActiveFileContent — reactive content string of the active file.
 */
export function useActiveFileContent(): string {
  const store = getEditorStore();

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(cb),
    [store],
  );
  const getSnapshot = useCallback(
    () => store.getActiveFile()?.content ?? '',
    [store],
  );
  const getServerSnapshot = useCallback(() => '', []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
