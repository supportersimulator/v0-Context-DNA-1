'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { searchLearnings } from '@/lib/api';
import type { Learning } from '@/lib/types';
import { LEARNING_TYPE_CONFIG } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Search, Loader2, X } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

export function SearchView() {
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
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Semantic Search</h1>
        <p className="text-sm text-muted-foreground">
          Search through your learnings using natural language
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search your learnings..."
          className="pl-12 pr-12 py-6 text-lg bg-card border-border"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Status */}
      {isSearching && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching learnings...
        </div>
      )}

      {/* Recent Searches (when no query) */}
      {!query && !hasSearched && recentSearches.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent Searches
          </h3>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((search) => (
              <button
                key={search}
                onClick={() => handleRecentClick(search)}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-lg transition-all',
                  'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                )}
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
            <span className="text-sm text-muted-foreground">
              {results.length} results found
            </span>
          </div>

          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <span className="text-4xl mb-2">🔍</span>
              <p className="text-sm">No results found</p>
              <p className="text-xs mt-1">Try a different search term</p>
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
        <div className="glass rounded-lg p-6 text-center space-y-3">
          <span className="text-3xl">🔮</span>
          <p className="text-sm text-muted-foreground">
            Try searching for technologies, patterns, or problems you&apos;ve encountered
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">deployment issues</span>
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">async patterns</span>
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">database optimization</span>
          </div>
        </div>
      )}
    </div>
  );
}

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
        <mark key={i} className="bg-primary/20 text-primary rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      className={cn(
        'glass rounded-lg p-4 border-l-2 transition-all duration-200',
        'hover:bg-[#1e1e28]',
        learning.type === 'win' && 'border-l-type-win',
        learning.type === 'fix' && 'border-l-type-fix',
        learning.type === 'pattern' && 'border-l-type-pattern',
        learning.type === 'sop' && 'border-l-type-sop',
        learning.type === 'insight' && 'border-l-type-insight',
        learning.type === 'gotcha' && 'border-l-type-gotcha'
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0">{config.emoji}</span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {highlightText(learning.title)}
            </h3>
            {learning.relevance !== undefined && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary flex-shrink-0">
                {Math.round(learning.relevance * 100)}% match
              </span>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground line-clamp-2">
            {highlightText(learning.content)}
          </p>
          
          {learning.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {learning.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
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
