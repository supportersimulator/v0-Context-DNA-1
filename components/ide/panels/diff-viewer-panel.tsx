'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  GitBranch,
  ChevronRight,
  ChevronDown,
  FileText,
  Columns2,
  Rows2,
  RefreshCw,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';
import { getCapabilityBus } from '@/lib/ide/capability-bus';

// Dynamic import for Monaco DiffEditor (SSR disabled)
const DiffEditor = dynamic(
  () => import('@monaco-editor/react').then((mod) => mod.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-[#6b6b75] text-sm">
        Loading diff viewer...
      </div>
    ),
  },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DiffFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'conflict';
  staged: boolean;
  additions: number;
  deletions: number;
}

interface DiffContent {
  original: string;
  modified: string;
  language: string;
}

// ---------------------------------------------------------------------------
// Language detection (shared with editor-store)
// ---------------------------------------------------------------------------
function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', yaml: 'yaml', yml: 'yaml', sh: 'shell', bash: 'shell',
    sql: 'sql', rs: 'rust', go: 'go', java: 'java', rb: 'ruby',
    swift: 'swift', kt: 'kotlin', c: 'c', cpp: 'cpp', h: 'c',
  };
  return map[ext] || 'plaintext';
}

// ---------------------------------------------------------------------------
// Status colors + labels
// ---------------------------------------------------------------------------
function statusColor(status: string): string {
  switch (status) {
    case 'modified': return 'text-[#e5c07b]';
    case 'added': return 'text-[#22c55e]';
    case 'deleted': return 'text-[#ef4444]';
    case 'renamed': return 'text-[#3b82f6]';
    case 'conflict': return 'text-[#f97316]';
    default: return 'text-[#6b6b75]';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'modified': return 'M';
    case 'added': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'conflict': return '!';
    default: return '?';
  }
}

// ---------------------------------------------------------------------------
// Mock data (until backend wired)
// ---------------------------------------------------------------------------
function getMockDiffFiles(): DiffFile[] {
  return [
    { path: 'src/components/App.tsx', status: 'modified', staged: false, additions: 12, deletions: 3 },
    { path: 'src/lib/utils.ts', status: 'modified', staged: true, additions: 5, deletions: 2 },
    { path: 'src/styles/theme.css', status: 'added', staged: false, additions: 45, deletions: 0 },
    { path: 'README.md', status: 'modified', staged: false, additions: 8, deletions: 1 },
  ];
}

function getMockDiffContent(path: string): DiffContent {
  return {
    original: `// Original content of ${path}\n// This shows the previous version\nfunction example() {\n  return 'old';\n}\n`,
    modified: `// Modified content of ${path}\n// This shows the current version\nfunction example() {\n  const value = 'new';\n  return value;\n}\n\n// Added new function\nfunction helper() {\n  return true;\n}\n`,
    language: detectLanguage(path),
  };
}

// ---------------------------------------------------------------------------
// FileListItem
// ---------------------------------------------------------------------------
function FileListItem({
  file,
  isActive,
  onClick,
}: {
  file: DiffFile;
  isActive: boolean;
  onClick: () => void;
}) {
  const fileName = file.path.split('/').pop() ?? file.path;
  const dirPath = file.path.split('/').slice(0, -1).join('/');

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs transition-colors ${
        isActive ? 'bg-[#1a1a24] text-white' : 'text-[#8a8a9a] hover:bg-[#1a1a24]/50 hover:text-[#e5e5e5]'
      }`}
    >
      <span className={`font-mono text-[10px] w-4 text-center font-bold ${statusColor(file.status)}`}>
        {statusLabel(file.status)}
      </span>
      <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[#6b6b75]" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{fileName}</div>
        {dirPath && <div className="truncate text-[10px] text-[#6b6b75]">{dirPath}</div>}
      </div>
      <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
        {file.additions > 0 && <span className="text-[#22c55e]">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-[#ef4444]">-{file.deletions}</span>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// DiffViewerPanel — main export
// ---------------------------------------------------------------------------
export function DiffViewerPanel() {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<DiffContent | null>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'inline'>('side-by-side');
  const [filterMode, setFilterMode] = useState<'all' | 'staged' | 'unstaged'>('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch diff files from backend (falls back to mock)
  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(getServiceUrl('memory_api') + '/api/git/diff/files', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFiles(data.files ?? []);
      setError(null);
    } catch {
      // Fallback to mock data
      setFiles(getMockDiffFiles());
      setError(null);
    }
  }, []);

  // Fetch diff content for selected file
  const fetchDiffContent = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${getServiceUrl('memory_api')}/api/git/diff/content?path=${encodeURIComponent(path)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiffContent({
        original: data.original ?? '',
        modified: data.modified ?? '',
        language: detectLanguage(path),
      });
    } catch {
      setDiffContent(getMockDiffContent(path));
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to file.diff events from other panels (e.g., git panel)
  useEffect(() => {
    const bus = getCapabilityBus();
    const sub = bus.on('file.diff', (data) => {
      setSelectedFile(data.rightPath);
    });
    return () => sub.dispose();
  }, []);

  // Initial load
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Load diff when file selected
  useEffect(() => {
    if (selectedFile) {
      fetchDiffContent(selectedFile);
    }
  }, [selectedFile, fetchDiffContent]);

  // Filter files
  const filteredFiles = files.filter((f) => {
    if (filterMode === 'staged') return f.staged;
    if (filterMode === 'unstaged') return !f.staged;
    return true;
  });

  // Stats
  const totalAdditions = filteredFiles.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = filteredFiles.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <GitBranch className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Diff Viewer</span>

        {/* Filter pills */}
        <div className="flex items-center gap-1 ml-2">
          {(['all', 'staged', 'unstaged'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                filterMode === mode
                  ? 'bg-[#22c55e]/20 text-[#22c55e]'
                  : 'text-[#6b6b75] hover:text-[#e5e5e5]'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Stats */}
        <span className="text-[10px] text-[#22c55e]">+{totalAdditions}</span>
        <span className="text-[10px] text-[#ef4444]">-{totalDeletions}</span>

        {/* View mode toggle */}
        <button
          onClick={() => setViewMode(viewMode === 'side-by-side' ? 'inline' : 'side-by-side')}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
          title={viewMode === 'side-by-side' ? 'Switch to inline' : 'Switch to side-by-side'}
        >
          {viewMode === 'side-by-side' ? (
            <Rows2 className="w-3.5 h-3.5" />
          ) : (
            <Columns2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Refresh */}
        <button
          onClick={fetchFiles}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main content: sidebar + diff */}
      <div className="flex-1 min-h-0 flex">
        {/* File sidebar */}
        {!sidebarCollapsed && (
          <div className="w-[220px] flex-shrink-0 border-r border-[#2a2a35] overflow-y-auto">
            <div className="flex items-center justify-between px-3 py-1 border-b border-[#2a2a35]/50">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b75]">
                Changes ({filteredFiles.length})
              </span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="text-[#6b6b75] hover:text-[#e5e5e5]"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {filteredFiles.map((file) => (
              <FileListItem
                key={file.path}
                file={file}
                isActive={selectedFile === file.path}
                onClick={() => setSelectedFile(file.path)}
              />
            ))}
            {filteredFiles.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-[#6b6b75] text-center">
                No changes
              </div>
            )}
          </div>
        )}

        {/* Sidebar expand button (when collapsed) */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="w-6 flex-shrink-0 flex items-center justify-center border-r border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24]"
          >
            <ChevronDown className="w-3 h-3 -rotate-90" />
          </button>
        )}

        {/* Diff content */}
        <div className="flex-1 min-w-0">
          {!selectedFile ? (
            <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
              <GitBranch className="w-8 h-8 opacity-50" />
              <span className="text-sm">Select a file to view changes</span>
              <span className="text-xs">
                {files.length} file{files.length !== 1 ? 's' : ''} changed
              </span>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-[#6b6b75]">
              <RefreshCw className="w-5 h-5 animate-spin" />
            </div>
          ) : diffContent ? (
            <div className="h-full">
              {/* File header */}
              <div className="flex items-center gap-2 px-3 py-1 border-b border-[#2a2a35] bg-[#0f0f17]">
                <FileText className="w-3.5 h-3.5 text-[#6b6b75]" />
                <span className="text-xs text-[#e5e5e5] font-mono">{selectedFile}</span>
              </div>
              {/* Monaco DiffEditor */}
              <div className="h-[calc(100%-28px)]">
                <DiffEditor
                  original={diffContent.original}
                  modified={diffContent.modified}
                  language={diffContent.language}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    renderSideBySide: viewMode === 'side-by-side',
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    glyphMargin: false,
                    folding: true,
                    renderWhitespace: 'boundary',
                    ignoreTrimWhitespace: false,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
