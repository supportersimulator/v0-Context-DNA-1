'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Cpu,
  Zap,
  Copy,
  Share2,
  Settings,
  Play,
  Check,
  GitCompare,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMStatus {
  /** Model display name, e.g. "Qwen3-14B-4bit" */
  modelName: string;
  /** true = inference server reachable */
  online: boolean;
  /** Last measured tokens/second (generation speed) */
  tokensPerSecond: number | null;
  /** Time-to-first-token in seconds */
  ttft: number | null;
}

export interface BenchmarkMetrics {
  tokensPerSecond: number;
  ttft: number;
  /** RAM used during benchmark, in GB */
  ramUsageGB: number;
}

export interface BenchmarkResult {
  /** Suite identifier, e.g. "coding-14B" */
  suiteName: string;
  /** ISO date string */
  date: string;
  metrics: BenchmarkMetrics;
  /** Whether the result was shared to the community feed */
  shared: boolean;
}

export interface ConfigBenchmarkWidgetProps {
  llmStatus: LLMStatus | null;
  lastBenchmark: BenchmarkResult | null;
  /** Fired when user clicks "Compare Configs" */
  onCompareConfigs?: () => void;
  /** Fired when user clicks "Integrations" */
  onOpenIntegrations?: () => void;
  /** Fired when user clicks "Run Benchmark" */
  onRunBenchmark?: () => void;
  className?: string;
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

function buildMarkdown(b: BenchmarkResult): string {
  return [
    `## ${b.suiteName} Benchmark`,
    `Date: ${new Date(b.date).toISOString()}`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| tok/s  | ${b.metrics.tokensPerSecond.toFixed(1)} |`,
    `| TTFT   | ${b.metrics.ttft.toFixed(2)}s |`,
    `| RAM    | ${b.metrics.ramUsageGB.toFixed(1)} GB |`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfigBenchmarkWidget({
  llmStatus,
  lastBenchmark,
  onCompareConfigs,
  onOpenIntegrations,
  onRunBenchmark,
  className,
}: ConfigBenchmarkWidgetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!lastBenchmark) return;
    try {
      await navigator.clipboard.writeText(buildMarkdown(lastBenchmark));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may fail in insecure contexts; silently degrade
    }
  }, [lastBenchmark]);

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2',
        'min-h-[48px] max-h-[48px] overflow-hidden',
        className,
      )}
    >
      {/* ── Left: LLM Status ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />

        {llmStatus ? (
          <>
            {/* Status dot */}
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                llmStatus.online ? 'bg-success' : 'bg-destructive',
              )}
            />

            {/* Model name */}
            <span className="text-xs font-medium text-foreground truncate max-w-[140px]">
              {llmStatus.modelName}
            </span>

            {/* Metrics (hidden on very small screens) */}
            {llmStatus.online && (
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
                {llmStatus.tokensPerSecond != null && (
                  <span className="flex items-center gap-0.5">
                    <Zap className="w-3 h-3 text-success" />
                    {llmStatus.tokensPerSecond.toFixed(1)} tok/s
                  </span>
                )}
                {llmStatus.ttft != null && (
                  <span>TTFT {llmStatus.ttft.toFixed(2)}s</span>
                )}
              </div>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No LLM</span>
        )}
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="w-px h-6 bg-border shrink-0 hidden md:block" />

      {/* ── Center: Quick Actions ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCompareConfigs}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Compare Configs"
        >
          <GitCompare className="w-3.5 h-3.5 mr-1" />
          <span className="hidden lg:inline">Compare</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenIntegrations}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Integrations"
        >
          <Settings className="w-3.5 h-3.5 mr-1" />
          <span className="hidden lg:inline">Integrations</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRunBenchmark}
          className={cn(
            'h-7 px-2 text-xs',
            'text-success/80 hover:text-success hover:bg-success/10',
          )}
          title="Run Benchmark"
        >
          <Play className="w-3.5 h-3.5 mr-1" />
          <span className="hidden lg:inline">Benchmark</span>
        </Button>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="w-px h-6 bg-border shrink-0 hidden md:block" />

      {/* ── Right: Last Benchmark ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 ml-auto min-w-0">
        {lastBenchmark ? (
          <>
            {/* Metrics summary (hidden on small screens) */}
            <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground truncate">
              <span className="text-foreground font-medium truncate max-w-[100px]">
                {lastBenchmark.suiteName}
              </span>
              <span>{lastBenchmark.metrics.tokensPerSecond.toFixed(1)} tok/s</span>
              <span>{lastBenchmark.metrics.ttft.toFixed(2)}s</span>
              <span>{lastBenchmark.metrics.ramUsageGB.toFixed(1)}GB</span>
              <span className="text-muted-foreground/60">
                {formatDate(lastBenchmark.date)}
              </span>
            </div>

            {/* Shared badge */}
            {lastBenchmark.shared && (
              <span className="flex items-center gap-0.5 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                <Share2 className="w-3 h-3" />
              </span>
            )}

            {/* Copy button */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
              title="Copy benchmark results as Markdown"
            >
              {copied ? (
                <Check className="w-3 h-3 text-success" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground hidden md:block">
            No benchmarks yet
          </span>
        )}
      </div>
    </div>
  );
}
