'use client';

/**
 * CodeEditor — Monaco wrapper wired to /api/fs/{read,write}.
 *
 * Loads on filePath change, tracks dirty state vs the loaded baseline, and
 * saves on Cmd-S / Ctrl-S. State machine: idle → modified → saving →
 * saved | failed. Theme: vs-dark. Language auto-detected from extension.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Monaco needs window — skip SSR.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-[#6b6b75] text-xs">
      Loading editor...
    </div>
  ),
});

const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', json: 'json', md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml', css: 'css', scss: 'scss', html: 'html',
  sh: 'shell', bash: 'shell', sql: 'sql', rs: 'rust', go: 'go',
};

function detectLanguage(filePath: string | null, override?: string): string {
  if (override) return override;
  if (!filePath) return 'plaintext';
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? 'plaintext';
}

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'failed'; error: string };

function formatRelative(at: number): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

export interface CodeEditorProps {
  filePath: string | null;
  language?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSave?: (path: string, content: string) => Promise<void>;
}

type EditorState = {
  content: string;
  baseline: string;
  loading: boolean;
  loadError: string | null;
  status: SaveStatus;
};
type EditorAction =
  | { type: 'reset' }
  | { type: 'start' }
  | { type: 'loaded'; text: string }
  | { type: 'failed'; error: string }
  | { type: 'edit'; text: string }
  | { type: 'saving' }
  | { type: 'saved'; text: string; at: number }
  | { type: 'save_failed'; error: string };

const INIT: EditorState = {
  content: '', baseline: '', loading: false, loadError: null, status: { kind: 'idle' },
};

function reducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'reset': return INIT;
    case 'start': return { ...INIT, loading: true };
    case 'loaded': return { content: a.text, baseline: a.text, loading: false, loadError: null, status: { kind: 'idle' } };
    case 'failed': return { ...s, loading: false, loadError: a.error };
    case 'edit': return { ...s, content: a.text };
    case 'saving': return { ...s, status: { kind: 'saving' } };
    case 'saved': return { ...s, baseline: a.text, status: { kind: 'saved', at: a.at } };
    case 'save_failed': return { ...s, status: { kind: 'failed', error: a.error } };
  }
}

export function CodeEditor({ filePath, language, onDirtyChange, onSave }: CodeEditorProps) {
  const [state, dispatch] = useReducer(reducer, INIT);
  const { content, baseline, loading, loadError, status } = state;
  const [, setTick] = useState(0); // drives "Saved Ns ago" relabel

  // Refs for the global keydown handler so it doesn't re-bind every keystroke.
  const contentRef = useRef(content);
  const baselineRef = useRef(baseline);
  const filePathRef = useRef(filePath);
  useEffect(() => {
    contentRef.current = content;
    baselineRef.current = baseline;
    filePathRef.current = filePath;
  });

  const dirty = content !== baseline;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // Refresh the relative-time label every 5s while in 'saved' state.
  useEffect(() => {
    if (status.kind !== 'saved') return;
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [status.kind]);

  // Load file when filePath changes.
  useEffect(() => {
    if (!filePath) { dispatch({ type: 'reset' }); return; }
    let cancelled = false;
    dispatch({ type: 'start' });
    fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        const text = typeof data.content === 'string' ? data.content : '';
        if (!cancelled) dispatch({ type: 'loaded', text });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          dispatch({ type: 'failed', error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => { cancelled = true; };
  }, [filePath]);

  // Save: POST /api/fs/write or delegate to onSave.
  const save = useCallback(async () => {
    const path = filePathRef.current;
    const text = contentRef.current;
    if (!path || baselineRef.current === text) return;
    dispatch({ type: 'saving' });
    try {
      if (onSave) {
        await onSave(path, text);
      } else {
        const res = await fetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content: text }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      dispatch({ type: 'saved', text, at: Date.now() });
    } catch (err: unknown) {
      dispatch({ type: 'save_failed', error: err instanceof Error ? err.message : String(err) });
    }
  }, [onSave]);

  // Cmd-S / Ctrl-S — works whether or not Monaco has focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  let statusLabel = '';
  if (loadError) statusLabel = `Load failed: ${loadError}`;
  else if (loading) statusLabel = 'Loading...';
  else if (status.kind === 'saving') statusLabel = 'Saving...';
  else if (status.kind === 'failed') statusLabel = `Save failed: ${status.error}`;
  else if (dirty) statusLabel = 'Modified';
  else if (status.kind === 'saved') statusLabel = `Saved ${formatRelative(status.at)}`;

  if (!filePath) return null;

  const statusColor =
    status.kind === 'failed' || loadError ? 'text-[#ef4444]'
      : dirty ? 'text-[#f59e0b]'
        : 'text-[#6b6b75]';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      <div className="flex items-center justify-between h-[28px] px-3 bg-[#0d0d14] border-b border-[#2a2a35] text-[11px] text-[#6b6b75] flex-shrink-0">
        <span className="truncate font-mono">{filePath}</span>
        <span className={statusColor}>{statusLabel}</span>
      </div>
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={detectLanguage(filePath, language)}
          value={content}
          theme="vs-dark"
          onChange={(v) => dispatch({ type: 'edit', text: v ?? '' })}
          options={{
            fontSize: 13,
            tabSize: 2,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontFamily: 'var(--font-jetbrains), "JetBrains Mono", "Fira Code", Menlo, monospace',
            fontLigatures: true,
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
}

export default CodeEditor;
