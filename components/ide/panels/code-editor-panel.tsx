'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { X, Code2 } from 'lucide-react';
import {
  useOpenFiles,
  useActiveFile,
  useEditorStore,
  type EditorFile,
} from '@/lib/ide/editor-store';
import { useSettings, useSettingsVersion } from '@/lib/ide/settings-store';
import { getCapabilityBus } from '@/lib/ide/capability-bus';
import { BreadcrumbBar } from './breadcrumb-bar';

// ---------------------------------------------------------------------------
// Dynamic Monaco import — requires `window`, must skip SSR
// ---------------------------------------------------------------------------

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-[#6b6b75] text-xs">
      Loading editor...
    </div>
  ),
});

// ---------------------------------------------------------------------------
// File extension icon (inline, lightweight)
// ---------------------------------------------------------------------------

function getFileExtIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx'].includes(ext ?? '')) return '\u{1F7E6}';
  if (['js', 'jsx'].includes(ext ?? '')) return '\u{1F7E8}';
  if (ext === 'py') return '\u{1F40D}';
  if (ext === 'json') return '{}';
  if (ext === 'md') return '\u{1F4DD}';
  if (ext === 'css' || ext === 'scss') return '\u{1F3A8}';
  if (ext === 'html') return '\u{1F310}';
  if (ext === 'sh' || ext === 'bash') return '\u{1F4BB}';
  return '\u{1F4C4}';
}

// ---------------------------------------------------------------------------
// Tab component
// ---------------------------------------------------------------------------

function EditorTab({
  file,
  isActive,
  onSelect,
  onClose,
}: {
  file: EditorFile;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        group flex items-center gap-1.5 h-full px-3 text-xs
        border-r border-[#2a2a35]/50 transition-colors relative
        whitespace-nowrap select-none flex-shrink-0
        ${
          isActive
            ? 'bg-[#1a1a24] text-[#e5e5e5]'
            : 'bg-transparent text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#111118]'
        }
      `}
    >
      {/* Green bottom border on active tab */}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#22c55e]" />
      )}

      {/* File icon */}
      <span className="text-[10px] leading-none">{getFileExtIcon(file.name)}</span>

      {/* File name */}
      <span className="max-w-[120px] truncate">{file.name}</span>

      {/* Dirty indicator (dot) */}
      {file.isDirty && (
        <span className="w-2 h-2 rounded-full bg-[#e5e5e5] flex-shrink-0" />
      )}

      {/* Close button — visible on hover or when active */}
      <span
        onClick={onClose}
        className={`
          ml-0.5 p-0.5 rounded transition-all flex-shrink-0
          hover:bg-[#2a2a35] hover:text-[#e5e5e5]
          ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}
        `}
      >
        <X className="w-3 h-3" />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  files,
  activeFile,
  onSelect,
  onClose,
}: {
  files: EditorFile[];
  activeFile: EditorFile | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="flex items-center h-[35px] bg-[#0a0a0f] border-b border-[#2a2a35] overflow-x-auto flex-shrink-0">
      {files.map((file) => (
        <EditorTab
          key={file.path}
          file={file}
          isActive={activeFile?.path === file.path}
          onSelect={() => onSelect(file.path)}
          onClose={(e) => {
            e.stopPropagation();
            onClose(file.path);
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — no files open
// ---------------------------------------------------------------------------

function EmptyState() {
  const isElectron =
    typeof window !== 'undefined' && !!(window as any).electron?.isElectron;

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0f] text-[#4a4a55] select-none gap-3">
      <Code2 className="w-12 h-12 opacity-30" />
      <span className="text-sm">
        {isElectron
          ? 'Open a file from the Explorer'
          : 'File viewing requires Electron'}
      </span>
      <span className="text-xs opacity-60">
        {isElectron
          ? 'Click any file in the sidebar to start editing'
          : 'Use the desktop app for full editor support'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CodeEditorPanel — main export
// ---------------------------------------------------------------------------

export function CodeEditorPanel() {
  const store = useEditorStore();
  const openFiles = useOpenFiles();
  const activeFile = useActiveFile();
  const settings = useSettings();
  const monacoRef = useRef<any>(null);

  // Force re-render when settings change
  useSettingsVersion();

  // Subscribe to file.open events from other panels (git, problems, debug)
  useEffect(() => {
    const bus = getCapabilityBus();
    const sub = bus.on('file.open', (data) => {
      // Open the file tab
      store.openFile(data.path, '');

      // If line specified, scroll Monaco to that line
      if (data.line && monacoRef.current) {
        const editor = monacoRef.current;
        editor.revealLineInCenter(data.line);
        editor.setPosition({ lineNumber: data.line, column: data.column ?? 1 });
        editor.focus();
      }
    });
    return () => sub.dispose();
  }, [store]);

  // Read editor settings from settings store
  const fontSize = settings.get('appearance.fontSize') as number;
  const tabSize = settings.get('editor.tabSize') as number;
  const wordWrap = settings.get('editor.wordWrap') as boolean;
  const minimap = settings.get('editor.minimap') as boolean;

  // Tab handlers
  const handleSelect = useCallback(
    (path: string) => store.setActiveFile(path),
    [store],
  );

  const handleClose = useCallback(
    (path: string) => store.closeFile(path),
    [store],
  );

  // Monaco onChange handler
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile) return;
      store.updateContent(activeFile.path, value ?? '');
    },
    [store, activeFile],
  );

  // No files open — show empty state
  if (openFiles.length === 0 || !activeFile) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Tab bar */}
      <TabBar
        files={openFiles}
        activeFile={activeFile}
        onSelect={handleSelect}
        onClose={handleClose}
      />

      {/* Breadcrumb navigation */}
      <BreadcrumbBar filePath={activeFile.path} />

      {/* Monaco editor — fills remaining space */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={activeFile.language}
          value={activeFile.content}
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={(editor) => { monacoRef.current = editor; }}
          options={{
            fontSize,
            tabSize,
            wordWrap: wordWrap ? 'on' : 'off',
            minimap: { enabled: minimap },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'gutter',
            padding: { top: 8 },
            automaticLayout: true,
            readOnly: activeFile.isReadOnly,
            fontFamily:
              'var(--font-jetbrains), "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
            fontLigatures: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            bracketPairColorization: { enabled: true },
          }}
        />
      </div>
    </div>
  );
}
