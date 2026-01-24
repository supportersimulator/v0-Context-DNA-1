'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { fetchRecent } from '@/lib/api';
import type { Learning, LearningType } from '@/lib/types';
import { LEARNING_TYPE_CONFIG } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';

type FilterType = 'all' | LearningType;
type SortType = 'recent' | 'relevance';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'win', label: 'Wins' },
  { value: 'fix', label: 'Fixes' },
  { value: 'pattern', label: 'Patterns' },
  { value: 'sop', label: 'SOPs' },
  { value: 'insight', label: 'Insights' },
  { value: 'gotcha', label: 'Gotchas' },
];

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function ActivityView() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('recent');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useSWR('activity', () => fetchRecent(50), {
    refreshInterval: 30000,
  });

  const filteredLearnings = useMemo(() => {
    let result = data?.recent ?? [];
    
    // Filter by type
    if (filter !== 'all') {
      result = result.filter((l) => l.type === filter);
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(query) ||
          l.content.toLowerCase().includes(query) ||
          l.tags.some((t) => t.toLowerCase().includes(query))
      );
    }
    
    return result;
  }, [data?.recent, filter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Activity Feed</h1>
        <span className="text-sm text-muted-foreground">
          {filteredLearnings.length} learnings
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Type Filters */}
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full transition-all',
                filter === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search learnings..."
            className="pl-9 bg-card border-border text-sm"
          />
        </div>
      </div>

      {/* Learning Cards */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="skeleton w-6 h-6 rounded" />
                <div className="skeleton h-5 w-3/4 rounded" />
              </div>
              <div className="skeleton h-4 w-full rounded" />
              <div className="flex gap-2">
                <div className="skeleton h-5 w-16 rounded-full" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
            </div>
          ))
        ) : filteredLearnings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="text-4xl mb-2">🔍</span>
            <p className="text-sm">No learnings found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          filteredLearnings.map((learning) => (
            <LearningCard
              key={learning.id}
              learning={learning}
              isExpanded={expandedId === learning.id}
              onToggle={() => setExpandedId(expandedId === learning.id ? null : learning.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface LearningCardProps {
  learning: Learning;
  isExpanded: boolean;
  onToggle: () => void;
}

function LearningCard({ learning, isExpanded, onToggle }: LearningCardProps) {
  const config = LEARNING_TYPE_CONFIG[learning.type];
  
  return (
    <div
      className={cn(
        'glass rounded-lg border-l-2 transition-all duration-200',
        'hover:bg-[#1e1e28]',
        learning.type === 'win' && 'border-l-type-win',
        learning.type === 'fix' && 'border-l-type-fix',
        learning.type === 'pattern' && 'border-l-type-pattern',
        learning.type === 'sop' && 'border-l-type-sop',
        learning.type === 'insight' && 'border-l-type-insight',
        learning.type === 'gotcha' && 'border-l-type-gotcha'
      )}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-4"
      >
        <div className="flex items-start gap-3">
          <span className="text-lg flex-shrink-0">{config.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-foreground truncate">
                {learning.title}
              </h3>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatRelativeTime(learning.created_at)}
              </span>
            </div>
            
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {learning.content}
              </p>
            )}
          </div>
          
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap pl-9">
            {learning.content}
          </p>
          
          {learning.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-9">
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
      )}
    </div>
  );
}
