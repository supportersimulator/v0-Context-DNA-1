'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { searchLearnings } from '@/lib/api';
import type { Learning } from '@/lib/types';
import { LEARNING_TYPE_CONFIG } from '@/lib/types';
import { useLibrarianQuery } from '@/lib/hooks/use-librarian';
import type { LibrarianIntent } from '@/lib/api/types';
import {
  Search,
  Loader2,
  X,
  FileText,
  Code2,
  GitBranch,
  AlertTriangle,
  TestTube2,
  Package,
  BookOpen,
  Scale,
} from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------
type SearchTab = 'learnings' | 'codebase';

// ---------------------------------------------------------------------------
// Intent metadata for the chip selector
// ---------------------------------------------------------------------------
const INTENT_META: {
  intent: LibrarianIntent;
  label: string;
  icon: typeof FileText;
  description: string;
}[] = [
  { intent: 'locate', label: 'Locate', icon: FileText, description: 'Find files by name, path, or purpose' },
  { intent: 'explain', label: 'Explain', icon: Code2, description: 'Understand how code works' },
  { intent: 'trace', label: 'Trace', icon: GitBranch, description: 'Follow call chains and data flow' },
  { intent: 'impact', label: 'Impact', icon: AlertTriangle, description: 'Assess blast radius of changes' },
  { intent: 'tests', label: 'Tests', icon: TestTube2, description: 'Find related tests and coverage' },
  { intent: 'deps', label: 'Deps', icon: Package, description: 'Map dependency relationships' },
  { intent: 'docs', label: 'Docs', icon: BookOpen, description: 'Find documentation and comments' },
  { intent: 'decision', label: 'Decision', icon: Scale, description: 'Surface architecture decisions and rationale' },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SearchView() {
  const [activeTab, setActiveTab] = useState<SearchTab>('learnings');

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-[#e5e5e5]">Semantic Search</h1>
        <p className="text-sm text-[#8a8a9a]">
          Search through learnings or explore your codebase
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-6 border-b border-[#2a2a35]">
        <button
          onClick={() => setActiveTab('learnings')}
          className={cn(
            'pb-2.5 text-sm font-medium transition-colors relative',
            activeTab === 'learnings'
              ? 'text-[#22c55e]'
              : 'text-[#8a8a9a] hover:text-[#c0c0cc]',
          )}
        >
          Learnings
          {activeTab === 'learnings' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#22c55e] rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('codebase')}
          className={cn(
            'pb-2.5 text-sm font-medium transition-colors relative',
            activeTab === 'codebase'
              ? 'text-[#3b82f6]'
              : 'text-[#8a8a9a] hover:text-[#c0c0cc]',
          )}
        >
          Codebase
          {activeTab === 'codebase' && (
            <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3b82f6] rounded-full" />
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'learnings' ? <LearningsTab /> : <CodebaseTab />}
    </div>
  );
}

// ===========================================================================
// LEARNINGS TAB (preserved from original implementation)
// ===========================================================================
function LearningsTab() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<Learning[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    'docker deployment',
    'async python',
    'database migration',
  ]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const response = await searchLearnings(searchQuery);
      setResults(response.results);
      setTotalCount(response.count);

      // Add to recent searches
      setRecentSearches((prev) => {
        const filtered = prev.filter((s) => s !== searchQuery);
        return [searchQuery, ...filtered].slice(0, 5);
      });
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const debouncedSearch = useDebouncedCallback(performSearch, 300);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  const handleRecentClick = (search: string) => {
    setQuery(search);
    performSearch(search);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setTotalCount(0);
    setHasSearched(false);
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8a8a9a]" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search your learnings..."
          className="w-full pl-12 pr-12 py-3 text-base bg-[#1a1a24] border border-[#2a2a35] rounded-lg text-[#e5e5e5] placeholder-[#6a6a7a] focus:outline-none focus:border-[#22c55e]/50 focus:ring-1 focus:ring-[#22c55e]/25 transition-colors"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#2a2a35] transition-colors"
          >
            <X className="w-5 h-5 text-[#8a8a9a]" />
          </button>
        )}
      </div>

      {/* Status */}
      {isSearching && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#8a8a9a]">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching learnings...
        </div>
      )}

      {/* Recent Searches (when no query) */}
      {!query && !hasSearched && recentSearches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#8a8a9a]">
            Recent Searches
          </h3>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((search) => (
              <button
                key={search}
                onClick={() => handleRecentClick(search)}
                className="px-3 py-1.5 text-sm rounded-lg transition-all bg-[#1a1a24] text-[#8a8a9a] border border-[#2a2a35] hover:border-[#22c55e]/40 hover:text-[#22c55e]"
              >
                {search}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && !isSearching && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#8a8a9a]">
              {results.length} results found
            </span>
          </div>

          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#8a8a9a]">
              <Search className="w-10 h-10 mb-3 text-[#3a3a45]" />
              <p className="text-sm">No results found</p>
              <p className="text-xs mt-1 text-[#6a6a7a]">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((learning) => (
                <SearchResultCard key={learning.id} learning={learning} query={query} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggestions (when no query and no search) */}
      {!query && !hasSearched && (
        <div className="rounded-lg border border-[#2a2a35] bg-[#1a1a24] p-6 text-center space-y-3">
          <Search className="w-8 h-8 mx-auto text-[#3a3a45]" />
          <p className="text-sm text-[#8a8a9a]">
            Try searching for technologies, patterns, or problems you&apos;ve encountered
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-[#0f0f17] text-[#6a6a7a] border border-[#2a2a35]">deployment issues</span>
            <span className="px-2 py-1 rounded bg-[#0f0f17] text-[#6a6a7a] border border-[#2a2a35]">async patterns</span>
            <span className="px-2 py-1 rounded bg-[#0f0f17] text-[#6a6a7a] border border-[#2a2a35]">database optimization</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// CODEBASE TAB (Librarian-powered)
// ===========================================================================
function CodebaseTab() {
  const [selectedIntent, setSelectedIntent] = useState<LibrarianIntent>('locate');
  const [query, setQuery] = useState('');
  const { search, clear, result, loading, error } = useLibrarianQuery();
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setHasSearched(true);
    await search(selectedIntent, query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleClear = () => {
    setQuery('');
    setHasSearched(false);
    clear();
  };

  return (
    <div className="space-y-5">
      {/* Intent chips */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#8a8a9a]">
          Search Intent
        </h3>
        <div className="flex flex-wrap gap-2">
          {INTENT_META.map(({ intent, label, icon: Icon }) => (
            <button
              key={intent}
              onClick={() => setSelectedIntent(intent)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-all',
                selectedIntent === intent
                  ? 'bg-[#3b82f6]/15 border-[#3b82f6]/50 text-[#3b82f6]'
                  : 'bg-[#1a1a24] border-[#2a2a35] text-[#8a8a9a] hover:border-[#3b82f6]/30 hover:text-[#c0c0cc]',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Query input */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8a8a9a]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${INTENT_META.find((m) => m.intent === selectedIntent)?.description ?? 'Search codebase'}...`}
            className="w-full pl-12 pr-10 py-3 text-base bg-[#1a1a24] border border-[#2a2a35] rounded-lg text-[#e5e5e5] placeholder-[#6a6a7a] focus:outline-none focus:border-[#3b82f6]/50 focus:ring-1 focus:ring-[#3b82f6]/25 transition-colors"
          />
          {query && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#2a2a35] transition-colors"
            >
              <X className="w-4 h-4 text-[#8a8a9a]" />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className={cn(
            'px-5 py-3 rounded-lg text-sm font-medium transition-all',
            loading || !query.trim()
              ? 'bg-[#2a2a35] text-[#6a6a7a] cursor-not-allowed'
              : 'bg-[#3b82f6] text-white hover:bg-[#2563eb]',
          )}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-[#2a2a35] bg-[#1a1a24] p-4 space-y-2">
              <div className="h-4 bg-[#2a2a35] rounded w-3/4" />
              <div className="h-3 bg-[#2a2a35] rounded w-1/2" />
              <div className="h-3 bg-[#2a2a35] rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <span className="font-medium">Search failed:</span> {error}
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <div className="space-y-5">
          {/* File results */}
          {result.files.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#8a8a9a]">
                Files ({result.files.length})
              </h3>
              <div className="space-y-2">
                {result.files.map((file, i) => (
                  <div
                    key={`${file.path}-${i}`}
                    className="rounded-lg border border-[#2a2a35] bg-[#1a1a24] p-3 hover:border-[#3b82f6]/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-[#3b82f6] flex-shrink-0" />
                        <span className="text-sm text-[#e5e5e5] font-mono truncate group-hover:text-[#3b82f6] transition-colors">
                          {file.path}
                        </span>
                      </div>
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                        file.relevance >= 0.8
                          ? 'bg-[#22c55e]/15 text-[#22c55e]'
                          : file.relevance >= 0.5
                            ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                            : 'bg-[#2a2a35] text-[#8a8a9a]',
                      )}>
                        {Math.round(file.relevance * 100)}%
                      </span>
                    </div>
                    {file.snippet && (
                      <p className="mt-2 text-xs text-[#8a8a9a] line-clamp-2 font-mono pl-6">
                        {file.snippet}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Snippet results */}
          {result.snippets.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#8a8a9a]">
                Code Snippets ({result.snippets.length})
              </h3>
              <div className="space-y-2">
                {result.snippets.map((snippet, i) => (
                  <div
                    key={`${snippet.file_path}-${snippet.start_line}-${i}`}
                    className="rounded-lg border border-[#2a2a35] bg-[#1a1a24] overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-[#0f0f17] border-b border-[#2a2a35]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Code2 className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0" />
                        <span className="text-xs text-[#c0c0cc] font-mono truncate">
                          {snippet.file_path}
                        </span>
                        <span className="text-xs text-[#6a6a7a]">
                          L{snippet.start_line}-{snippet.end_line}
                        </span>
                      </div>
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0',
                        snippet.relevance >= 0.8
                          ? 'bg-[#22c55e]/15 text-[#22c55e]'
                          : snippet.relevance >= 0.5
                            ? 'bg-[#3b82f6]/15 text-[#3b82f6]'
                            : 'bg-[#2a2a35] text-[#8a8a9a]',
                      )}>
                        {Math.round(snippet.relevance * 100)}%
                      </span>
                    </div>
                    <pre className="px-3 py-2 text-xs text-[#c0c0cc] font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-words">
                      {snippet.content}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related SOPs */}
          {result.related_sops.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#8a8a9a]">
                Related SOPs
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.related_sops.map((sop, i) => (
                  <span
                    key={`sop-${i}`}
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20"
                  >
                    {typeof sop === 'string' ? sop : sop.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer: confidence + query time */}
          <div className="flex items-center justify-between pt-2 border-t border-[#2a2a35]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#8a8a9a]">Confidence</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-[#2a2a35] overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      result.confidence >= 0.7
                        ? 'bg-[#22c55e]'
                        : result.confidence >= 0.4
                          ? 'bg-[#eab308]'
                          : 'bg-[#ef4444]',
                    )}
                    style={{ width: `${Math.round(result.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-[#c0c0cc]">
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>
            </div>
            {result.query_time_ms != null && (
              <span className="text-xs text-[#6a6a7a] font-mono">
                {result.query_time_ms}ms
              </span>
            )}
          </div>

          {/* No results message */}
          {result.files.length === 0 && result.snippets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[#8a8a9a]">
              <Search className="w-10 h-10 mb-3 text-[#3a3a45]" />
              <p className="text-sm">No matching files or snippets found</p>
              <p className="text-xs mt-1 text-[#6a6a7a]">Try a different intent or broader query</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state (no search yet) */}
      {!loading && !result && !hasSearched && (
        <div className="rounded-lg border border-[#2a2a35] bg-[#1a1a24] p-6 space-y-4">
          <div className="text-center space-y-2">
            <Code2 className="w-8 h-8 mx-auto text-[#3a3a45]" />
            <p className="text-sm text-[#8a8a9a]">
              Select an intent and describe what you&apos;re looking for
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {INTENT_META.map(({ intent, label, icon: Icon, description }) => (
              <div
                key={intent}
                className="flex items-start gap-2 p-2.5 rounded-lg bg-[#0f0f17] border border-[#2a2a35]"
              >
                <Icon className="w-3.5 h-3.5 text-[#3b82f6] mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs font-medium text-[#c0c0cc]">{label}</span>
                  <p className="text-[11px] text-[#6a6a7a] leading-tight mt-0.5">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// LEARNING SEARCH RESULT CARD (preserved from original)
// ===========================================================================
interface SearchResultCardProps {
  learning: Learning;
  query: string;
}

function SearchResultCard({ learning, query }: SearchResultCardProps) {
  const config = LEARNING_TYPE_CONFIG[learning.type];

  // Highlight matching text
  const highlightText = (text: string) => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-[#22c55e]/20 text-[#22c55e] rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-[#2a2a35] bg-[#1a1a24] p-4 border-l-2 transition-all duration-200',
        'hover:bg-[#1e1e28]',
        learning.type === 'win' && 'border-l-type-win',
        learning.type === 'fix' && 'border-l-type-fix',
        learning.type === 'pattern' && 'border-l-type-pattern',
        learning.type === 'sop' && 'border-l-type-sop',
        learning.type === 'insight' && 'border-l-type-insight',
        learning.type === 'gotcha' && 'border-l-type-gotcha',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0">{config.emoji}</span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-[#e5e5e5]">
              {highlightText(learning.title)}
            </h3>
            {learning.relevance !== undefined && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-[#22c55e]/10 text-[#22c55e] flex-shrink-0">
                {Math.round(learning.relevance * 100)}% match
              </span>
            )}
          </div>

          <p className="text-xs text-[#8a8a9a] line-clamp-2">
            {highlightText(learning.content)}
          </p>

          {learning.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {learning.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs rounded-full bg-[#0f0f17] text-[#8a8a9a] border border-[#2a2a35]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
