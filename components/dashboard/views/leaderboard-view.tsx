'use client';

import { useState, useMemo, useCallback, useEffect, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Trophy,
  ArrowUp,
  ArrowDown,
  Copy,
  Filter,
  Check,
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HardwareClass =
  | 'All'
  | 'Apple Silicon 32GB'
  | 'Apple Silicon 64GB'
  | 'Apple Silicon 128GB'
  | 'NVIDIA RTX 40xx'
  | 'NVIDIA RTX 30xx';

export type ModelFilter =
  | 'All'
  | 'Qwen3-14B'
  | 'Llama-3-8B'
  | 'Mistral-7B'
  | 'DeepSeek-Coder-V2'
  | 'CodeLlama-34B'
  | 'Phi-3-14B';

export type RuntimeFilter =
  | 'All'
  | 'vLLM-MLX'
  | 'Ollama'
  | 'llama.cpp'
  | 'MLX';

export type SuiteFilter =
  | 'All'
  | 'TTFT_SHORT'
  | 'SUSTAINED'
  | 'LONG_CONTEXT';

export type SortField = 'decode_toks' | 'ttft' | 'e2e_latency';

export interface LeaderboardFilters {
  hardware: HardwareClass;
  model: ModelFilter;
  runtime: RuntimeFilter;
  suite: SuiteFilter;
  sortBy: SortField;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  model: string;
  runtime: Exclude<RuntimeFilter, 'All'>;
  quantization: string;
  decodeTokS: number;
  ttftP50Ms: number;
  e2eP50Ms: number;
  hardwareClass: Exclude<HardwareClass, 'All'>;
  date: string;
  /** true if this entry belongs to the current user */
  isCurrentUser: boolean;
  /** Extended details shown on row expand */
  details: LeaderboardEntryDetails;
}

export interface LeaderboardEntryDetails {
  ttftP95Ms: number;
  ttftP99Ms: number;
  e2eP95Ms: number;
  e2eP99Ms: number;
  promptTokS: number;
  ramUsageGB: number;
  gpuUtilPct: number;
  suite: Exclude<SuiteFilter, 'All'>;
  sampleCount: number;
  chipName: string;
  osVersion: string;
  submittedBy: string;
}

// ---------------------------------------------------------------------------
// Panel metadata export (for panel-factory registration)
// ---------------------------------------------------------------------------

export const leaderboardPanelMeta = {
  id: 'leaderboard' as const,
  label: 'Leaderboard',
  description: 'Community benchmark leaderboard -- compare local LLM performance',
  pages: ['dashboard', 'synaptic', 'live'] as const,
  minWidth: 300,
  minHeight: 200,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HARDWARE_OPTIONS: HardwareClass[] = [
  'All',
  'Apple Silicon 32GB',
  'Apple Silicon 64GB',
  'Apple Silicon 128GB',
  'NVIDIA RTX 40xx',
  'NVIDIA RTX 30xx',
];

const MODEL_OPTIONS: ModelFilter[] = [
  'All',
  'Qwen3-14B',
  'Llama-3-8B',
  'Mistral-7B',
  'DeepSeek-Coder-V2',
  'CodeLlama-34B',
  'Phi-3-14B',
];

const RUNTIME_OPTIONS: RuntimeFilter[] = [
  'All',
  'vLLM-MLX',
  'Ollama',
  'llama.cpp',
  'MLX',
];

const SUITE_OPTIONS: SuiteFilter[] = [
  'All',
  'TTFT_SHORT',
  'SUSTAINED',
  'LONG_CONTEXT',
];

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'decode_toks', label: 'Decode tok/s' },
  { value: 'ttft', label: 'TTFT' },
  { value: 'e2e_latency', label: 'End-to-end latency' },
];

// ---------------------------------------------------------------------------
// Mock data generator (deterministic)
// ---------------------------------------------------------------------------

const MODELS_POOL: { name: string; quants: string[] }[] = [
  { name: 'Qwen3-14B', quants: ['4-bit', '8-bit'] },
  { name: 'Llama-3-8B', quants: ['4-bit', '8-bit', 'FP16'] },
  { name: 'Mistral-7B', quants: ['4-bit', '8-bit'] },
  { name: 'DeepSeek-Coder-V2', quants: ['4-bit', '8-bit'] },
  { name: 'CodeLlama-34B', quants: ['4-bit'] },
  { name: 'Phi-3-14B', quants: ['4-bit', '8-bit'] },
];

const RUNTIMES_POOL: Exclude<RuntimeFilter, 'All'>[] = [
  'vLLM-MLX',
  'Ollama',
  'llama.cpp',
  'MLX',
];

const HW_POOL: Exclude<HardwareClass, 'All'>[] = [
  'Apple Silicon 32GB',
  'Apple Silicon 64GB',
  'Apple Silicon 128GB',
  'NVIDIA RTX 40xx',
  'NVIDIA RTX 30xx',
];

const SUITES_POOL: Exclude<SuiteFilter, 'All'>[] = [
  'TTFT_SHORT',
  'SUSTAINED',
  'LONG_CONTEXT',
];

const CHIP_MAP: Record<string, string[]> = {
  'Apple Silicon 32GB': ['M2 Pro', 'M3', 'M3 Pro'],
  'Apple Silicon 64GB': ['M2 Max', 'M3 Max', 'M4 Pro'],
  'Apple Silicon 128GB': ['M2 Ultra', 'M3 Ultra', 'M4 Max'],
  'NVIDIA RTX 40xx': ['RTX 4090', 'RTX 4080', 'RTX 4070 Ti'],
  'NVIDIA RTX 30xx': ['RTX 3090', 'RTX 3080', 'RTX 3070'],
};

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateMockEntries(): LeaderboardEntry[] {
  const rng = seededRandom(42);
  const entries: LeaderboardEntry[] = [];

  for (let i = 0; i < 20; i++) {
    const modelInfo = MODELS_POOL[Math.floor(rng() * MODELS_POOL.length)];
    const quant = modelInfo.quants[Math.floor(rng() * modelInfo.quants.length)];
    const runtime = RUNTIMES_POOL[Math.floor(rng() * RUNTIMES_POOL.length)];
    const hw = HW_POOL[Math.floor(rng() * HW_POOL.length)];
    const suite = SUITES_POOL[Math.floor(rng() * SUITES_POOL.length)];
    const chips = CHIP_MAP[hw];
    const chip = chips[Math.floor(rng() * chips.length)];

    // Realistic performance: Apple Silicon ~35-95 tok/s, NVIDIA ~55-135 tok/s
    const baseDecodeApple = hw.startsWith('Apple') ? 35 + rng() * 60 : 55 + rng() * 80;
    const quantMultiplier = quant === 'FP16' ? 0.5 : quant === '8-bit' ? 0.75 : 1.0;
    const decodeTokS = Math.round(baseDecodeApple * quantMultiplier * 10) / 10;

    const ttftP50 = Math.round((80 + rng() * 400) * 10) / 10;
    const e2eP50 = Math.round((ttftP50 + 200 + rng() * 1500) * 10) / 10;

    const daysAgo = Math.floor(rng() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    entries.push({
      id: `entry-${i}`,
      rank: 0,
      model: modelInfo.name,
      runtime,
      quantization: quant,
      decodeTokS,
      ttftP50Ms: ttftP50,
      e2eP50Ms: e2eP50,
      hardwareClass: hw,
      date: date.toISOString(),
      isCurrentUser: i === 3 || i === 11,
      details: {
        ttftP95Ms: Math.round(ttftP50 * (1.3 + rng() * 0.5) * 10) / 10,
        ttftP99Ms: Math.round(ttftP50 * (1.6 + rng() * 0.8) * 10) / 10,
        e2eP95Ms: Math.round(e2eP50 * (1.2 + rng() * 0.4) * 10) / 10,
        e2eP99Ms: Math.round(e2eP50 * (1.5 + rng() * 0.6) * 10) / 10,
        promptTokS: Math.round(decodeTokS * (0.3 + rng() * 0.4) * 10) / 10,
        ramUsageGB: Math.round((4 + rng() * 20) * 10) / 10,
        gpuUtilPct: Math.round(40 + rng() * 55),
        suite,
        sampleCount: 50 + Math.floor(rng() * 450),
        chipName: chip,
        osVersion: hw.startsWith('Apple') ? 'macOS 15.3' : 'Ubuntu 22.04',
        submittedBy: `user-${Math.floor(rng() * 9000) + 1000}`,
      },
    });
  }

  return entries;
}

const MOCK_ENTRIES = generateMockEntries();

// ---------------------------------------------------------------------------
// API stub -- replace with real EC2 API call in production
// ---------------------------------------------------------------------------

export async function fetchLeaderboard(
  filters: LeaderboardFilters,
): Promise<LeaderboardEntry[]> {
  // Simulate network latency
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

  let filtered = [...MOCK_ENTRIES];

  if (filters.hardware !== 'All') {
    filtered = filtered.filter((e) => e.hardwareClass === filters.hardware);
  }
  if (filters.model !== 'All') {
    filtered = filtered.filter((e) => e.model === filters.model);
  }
  if (filters.runtime !== 'All') {
    filtered = filtered.filter((e) => e.runtime === filters.runtime);
  }
  if (filters.suite !== 'All') {
    filtered = filtered.filter((e) => e.details.suite === filters.suite);
  }

  // Sort
  const sortFns: Record<SortField, (a: LeaderboardEntry, b: LeaderboardEntry) => number> = {
    decode_toks: (a, b) => b.decodeTokS - a.decodeTokS,
    ttft: (a, b) => a.ttftP50Ms - b.ttftP50Ms,
    e2e_latency: (a, b) => a.e2eP50Ms - b.e2eP50Ms,
  };

  filtered.sort(sortFns[filters.sortBy]);
  filtered.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  return filtered;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function buildRowMarkdown(entry: LeaderboardEntry): string {
  const d = entry.details;
  return [
    `## #${entry.rank} ${entry.model} (${entry.quantization})`,
    `Runtime: ${entry.runtime} | Hardware: ${entry.hardwareClass}`,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Decode tok/s | ${entry.decodeTokS} |`,
    `| TTFT p50 | ${formatMs(entry.ttftP50Ms)} |`,
    `| TTFT p95 | ${formatMs(d.ttftP95Ms)} |`,
    `| TTFT p99 | ${formatMs(d.ttftP99Ms)} |`,
    `| E2E p50 | ${formatMs(entry.e2eP50Ms)} |`,
    `| E2E p95 | ${formatMs(d.e2eP95Ms)} |`,
    `| E2E p99 | ${formatMs(d.e2eP99Ms)} |`,
    `| Prompt tok/s | ${d.promptTokS} |`,
    `| RAM Usage | ${d.ramUsageGB} GB |`,
    `| GPU Util | ${d.gpuUtilPct}% |`,
    `| Suite | ${d.suite} |`,
    `| Samples | ${d.sampleCount} |`,
    `| Chip | ${d.chipName} |`,
    '',
    `Date: ${new Date(entry.date).toISOString().split('T')[0]}`,
  ].join('\n');
}

function deltaLabel(a: number, b: number, higherIsBetter: boolean): string {
  if (b === 0) return '--';
  const pct = ((a - b) / b) * 100;
  const sign = pct > 0 ? '+' : '';
  const qualifier = higherIsBetter
    ? pct > 0 ? 'faster' : 'slower'
    : pct < 0 ? 'faster' : 'slower';
  return `${sign}${pct.toFixed(1)}% ${qualifier}`;
}

// ---------------------------------------------------------------------------
// FilterDropdown
// ---------------------------------------------------------------------------

interface FilterDropdownProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (val: string) => void;
}

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 rounded-md border border-border bg-zinc-900 px-2 pr-6 text-xs text-foreground',
          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30',
          'cursor-pointer appearance-none truncate',
        )}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23888' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 6px center',
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg bg-zinc-800/60 px-4 py-3"
        >
          <div className="w-8 h-5 rounded bg-zinc-700" />
          <div className="flex-1 h-4 rounded bg-zinc-700" />
          <div className="w-16 h-4 rounded bg-zinc-700" />
          <div className="w-16 h-4 rounded bg-zinc-700" />
          <div className="w-16 h-4 rounded bg-zinc-700" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison panel
// ---------------------------------------------------------------------------

interface ComparisonPanelProps {
  entries: LeaderboardEntry[];
  onClose: () => void;
}

function ComparisonPanel({ entries, onClose }: ComparisonPanelProps) {
  if (entries.length < 2) return null;
  const base = entries[0];

  const metrics: {
    label: string;
    getValue: (e: LeaderboardEntry) => number;
    format: (n: number) => string;
    higherIsBetter: boolean;
  }[] = [
    {
      label: 'Decode tok/s',
      getValue: (e) => e.decodeTokS,
      format: (n) => `${n.toFixed(1)}`,
      higherIsBetter: true,
    },
    {
      label: 'TTFT p50',
      getValue: (e) => e.ttftP50Ms,
      format: formatMs,
      higherIsBetter: false,
    },
    {
      label: 'E2E p50',
      getValue: (e) => e.e2eP50Ms,
      format: formatMs,
      higherIsBetter: false,
    },
    {
      label: 'Prompt tok/s',
      getValue: (e) => e.details.promptTokS,
      format: (n) => `${n.toFixed(1)}`,
      higherIsBetter: true,
    },
    {
      label: 'RAM Usage',
      getValue: (e) => e.details.ramUsageGB,
      format: (n) => `${n.toFixed(1)} GB`,
      higherIsBetter: false,
    },
    {
      label: 'GPU Util',
      getValue: (e) => e.details.gpuUtilPct,
      format: (n) => `${n}%`,
      higherIsBetter: true,
    },
  ];

  return (
    <div className="rounded-lg border border-primary/30 bg-zinc-900/80 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Side-by-Side Comparison
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                Metric
              </th>
              {entries.map((e, idx) => (
                <th
                  key={e.id}
                  className={cn(
                    'text-right py-2 px-3 font-medium',
                    e.isCurrentUser ? 'text-emerald-400' : 'text-foreground',
                  )}
                >
                  #{e.rank} {e.model}
                  {idx === 0 && (
                    <span className="block text-[10px] text-muted-foreground font-normal">
                      (baseline)
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.label} className="border-b border-border/20">
                <td className="py-2 pr-4 text-muted-foreground">
                  {metric.label}
                </td>
                {entries.map((entry, idx) => {
                  const val = metric.getValue(entry);
                  const baseVal = metric.getValue(base);
                  const showDelta = idx > 0;
                  const pct = baseVal !== 0 ? ((val - baseVal) / baseVal) * 100 : 0;
                  const isBetter = metric.higherIsBetter ? pct > 0 : pct < 0;

                  return (
                    <td
                      key={entry.id}
                      className="text-right py-2 px-3 text-foreground"
                    >
                      <span>{metric.format(val)}</span>
                      {showDelta && (
                        <span
                          className={cn(
                            'block text-[10px] mt-0.5',
                            isBetter ? 'text-emerald-400' : 'text-red-400',
                          )}
                        >
                          {deltaLabel(val, baseVal, metric.higherIsBetter)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Runtime + Hardware info row */}
            <tr className="border-b border-border/20">
              <td className="py-2 pr-4 text-muted-foreground">Config</td>
              {entries.map((entry) => (
                <td key={entry.id} className="text-right py-2 px-3 text-muted-foreground text-[11px]">
                  {entry.runtime} / {entry.quantization}
                  <span className="block">{entry.details.chipName}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LeaderboardView() {
  // -- Filters --
  const [filters, setFilters] = useState<LeaderboardFilters>({
    hardware: 'All',
    model: 'All',
    runtime: 'All',
    suite: 'All',
    sortBy: 'decode_toks',
  });

  // -- Data --
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);

  // -- UI state --
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  // -- Data loading --
  const loadData = useCallback(async (f: LeaderboardFilters) => {
    setIsLoading(true);
    try {
      const data = await fetchLeaderboard(f);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = useCallback(
    (key: keyof LeaderboardFilters, value: string) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        setExpandedId(null);
        loadData(next);
        return next;
      });
    },
    [loadData],
  );

  // -- Compare logic --
  const compareEntries = useMemo(
    () => entries.filter((e) => compareSet.has(e.id)),
    [entries, compareSet],
  );

  const toggleCompare = useCallback((id: string) => {
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => setCompareSet(new Set()), []);

  // -- Copy --
  const handleCopy = useCallback(async (entry: LeaderboardEntry) => {
    try {
      await navigator.clipboard.writeText(buildRowMarkdown(entry));
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard API may fail in insecure contexts
    }
  }, []);

  // -- Rank display --
  const rankDisplay = (rank: number) => {
    if (rank === 1) return <span className="text-yellow-400 font-bold">1</span>;
    if (rank === 2) return <span className="text-zinc-300 font-bold">2</span>;
    if (rank === 3) return <span className="text-amber-600 font-bold">3</span>;
    return <span className="text-muted-foreground">{rank}</span>;
  };

  const isEmpty = hasLoaded && !isLoading && entries.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ---- Header ---- */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <h1 className="text-lg font-semibold text-foreground">
            Community Leaderboard
          </h1>
          {hasLoaded && (
            <span className="text-xs text-muted-foreground bg-zinc-800 px-2 py-0.5 rounded-full">
              {entries.length} results
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters((p) => !p)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <Filter className="w-3.5 h-3.5 mr-1" />
          Filters
          {showFilters ? (
            <ChevronDown className="w-3 h-3 ml-1" />
          ) : (
            <ChevronRight className="w-3 h-3 ml-1" />
          )}
        </Button>
      </div>

      {/* ---- Filter bar ---- */}
      {showFilters && (
        <div className="shrink-0 px-4 pb-3 border-b border-border/50">
          <div className="flex flex-wrap items-end gap-3">
            <FilterDropdown
              label="Hardware"
              value={filters.hardware}
              options={HARDWARE_OPTIONS}
              onChange={(v) => handleFilterChange('hardware', v)}
            />
            <FilterDropdown
              label="Model"
              value={filters.model}
              options={MODEL_OPTIONS}
              onChange={(v) => handleFilterChange('model', v)}
            />
            <FilterDropdown
              label="Runtime"
              value={filters.runtime}
              options={RUNTIME_OPTIONS}
              onChange={(v) => handleFilterChange('runtime', v)}
            />
            <FilterDropdown
              label="Suite"
              value={filters.suite}
              options={SUITE_OPTIONS}
              onChange={(v) => handleFilterChange('suite', v)}
            />
            <FilterDropdown
              label="Sort by"
              value={filters.sortBy}
              options={SORT_OPTIONS.map((s) => s.value)}
              onChange={(v) => handleFilterChange('sortBy', v)}
            />
          </div>
        </div>
      )}

      {/* ---- Comparison panel ---- */}
      {compareEntries.length >= 2 && (
        <div className="shrink-0 px-4 pt-3">
          <ComparisonPanel entries={compareEntries} onClose={clearCompare} />
        </div>
      )}

      {/* ---- Main content ---- */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-3 space-y-1">
          {/* Loading skeleton (initial load) */}
          {isLoading && !hasLoaded ? (
            <LeaderboardSkeleton />
          ) : isEmpty ? (
            /* ---- Empty state ---- */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h2 className="text-base font-medium text-foreground mb-1">
                No community benchmarks yet
              </h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                Be the first to share your local LLM benchmark results with the
                community. Run a benchmark and opt in to sharing.
              </p>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Play className="w-4 h-4 mr-2" />
                Run Benchmark
              </Button>
            </div>
          ) : (
            <>
              {/* ---- Table header ---- */}
              <div
                className={cn(
                  'grid items-center gap-2 px-4 py-2 rounded-md',
                  'bg-zinc-900 text-[11px] uppercase tracking-wider text-muted-foreground font-medium select-none',
                  'grid-cols-[28px_24px_1fr_88px_64px_76px_76px_76px_100px_64px_32px]',
                )}
              >
                <span title="Select for comparison">Cmp</span>
                <span>#</span>
                <span>Model</span>
                <span>Runtime</span>
                <span>Quant</span>
                <span className="text-right">
                  Decode
                  {filters.sortBy === 'decode_toks' && (
                    <ArrowDown className="w-3 h-3 inline ml-0.5 text-primary" />
                  )}
                </span>
                <span className="text-right">
                  TTFT
                  {filters.sortBy === 'ttft' && (
                    <ArrowUp className="w-3 h-3 inline ml-0.5 text-primary" />
                  )}
                </span>
                <span className="text-right">
                  E2E
                  {filters.sortBy === 'e2e_latency' && (
                    <ArrowUp className="w-3 h-3 inline ml-0.5 text-primary" />
                  )}
                </span>
                <span>Hardware</span>
                <span>Date</span>
                <span />
              </div>

              {/* ---- Data rows ---- */}
              {entries.map((entry) => {
                const isExpanded = expandedId === entry.id;
                const isComparing = compareSet.has(entry.id);

                return (
                  <div key={entry.id} className="group">
                    {/* Row */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : entry.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : entry.id);
                        }
                      }}
                      className={cn(
                        'grid items-center gap-2 px-4 py-2.5 rounded-md cursor-pointer transition-colors text-xs',
                        'grid-cols-[28px_24px_1fr_88px_64px_76px_76px_76px_100px_64px_32px]',
                        entry.isCurrentUser
                          ? 'bg-emerald-500/8 hover:bg-emerald-500/15 border border-emerald-500/20'
                          : 'bg-zinc-800/60 hover:bg-zinc-800 border border-transparent',
                        isComparing && 'ring-1 ring-primary/40',
                      )}
                    >
                      {/* Compare checkbox */}
                      <div
                        role="checkbox"
                        aria-checked={isComparing}
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompare(entry.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCompare(entry.id);
                          }
                        }}
                        className={cn(
                          'w-5 h-5 rounded flex items-center justify-center border cursor-pointer transition-colors',
                          isComparing
                            ? 'bg-primary border-primary'
                            : 'border-zinc-600 hover:border-zinc-400',
                        )}
                      >
                        {isComparing && (
                          <Check className="w-3 h-3 text-primary-foreground" />
                        )}
                      </div>

                      {/* Rank */}
                      <span className="text-center text-sm">
                        {rankDisplay(entry.rank)}
                      </span>

                      {/* Model */}
                      <span
                        className={cn(
                          'font-medium truncate',
                          entry.isCurrentUser
                            ? 'text-emerald-400'
                            : 'text-foreground',
                        )}
                      >
                        {entry.model}
                        {entry.isCurrentUser && (
                          <span className="ml-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                            You
                          </span>
                        )}
                      </span>

                      {/* Runtime */}
                      <span className="text-muted-foreground truncate">
                        {entry.runtime}
                      </span>

                      {/* Quantization */}
                      <span className="text-muted-foreground">
                        {entry.quantization}
                      </span>

                      {/* Decode tok/s */}
                      <span className="text-right font-mono text-foreground">
                        {entry.decodeTokS.toFixed(1)}
                      </span>

                      {/* TTFT p50 */}
                      <span className="text-right font-mono text-muted-foreground">
                        {formatMs(entry.ttftP50Ms)}
                      </span>

                      {/* E2E p50 */}
                      <span className="text-right font-mono text-muted-foreground">
                        {formatMs(entry.e2eP50Ms)}
                      </span>

                      {/* Hardware class (abbreviated for space) */}
                      <span className="text-muted-foreground truncate text-[11px]">
                        {entry.hardwareClass
                          .replace('Apple Silicon ', 'AS ')
                          .replace('NVIDIA ', '')}
                      </span>

                      {/* Date */}
                      <span className="text-muted-foreground/70 text-[11px]">
                        {formatDate(entry.date)}
                      </span>

                      {/* Copy button (visible on hover) */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          handleCopy(entry);
                        }}
                        className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy as Markdown"
                      >
                        {copiedId === entry.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>

                    {/* ---- Expanded details ---- */}
                    {isExpanded && (
                      <div className="ml-14 mr-4 mb-2 mt-1 p-3 rounded-md bg-zinc-900/60 border border-border/30 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                          <DetailCell
                            label="TTFT p95 / p99"
                            value={`${formatMs(entry.details.ttftP95Ms)} / ${formatMs(entry.details.ttftP99Ms)}`}
                          />
                          <DetailCell
                            label="E2E p95 / p99"
                            value={`${formatMs(entry.details.e2eP95Ms)} / ${formatMs(entry.details.e2eP99Ms)}`}
                          />
                          <DetailCell
                            label="Prompt tok/s"
                            value={entry.details.promptTokS.toFixed(1)}
                          />
                          <DetailCell
                            label="RAM Usage"
                            value={`${entry.details.ramUsageGB.toFixed(1)} GB`}
                          />
                          <DetailCell
                            label="GPU Utilization"
                            value={`${entry.details.gpuUtilPct}%`}
                          />
                          <DetailCell
                            label="Suite"
                            value={entry.details.suite}
                            mono
                          />
                          <DetailCell
                            label="Samples"
                            value={String(entry.details.sampleCount)}
                          />
                          <DetailCell
                            label="Chip / OS"
                            value={`${entry.details.chipName} \u00b7 ${entry.details.osVersion}`}
                          />
                        </div>

                        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/20">
                          <span className="text-muted-foreground/60 text-[10px]">
                            Submitted by {entry.details.submittedBy}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e: MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              handleCopy(entry);
                            }}
                            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                          >
                            {copiedId === entry.id ? (
                              <>
                                <Check className="w-3 h-3 mr-1 text-emerald-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 mr-1" />
                                Copy Markdown
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Loading overlay during filter change */}
              {isLoading && hasLoaded && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Updating...
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ---- Compare status bar ---- */}
      {compareSet.size > 0 && compareSet.size < 2 && (
        <div className="shrink-0 px-4 py-2 border-t border-border/50 bg-zinc-900/80 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {compareSet.size}/2 selected for comparison (select{' '}
            {2 - compareSet.size} more)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCompare}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail cell helper
// ---------------------------------------------------------------------------

function DetailCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-muted-foreground block text-[10px] uppercase tracking-wider mb-0.5">
        {label}
      </span>
      <span className={cn('text-foreground', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  );
}
