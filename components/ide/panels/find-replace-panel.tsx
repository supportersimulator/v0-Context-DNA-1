'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Search,
  Replace,
  ChevronRight,
  ChevronDown,
  FileText,
  RefreshCw,
  X,
  CaseSensitive,
  Regex,
  WholeWord,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SearchMatch {
  line: number;
  column: number;
  text: string;
  preview: string;
}

interface FileResult {
  path: string;
  matches: SearchMatch[];
  expanded: boolean;
}

// ---------------------------------------------------------------------------
// FindReplacePanel — main export
// ---------------------------------------------------------------------------
export function FindReplacePanel() {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Total match count
  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  // Search backend (falls back to mock)
  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearchDone(false);
      return;
    }

    setSearching(true);
    setSearchDone(false);

    try {
      const params = new URLSearchParams({
        q,
        case_sensitive: String(caseSensitive),
        regex: String(useRegex),
        whole_word: String(wholeWord),
        ...(includePattern && { include: includePattern }),
        ...(excludePattern && { exclude: excludePattern }),
      });

      const res = await fetch(`http://127.0.0.1:3456/api/search/files?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(
        (data.results ?? []).map((r: any) => ({ ...r, expanded: true })),
      );
    } catch {
      // Mock results for demo
      setResults(getMockResults(q));
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  }, [caseSensitive, useRegex, wholeWord, includePattern, excludePattern]);

  // Debounced search
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Toggle file expansion
  const toggleFile = useCallback((path: string) => {
    setResults((prev) =>
      prev.map((r) =>
        r.path === path ? { ...r, expanded: !r.expanded } : r,
      ),
    );
  }, []);

  // Expand/collapse all
  const expandAll = useCallback(() => {
    setResults((prev) => prev.map((r) => ({ ...r, expanded: true })));
  }, []);

  const collapseAll = useCallback(() => {
    setResults((prev) => prev.map((r) => ({ ...r, expanded: false })));
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Search input area */}
      <div className="flex-shrink-0 border-b border-[#2a2a35] p-2 space-y-1.5">
        {/* Search row */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="p-0.5 text-[#6b6b75] hover:text-[#e5e5e5] flex-shrink-0"
          >
            {showReplace ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="flex-1 flex items-center bg-[#1a1a24] border border-[#2a2a35] rounded focus-within:border-[#22c55e]/50">
            <Search className="w-3.5 h-3.5 text-[#6b6b75] ml-2 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch(query)}
              placeholder="Search files..."
              className="flex-1 bg-transparent text-xs text-[#e5e5e5] px-2 py-1.5 outline-none placeholder-[#6b6b75]"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setSearchDone(false); }}
                className="p-1 text-[#6b6b75] hover:text-[#e5e5e5]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Toggle buttons */}
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`p-1 rounded text-xs ${caseSensitive ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'}`}
            title="Match Case"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={`p-1 rounded text-xs ${wholeWord ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'}`}
            title="Match Whole Word"
          >
            <WholeWord className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={`p-1 rounded text-xs ${useRegex ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'}`}
            title="Use Regular Expression"
          >
            <Regex className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Replace row */}
        {showReplace && (
          <div className="flex items-center gap-1 pl-5">
            <div className="flex-1 flex items-center bg-[#1a1a24] border border-[#2a2a35] rounded focus-within:border-[#22c55e]/50">
              <Replace className="w-3.5 h-3.5 text-[#6b6b75] ml-2 flex-shrink-0" />
              <input
                type="text"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Replace..."
                className="flex-1 bg-transparent text-xs text-[#e5e5e5] px-2 py-1.5 outline-none placeholder-[#6b6b75]"
              />
            </div>
            <button
              className="px-2 py-1 text-[10px] rounded bg-[#1a1a24] border border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:border-[#22c55e]/30"
              title="Replace All (requires Electron)"
            >
              All
            </button>
          </div>
        )}

        {/* File filters */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-[10px] text-[#6b6b75] hover:text-[#e5e5e5] pl-5"
        >
          {showFilters ? '▾' : '▸'} files to include/exclude
        </button>

        {showFilters && (
          <div className="space-y-1 pl-5">
            <input
              type="text"
              value={includePattern}
              onChange={(e) => setIncludePattern(e.target.value)}
              placeholder="files to include (e.g., *.ts, src/)"
              className="w-full bg-[#1a1a24] border border-[#2a2a35] rounded text-xs text-[#e5e5e5] px-2 py-1 outline-none placeholder-[#6b6b75] focus:border-[#22c55e]/50"
            />
            <input
              type="text"
              value={excludePattern}
              onChange={(e) => setExcludePattern(e.target.value)}
              placeholder="files to exclude (e.g., node_modules, *.min.js)"
              className="w-full bg-[#1a1a24] border border-[#2a2a35] rounded text-xs text-[#e5e5e5] px-2 py-1 outline-none placeholder-[#6b6b75] focus:border-[#22c55e]/50"
            />
          </div>
        )}
      </div>

      {/* Results header */}
      {searchDone && (
        <div className="flex items-center justify-between px-3 py-1 border-b border-[#2a2a35]/50 flex-shrink-0">
          <span className="text-[10px] text-[#6b6b75]">
            {totalMatches} result{totalMatches !== 1 ? 's' : ''} in {results.length} file{results.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={expandAll} className="text-[#6b6b75] hover:text-[#e5e5e5]" title="Expand All">
              <ChevronDown className="w-3 h-3" />
            </button>
            <button onClick={collapseAll} className="text-[#6b6b75] hover:text-[#e5e5e5]" title="Collapse All">
              <ChevronRight className="w-3 h-3" />
            </button>
            <button onClick={() => performSearch(query)} className="text-[#6b6b75] hover:text-[#e5e5e5]" title="Refresh">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-8 text-[#6b6b75]">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Searching...</span>
          </div>
        )}

        {!searching && searchDone && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-[#6b6b75] gap-1">
            <Search className="w-6 h-6 opacity-50" />
            <span className="text-xs">No results found</span>
          </div>
        )}

        {!searching && results.map((file) => (
          <div key={file.path}>
            {/* File header */}
            <button
              onClick={() => toggleFile(file.path)}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-[#1a1a24] text-xs"
            >
              {file.expanded ? (
                <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
              )}
              <FileText className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
              <span className="text-[#e5e5e5] truncate flex-1">{file.path}</span>
              <span className="text-[10px] text-[#6b6b75] bg-[#1a1a24] px-1.5 rounded-full flex-shrink-0">
                {file.matches.length}
              </span>
            </button>

            {/* Matches */}
            {file.expanded && file.matches.map((match, idx) => (
              <button
                key={`${file.path}-${idx}`}
                className="flex items-start gap-2 w-full text-left pl-8 pr-2 py-0.5 hover:bg-[#1a1a24]/50 text-[11px]"
                title={`Line ${match.line}, Column ${match.column}`}
              >
                <span className="text-[#6b6b75] font-mono text-[10px] w-8 text-right flex-shrink-0">
                  {match.line}
                </span>
                <span className="text-[#8a8a9a] truncate">
                  <HighlightedPreview preview={match.preview} query={query} />
                </span>
              </button>
            ))}
          </div>
        ))}

        {!searching && !searchDone && (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
            <Search className="w-8 h-8 opacity-50" />
            <span className="text-sm">Search across files</span>
            <span className="text-xs">Type to start searching</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight matched text in preview
// ---------------------------------------------------------------------------
function HighlightedPreview({ preview, query }: { preview: string; query: string }) {
  if (!query) return <>{preview}</>;

  try {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = preview.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <span key={i} className="bg-[#22c55e]/30 text-[#22c55e] rounded-sm px-0.5">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
  } catch {
    return <>{preview}</>;
  }
}

// ---------------------------------------------------------------------------
// Mock results for demo
// ---------------------------------------------------------------------------
function getMockResults(query: string): FileResult[] {
  const lq = query.toLowerCase();
  const mockFiles = [
    {
      path: 'src/components/dashboard/DashboardShell.tsx',
      lines: [
        { line: 12, text: `import { ${query}Provider } from '@/lib/contexts';` },
        { line: 45, text: `  const ${lq}State = use${query}();` },
        { line: 89, text: `  // Handle ${lq} updates` },
      ],
    },
    {
      path: 'src/lib/hooks/use-diagnostics.ts',
      lines: [
        { line: 23, text: `export function use${query}() {` },
        { line: 67, text: `  return { ${lq}: data, loading, error };` },
      ],
    },
    {
      path: 'src/lib/api/types.ts',
      lines: [
        { line: 5, text: `export interface ${query}Config {` },
      ],
    },
  ];

  return mockFiles.map((f) => ({
    path: f.path,
    expanded: true,
    matches: f.lines.map((l) => ({
      line: l.line,
      column: l.text.toLowerCase().indexOf(lq) + 1,
      text: query,
      preview: l.text.trim(),
    })),
  }));
}
