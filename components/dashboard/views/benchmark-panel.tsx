'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Square,
  Copy,
  Check,
  Clock,
  Zap,
  Cpu,
  Trophy,
  ChevronDown,
  ChevronRight,
  Share2,
} from 'lucide-react';
import {
  useBenchmarkRunner,
  AVAILABLE_SUITES,
} from '@/lib/benchmark/benchmark-runner';
import type { BenchmarkSnapshot } from '@/lib/cache/config-cache';
import { useConfigCache } from '@/lib/cache/config-cache';
import { BenchmarkConsentModal } from './benchmark-consent-modal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkPanelProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMs(v: number): string {
  return v < 1000 ? `${v.toFixed(0)}ms` : `${(v / 1000).toFixed(2)}s`;
}

function fmtTokS(v: number): string {
  return `${v.toFixed(1)} tok/s`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffH = Math.floor((now - ts) / 3_600_000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function suiteLabel(suiteId: string): string {
  return (
    AVAILABLE_SUITES.find((s) => s.id === suiteId)?.label ?? suiteId
  );
}

function buildMarkdown(snap: BenchmarkSnapshot): string {
  return [
    `## LLM Benchmark — ${suiteLabel(snap.suite_name)}`,
    `Model: ${snap.model} (${snap.runtime}, ${snap.quantization})`,
    `Machine: ${snap.chip_family}, ${snap.ram_total_gb}GB RAM, ${snap.os}`,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| TTFT p50 | ${fmtMs(snap.ttft_p50_ms)} |`,
    `| TTFT p95 | ${fmtMs(snap.ttft_p95_ms)} |`,
    `| Decode avg | ${fmtTokS(snap.decode_tok_s_avg)} |`,
    `| Decode p95 | ${fmtTokS(snap.decode_tok_s_p95)} |`,
    `| End-to-end p50 | ${fmtMs(snap.end_to_end_p50_ms)} |`,
    `| End-to-end p95 | ${fmtMs(snap.end_to_end_p95_ms)} |`,
    '',
    `Run hash: ${snap.run_hash}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Suite selector
// ---------------------------------------------------------------------------

const SUITE_OPTIONS: { id: string; short: string }[] = [
  { id: 'TTFT_SHORT', short: 'TTFT Short' },
  { id: 'SUSTAINED', short: 'Sustained' },
  { id: 'LONG_CONTEXT', short: 'Long Context' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Metric card inside the results section. */
function MetricCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-lg border border-border p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

/** A single history row (expandable). */
function HistoryRow({ snap }: { snap: BenchmarkSnapshot }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground truncate">
          {suiteLabel(snap.suite_name)}
        </span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-success" />
            {fmtTokS(snap.decode_tok_s_avg)}
          </span>
          <span>{fmtMs(snap.ttft_p50_ms)}</span>
          <span className="text-muted-foreground/60">{fmtDate(snap.created_at)}</span>
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-muted-foreground">Model</span>
            <div className="text-foreground truncate">{snap.model}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Runtime</span>
            <div className="text-foreground">{snap.runtime} / {snap.quantization}</div>
          </div>
          <div>
            <span className="text-muted-foreground">TTFT p50 / p95</span>
            <div className="text-foreground">{fmtMs(snap.ttft_p50_ms)} / {fmtMs(snap.ttft_p95_ms)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Decode avg / p95</span>
            <div className="text-foreground">{fmtTokS(snap.decode_tok_s_avg)} / {fmtTokS(snap.decode_tok_s_p95)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">E2E p50 / p95</span>
            <div className="text-foreground">{fmtMs(snap.end_to_end_p50_ms)} / {fmtMs(snap.end_to_end_p95_ms)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Machine</span>
            <div className="text-foreground truncate">{snap.chip_family}, {snap.ram_total_gb}GB, {snap.os}</div>
          </div>
          {snap.shared && (
            <div className="col-span-2">
              <span className="inline-flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Share2 className="w-3 h-3" /> Shared to community
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BenchmarkPanel({ className }: BenchmarkPanelProps) {
  // Benchmark runner
  const { run, cancel, running, progress, snapshot, error } = useBenchmarkRunner();

  // Cache store
  const cache = useConfigCache();

  // Local state
  const [selectedSuite, setSelectedSuite] = useState('TTFT_SHORT');
  const [history, setHistory] = useState<BenchmarkSnapshot[]>([]);
  const [copied, setCopied] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Load history from IndexedDB on mount + after each run
  // -------------------------------------------------------------------------
  const loadHistory = useCallback(async () => {
    if (!cache) return;
    try {
      const items = await cache.getBenchmarkHistory(50);
      setHistory(items);
    } catch {
      // IndexedDB may fail in certain contexts; degrade silently
    }
  }, [cache]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Refresh history when a new snapshot arrives
  useEffect(() => {
    if (!snapshot || !cache) return;
    // Persist the snapshot then refresh the list
    cache.saveBenchmark(snapshot).then(() => loadHistory());
  }, [snapshot, cache, loadHistory]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleRun = async () => {
    try {
      await run(selectedSuite);
    } catch {
      // Error is captured in the hook's `error` state
    }
  };

  const handleCopy = useCallback(async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(buildMarkdown(snapshot));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [snapshot]);

  const handleShare = useCallback((_username: string) => {
    // Mark the snapshot as shared (future: POST to community API)
    if (snapshot && cache) {
      cache.saveBenchmark({ ...snapshot, shared: true }).then(() => loadHistory());
    }
    setConsentOpen(false);
  }, [snapshot, cache, loadHistory]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const pctWidth = progress ? Math.round(progress.pct * 100) : 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ================================================================= */}
      {/* Section 1: Suite Selector + Run                                    */}
      {/* ================================================================= */}
      <div className="glass rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            LLM Benchmark
          </span>
        </div>

        {/* Suite buttons */}
        <div className="flex flex-wrap gap-2">
          {SUITE_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSuite(s.id)}
              disabled={running}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                selectedSuite === s.id
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
                running && 'opacity-50 cursor-not-allowed',
              )}
            >
              {s.short}
            </button>
          ))}
        </div>

        {/* Run / Cancel */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running}
            className={cn(
              'h-8 px-4 text-xs font-medium',
              'bg-success/90 hover:bg-success text-success-foreground',
              running && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Play className="w-3.5 h-3.5 mr-1" />
            Run Benchmark
          </Button>

          {running && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cancel}
              className="h-8 px-3 text-xs text-destructive/80 hover:text-destructive hover:bg-destructive/10"
            >
              <Square className="w-3.5 h-3.5 mr-1" />
              Cancel
            </Button>
          )}
        </div>

        {/* Error */}
        {error && !running && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* ================================================================= */}
      {/* Section 2: Progress (visible only during run)                      */}
      {/* ================================================================= */}
      {running && progress && (
        <div className="glass rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate pr-2">{progress.phase}</span>
            <span className="text-foreground font-medium shrink-0">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${pctWidth}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground/60">{pctWidth}% complete</p>
        </div>
      )}

      {/* ================================================================= */}
      {/* Section 3: Results (visible after run completes)                   */}
      {/* ================================================================= */}
      {snapshot && !running && (
        <div className="space-y-3">
          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard icon={Clock} label="TTFT">
              <span className="font-semibold">{fmtMs(snapshot.ttft_p50_ms)}</span>
              <span className="text-muted-foreground text-[11px] ml-1.5">p50</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="font-semibold">{fmtMs(snapshot.ttft_p95_ms)}</span>
              <span className="text-muted-foreground text-[11px] ml-1.5">p95</span>
            </MetricCard>

            <MetricCard icon={Zap} label="Decode">
              <span className="font-semibold">{fmtTokS(snapshot.decode_tok_s_avg)}</span>
              <span className="text-muted-foreground text-[11px] ml-1.5">avg</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="font-semibold">{fmtTokS(snapshot.decode_tok_s_p95)}</span>
              <span className="text-muted-foreground text-[11px] ml-1.5">p95</span>
            </MetricCard>

            <MetricCard icon={Clock} label="End-to-End">
              <span className="font-semibold">{fmtMs(snapshot.end_to_end_p50_ms)}</span>
              <span className="text-muted-foreground text-[11px] ml-1.5">p50</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="font-semibold">{fmtMs(snapshot.end_to_end_p95_ms)}</span>
              <span className="text-muted-foreground text-[11px] ml-1.5">p95</span>
            </MetricCard>

            <MetricCard icon={Cpu} label="Model">
              <div className="truncate font-medium">{snapshot.model}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {snapshot.runtime} / {snapshot.quantization}
              </div>
            </MetricCard>
          </div>

          {/* Machine info */}
          <div className="glass rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>{snapshot.chip_family}</span>
            <span>{snapshot.ram_total_gb}GB RAM</span>
            <span>{snapshot.os}</span>
            <span className="text-muted-foreground/50 font-mono truncate">
              hash: {snapshot.run_hash.slice(0, 12)}...
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-3 text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1 text-success" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy Markdown
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConsentOpen(true)}
              className="h-7 px-3 text-xs"
            >
              <Share2 className="w-3 h-3 mr-1" />
              Share to Community
            </Button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Section 4: History (always visible)                                */}
      {/* ================================================================= */}
      <div className="glass rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Trophy className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            History
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground/60">
            {history.length} {history.length === 1 ? 'run' : 'runs'}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground/60">
            No benchmark history yet. Run a benchmark to see results here.
          </div>
        ) : (
          <ScrollArea className="max-h-[280px]">
            <div>
              {history.map((snap) => (
                <HistoryRow key={snap.id} snap={snap} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* ================================================================= */}
      {/* Consent Modal                                                      */}
      {/* ================================================================= */}
      <BenchmarkConsentModal
        isOpen={consentOpen}
        onClose={() => setConsentOpen(false)}
        onConsent={handleShare}
      />
    </div>
  );
}
