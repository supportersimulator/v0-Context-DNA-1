'use client';

// =============================================================================
// Memory Explorer Panel — THE differentiating panel of ContextDNA IDE
// Browse persistent memory: learnings, SOPs, patterns, evidence claims
// Data survives across sessions — this is the brain's long-term memory viewer
// =============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Brain,
  BookOpen,
  Repeat,
  AlertTriangle,
  Landmark,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronRight,
  Tag,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  Beaker,
  Award,
  X,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryItem {
  id: string;
  title: string;
  content: string;
  category: 'learning' | 'sop' | 'pattern' | 'failure' | 'decision';
  domain: string;
  tags: string[];
  confidence: number;
  applied_count: number;
  created_at: string;
  source: string;
  evidence_status?: 'claim' | 'quarantine' | 'promoted' | 'applied';
}

interface PipelineStats {
  claims: number;
  outcomes: number;
  quarantine: number;
  promotions: number;
  applied_to_wisdom: number;
}

type CategoryFilter = 'all' | MemoryItem['category'];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = getServiceUrl('memory_api');
const REFRESH_INTERVAL = 30_000;
const DEBOUNCE_MS = 300;

const CATEGORY_CONFIG: Record<
  MemoryItem['category'],
  { icon: typeof Brain; label: string; color: string; bgColor: string; borderColor: string }
> = {
  learning: {
    icon: Brain,
    label: 'Learning',
    color: 'text-[#3b82f6]',
    bgColor: 'bg-[#3b82f6]/10',
    borderColor: 'border-[#3b82f6]/20',
  },
  sop: {
    icon: BookOpen,
    label: 'SOP',
    color: 'text-[#22c55e]',
    bgColor: 'bg-[#22c55e]/10',
    borderColor: 'border-[#22c55e]/20',
  },
  pattern: {
    icon: Repeat,
    label: 'Pattern',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/20',
  },
  failure: {
    icon: AlertTriangle,
    label: 'Failure',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/20',
  },
  decision: {
    icon: Landmark,
    label: 'Decision',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10',
    borderColor: 'border-amber-400/20',
  },
};

const EVIDENCE_STATUS_CONFIG: Record<
  NonNullable<MemoryItem['evidence_status']>,
  { icon: typeof Beaker; label: string; color: string; bgColor: string; borderColor: string }
> = {
  claim: {
    icon: Beaker,
    label: 'Claim',
    color: 'text-[#3b82f6]',
    bgColor: 'bg-[#3b82f6]/10',
    borderColor: 'border-[#3b82f6]/20',
  },
  quarantine: {
    icon: ShieldAlert,
    label: 'Quarantine',
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/20',
  },
  promoted: {
    icon: CheckCircle2,
    label: 'Promoted',
    color: 'text-[#22c55e]',
    bgColor: 'bg-[#22c55e]/10',
    borderColor: 'border-[#22c55e]/20',
  },
  applied: {
    icon: Award,
    label: 'Applied',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/20',
  },
};

// ---------------------------------------------------------------------------
// Mock data — fallback when backend is unavailable
// ---------------------------------------------------------------------------

const MOCK_ITEMS: MemoryItem[] = [
  {
    id: 'mock-1',
    title: 'SQLiteStorage singleton bypass causes FD leak',
    content:
      'SQLiteStorage() was being instantiated directly in 3 hot-path locations, bypassing the get_sqlite_storage() singleton. Each instance opened a persistent self.conn that was never closed, causing file descriptor exhaustion under load.',
    category: 'failure',
    domain: 'sqlite',
    tags: ['fd-leak', 'sqlite', 'singleton', 'hot-path'],
    confidence: 0.95,
    applied_count: 3,
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    source: 'session_historian',
    evidence_status: 'promoted',
  },
  {
    id: 'mock-2',
    title: 'Wrap synchronous boto3 calls in asyncio.to_thread()',
    content:
      'Synchronous boto3/whisper/soundfile calls block the asyncio event loop. Always wrap with asyncio.to_thread() to prevent stalling concurrent requests.',
    category: 'sop',
    domain: 'async',
    tags: ['boto3', 'asyncio', 'to_thread', 'blocking'],
    confidence: 0.92,
    applied_count: 7,
    created_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
    source: 'auto_learn',
    evidence_status: 'applied',
  },
  {
    id: 'mock-3',
    title: 'Docker restart does not reload env vars',
    content:
      'docker restart only sends SIGTERM+SIGSTART to the existing container. Environment variables from .env are only read at docker create/run time. Must recreate the container to pick up env changes.',
    category: 'learning',
    domain: 'docker',
    tags: ['docker', 'env', 'restart', 'recreate'],
    confidence: 0.88,
    applied_count: 4,
    created_at: new Date(Date.now() - 5 * 86400_000).toISOString(),
    source: 'manual',
  },
  {
    id: 'mock-4',
    title: 'Git-first incremental codebase graph',
    content:
      'Use git diff to detect changed files, then only re-parse those files for AST graph updates. First run: 42s/244MB. Subsequent: 1.4s/248MB (was 155s/2354MB full parse).',
    category: 'pattern',
    domain: 'performance',
    tags: ['git-diff', 'codebase-graph', 'incremental', 'ast'],
    confidence: 0.97,
    applied_count: 1,
    created_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
    source: 'brain.py',
    evidence_status: 'promoted',
  },
  {
    id: 'mock-5',
    title: 'Use 127.0.0.1 instead of localhost on macOS',
    content:
      'macOS resolves localhost to IPv6 (::1) first, which can cause connection failures with Docker services bound to IPv4. Always use 127.0.0.1 explicitly.',
    category: 'decision',
    domain: 'networking',
    tags: ['macos', 'ipv6', 'localhost', 'docker'],
    confidence: 0.91,
    applied_count: 12,
    created_at: new Date(Date.now() - 14 * 86400_000).toISOString(),
    source: 'architecture.py',
    evidence_status: 'applied',
  },
  {
    id: 'mock-6',
    title: 'WebRTC requires Cloudflare DNS proxy disabled',
    content:
      'WebRTC needs direct UDP connectivity. Cloudflare proxy intercepts and breaks UDP streams. Set DNS records to proxied=false for any WebRTC/TURN endpoints.',
    category: 'learning',
    domain: 'webrtc',
    tags: ['webrtc', 'cloudflare', 'udp', 'dns', 'turn'],
    confidence: 0.85,
    applied_count: 2,
    created_at: new Date(Date.now() - 21 * 86400_000).toISOString(),
    source: 'auto_capture',
    evidence_status: 'claim',
  },
];

const MOCK_STATS: PipelineStats = {
  claims: 2,
  quarantine: 12,
  outcomes: 57,
  promotions: 10,
  applied_to_wisdom: 4,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  if (typeof window === 'undefined') return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return '';
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'bg-[#22c55e]';
  if (confidence >= 0.5) return 'bg-amber-400';
  return 'bg-red-400';
}

function classifyItem(item: {
  title?: string;
  content?: string;
  tags?: string[];
  area?: string;
}): MemoryItem['category'] {
  const text = `${item.title ?? ''} ${item.content ?? ''} ${(item.tags ?? []).join(' ')} ${item.area ?? ''}`.toLowerCase();
  if (text.includes('sop') || text.includes('procedure') || text.includes('protocol')) return 'sop';
  if (text.includes('pattern') || text.includes('recurring') || text.includes('aggregat')) return 'pattern';
  if (text.includes('fail') || text.includes('bug') || text.includes('error') || text.includes('crash')) return 'failure';
  if (text.includes('decision') || text.includes('architecture') || text.includes('chose') || text.includes('rationale')) return 'decision';
  return 'learning';
}

// Transform raw API response items into MemoryItem shape
function normalizeApiItem(raw: Record<string, unknown>): MemoryItem {
  const id = String(raw.id ?? raw.learning_id ?? Math.random().toString(36).slice(2));
  const title = String(raw.title ?? raw.statement ?? raw.content ?? '').slice(0, 120);
  const content = String(raw.content ?? raw.details ?? raw.statement ?? '');
  const tags: string[] = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
  const domain = String(raw.domain ?? raw.area ?? raw.source ?? 'general');
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.5;
  const applied_count = typeof raw.applied_count === 'number' ? raw.applied_count : 0;
  const created_at = String(raw.created_at ?? raw.timestamp ?? new Date().toISOString());
  const source = String(raw.source ?? 'api');
  const evidence_status = raw.evidence_status as MemoryItem['evidence_status'] | undefined;
  const category = classifyItem({ title, content, tags, area: domain });

  return { id, title, content, category, domain, tags, confidence, applied_count, created_at, source, evidence_status };
}

// ---------------------------------------------------------------------------
// Data fetching hooks (inline, no external hook dependency)
// ---------------------------------------------------------------------------

function useMemoryItems(query: string) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchItems = useCallback(async (searchQuery: string) => {
    if (typeof window === 'undefined') return;
    try {
      const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${API_BASE}/api/learnings${params}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const rawItems: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : Array.isArray(data.learnings)
          ? data.learnings
          : Array.isArray(data.items)
            ? data.items
            : [];
      setItems(rawItems.map(normalizeApiItem));
      setUsingMock(false);
      setError(null);
      setLastSynced(new Date());
    } catch {
      // Fallback to mock data
      if (items.length === 0 || usingMock) {
        const filtered = searchQuery
          ? MOCK_ITEMS.filter(
              (m) =>
                m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())),
            )
          : MOCK_ITEMS;
        setItems(filtered);
        setUsingMock(true);
        setLastSynced(new Date());
      }
      setError('Backend offline — showing cached data');
    } finally {
      setIsLoading(false);
    }
  }, [items.length, usingMock]);

  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchItems(query);
  }, [fetchItems, query]);

  // Initial fetch + polling
  useEffect(() => {
    setIsLoading(true);
    fetchItems(query);
    intervalRef.current = setInterval(() => fetchItems(query), REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [query, fetchItems]);

  return { items, isLoading, error, lastSynced, usingMock, refresh };
}

function usePipelineStats() {
  const [stats, setStats] = useState<PipelineStats | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    async function fetchStats() {
      try {
        const res = await fetch(`${API_BASE}/api/evidence/pipeline-stats`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setStats(MOCK_STATS);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return stats;
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryIcon({ category, size = 'w-3.5 h-3.5' }: { category: MemoryItem['category']; size?: string }) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  return <Icon className={`${size} ${config.color} flex-shrink-0`} />;
}

function DomainBadge({ domain }: { domain: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#12121a] text-[#6b6b75] border border-[#2a2a35] truncate max-w-[80px]">
      {domain}
    </span>
  );
}

function EvidenceStatusBadge({ status }: { status: NonNullable<MemoryItem['evidence_status']> }) {
  const config = EVIDENCE_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className="text-[10px] text-[#6b6b75]">{(confidence * 100).toFixed(0)}%</span>
      <div className="w-10 h-1 rounded-full bg-[#2a2a35] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${confidenceColor(confidence)}`}
          style={{ width: `${Math.min(100, confidence * 100)}%` }}
        />
      </div>
    </div>
  );
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-[#1a1a24] text-[#a0a0ab] border border-[#2a2a35]">
      <Tag className="w-2 h-2" />
      {tag}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MemoryItemRow — single item, expandable
// ---------------------------------------------------------------------------

function MemoryItemRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: MemoryItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = CATEGORY_CONFIG[item.category];

  return (
    <div className="border-b border-[#2a2a35]/50 last:border-b-0">
      {/* Collapsed row */}
      <button
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-[#1a1a24] transition-colors"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
        )}
        <CategoryIcon category={item.category} />
        <span className="text-xs text-[#e5e5e5] truncate flex-1 leading-tight">{item.title}</span>
        <ConfidenceBar confidence={item.confidence} />
      </button>

      {/* Collapsed metadata line */}
      {!isExpanded && (
        <div className="flex items-center gap-2 px-3 pb-1.5 pl-[52px] flex-wrap">
          <DomainBadge domain={item.domain} />
          <span className="text-[10px] text-[#6b6b75] flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {timeAgo(item.created_at)}
          </span>
          {item.evidence_status && <EvidenceStatusBadge status={item.evidence_status} />}
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="px-3 pb-3 pl-[52px] space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {/* Full content */}
          <p className="text-xs text-[#c5c5cf] leading-relaxed whitespace-pre-wrap">{item.content}</p>

          {/* Metadata row */}
          <div className="flex items-center gap-2 flex-wrap">
            <DomainBadge domain={item.domain} />
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}
            >
              <CategoryIcon category={item.category} size="w-2.5 h-2.5" />
              {config.label}
            </span>
            {item.evidence_status && <EvidenceStatusBadge status={item.evidence_status} />}
            <span className="text-[10px] text-[#6b6b75] flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(item.created_at)}
            </span>
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {item.tags.map((tag) => (
                <TagChip key={tag} tag={tag} />
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-[10px] text-[#6b6b75]">
            {item.applied_count > 0 && (
              <span>Applied {item.applied_count} time{item.applied_count !== 1 ? 's' : ''}</span>
            )}
            <span>Source: {item.source}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ query, category }: { query: string; category: CategoryFilter }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-full bg-[#3b82f6]/10 flex items-center justify-center mb-3">
        <Brain className="w-6 h-6 text-[#3b82f6]" />
      </div>
      <h3 className="text-sm font-medium text-[#e5e5e5] mb-1">
        {query ? 'No matches found' : 'No memory items'}
      </h3>
      <p className="text-xs text-[#6b6b75] max-w-[260px]">
        {query
          ? `No ${category === 'all' ? '' : category + ' '}items match "${query}". Try a different search term.`
          : 'Memory items are captured automatically from sessions, bug fixes, architecture decisions, and performance optimizations.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemoryExplorerPanel — main export
// ---------------------------------------------------------------------------

export function MemoryExplorerPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchInput, DEBOUNCE_MS);
  const { items, isLoading, error, lastSynced, usingMock, refresh } = useMemoryItems(debouncedQuery);
  const pipelineStats = usePipelineStats();

  // Filter items by category
  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return items;
    return items.filter((item) => item.category === activeCategory);
  }, [items, activeCategory]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Pipeline health
  const pipelineHealth = useMemo<'green' | 'amber' | 'red'>(() => {
    if (!pipelineStats) return 'red';
    if (pipelineStats.applied_to_wisdom > 0 && pipelineStats.promotions > 0) return 'green';
    if (pipelineStats.claims > 0 || pipelineStats.outcomes > 0) return 'amber';
    return 'red';
  }, [pipelineStats]);

  const healthDotColor =
    pipelineHealth === 'green' ? 'bg-[#22c55e]' : pipelineHealth === 'amber' ? 'bg-amber-400' : 'bg-red-400';

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
  }, []);

  const tabs: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'learning', label: 'Learnings' },
    { key: 'sop', label: 'SOPs' },
    { key: 'pattern', label: 'Patterns' },
    { key: 'failure', label: 'Failures' },
    { key: 'decision', label: 'Decisions' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Search bar */}
      <div className="px-3 pt-2 pb-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b6b75] pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search memory... (learnings, SOPs, patterns)"
              className="w-full pl-7 pr-7 py-1.5 text-xs bg-[#12121a] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#6b6b75] focus:outline-none focus:border-[#22c55e]/50 transition-colors"
            />
            {searchInput && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={refresh}
            className="p-1.5 text-[#6b6b75] hover:text-[#e5e5e5] transition-colors rounded hover:bg-[#1a1a24]"
            title="Refresh memory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex border-b border-[#2a2a35] overflow-x-auto flex-shrink-0 scrollbar-none">
        {tabs.map((tab) => {
          const count = categoryCounts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors relative whitespace-nowrap flex-shrink-0 ${
                activeCategory === tab.key
                  ? 'text-[#e5e5e5]'
                  : 'text-[#6b6b75] hover:text-[#a0a0ab]'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`text-[9px] px-1 py-0 rounded-full min-w-[16px] text-center ${
                    activeCategory === tab.key
                      ? 'bg-[#22c55e]/20 text-[#22c55e]'
                      : 'bg-[#2a2a35] text-[#6b6b75]'
                  }`}
                >
                  {count}
                </span>
              )}
              {activeCategory === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#22c55e]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 bg-amber-400/5 border-b border-amber-400/10 flex items-center gap-2 flex-shrink-0">
          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-amber-400 flex-1 truncate">{error}</span>
        </div>
      )}

      {/* Memory items list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-[#3b82f6] animate-spin" />
            <span className="ml-2 text-xs text-[#6b6b75]">Loading memory...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState query={debouncedQuery} category={activeCategory} />
        ) : (
          filteredItems.map((item) => (
            <MemoryItemRow
              key={item.id}
              item={item}
              isExpanded={expandedId === item.id}
              onToggle={() => handleToggle(item.id)}
            />
          ))
        )}
      </div>

      {/* Stats footer */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#2a2a35] bg-[#08080d] flex-shrink-0">
        <span className="text-[10px] text-[#6b6b75]">
          {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          {usingMock && ' (mock)'}
        </span>
        {lastSynced && (
          <span className="text-[10px] text-[#6b6b75] flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            Synced {timeAgo(lastSynced.toISOString())}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-[#6b6b75]">Pipeline</span>
          <span className={`w-2 h-2 rounded-full ${healthDotColor}`} title={`Evidence pipeline: ${pipelineHealth}`} />
        </div>
      </div>
    </div>
  );
}
