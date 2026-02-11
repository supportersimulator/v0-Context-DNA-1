'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Cpu,
  MemoryStick,
  Thermometer,
  HardDrive,
  Wifi,
  Wrench,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Zap,
} from 'lucide-react';
import type {
  BottleneckReport,
  BottleneckClassification,
  BenchmarkInput,
  CommunityComparison,
} from '@/lib/benchmark/bottleneck-analyzer';
import {
  reportToMarkdown,
  compareToCommunity,
  PHASE_COLORS,
  PHASE_LABELS,
} from '@/lib/benchmark/bottleneck-analyzer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BottleneckCardProps {
  report: BottleneckReport;
  /** Pass the original input to enable community comparison */
  benchmarkInput?: BenchmarkInput;
  className?: string;
}

// ---------------------------------------------------------------------------
// Classification config
// ---------------------------------------------------------------------------

interface ClassificationMeta {
  icon: typeof Cpu;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CLASSIFICATION_META: Record<BottleneckClassification, ClassificationMeta> = {
  gpu: {
    icon: Zap,
    label: 'GPU-Bound',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/30',
  },
  cpu: {
    icon: Cpu,
    label: 'CPU-Bound',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
  },
  memory: {
    icon: MemoryStick,
    label: 'Memory Pressure',
    color: 'text-red-400',
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/30',
  },
  io: {
    icon: HardDrive,
    label: 'I/O Bottleneck',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/30',
  },
  thermal: {
    icon: Thermometer,
    label: 'Thermal Throttling',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/15',
    borderColor: 'border-orange-500/30',
  },
  network: {
    icon: Wifi,
    label: 'Network / API',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/15',
    borderColor: 'border-teal-500/30',
  },
  tool_exec: {
    icon: Wrench,
    label: 'Tool Execution',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/30',
  },
};

/** The bottleneck phase gets a distinct red highlight in the bar chart */
const BOTTLENECK_BAR_COLOR = '#ef4444'; // red-500

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BottleneckCard({
  report,
  benchmarkInput,
  className,
}: BottleneckCardProps) {
  const [copied, setCopied] = useState(false);
  const [upgradeExpanded, setUpgradeExpanded] = useState(false);

  const meta = CLASSIFICATION_META[report.classification];
  const IconComponent = meta.icon;

  // Community comparison (only available if benchmarkInput provided)
  const communityComparisons = useMemo<CommunityComparison[]>(() => {
    if (!benchmarkInput) return [];
    return compareToCommunity(benchmarkInput);
  }, [benchmarkInput]);

  const hasCommunityData = communityComparisons.length > 0;

  // Identify the bottleneck phase (highest pct)
  const bottleneckPhaseName = useMemo(() => {
    if (report.phases.length === 0) return null;
    return report.phases.reduce((best, p) =>
      p.pct_of_total > best.pct_of_total ? p : best,
    ).name;
  }, [report.phases]);

  // Copy report as markdown
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(reportToMarkdown(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable in insecure contexts
    }
  }, [report]);

  return (
    <div
      className={cn(
        'rounded-xl border bg-zinc-900/80 backdrop-blur-md overflow-hidden',
        meta.borderColor,
        className,
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
              meta.bgColor,
            )}
          >
            <IconComponent className={cn('w-5 h-5', meta.color)} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-zinc-100 truncate">
                Bottleneck: {report.primary_bottleneck}
              </h3>
              <span
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
                  meta.bgColor,
                  meta.color,
                )}
              >
                {meta.label}
              </span>
            </div>
            {report.secondary_bottleneck !== 'None detected' && (
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                Secondary: {report.secondary_bottleneck}
              </p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          className="h-7 w-7 text-zinc-500 hover:text-zinc-300 shrink-0"
          title="Copy report as Markdown"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* ── Evidence ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-zinc-800/60">
        <p className="text-xs text-zinc-400 leading-relaxed">
          {report.evidence}
        </p>
      </div>

      {/* ── Phase Breakdown (stacked bar) ──────────────────────────────────── */}
      {report.phases.length > 0 && (
        <div className="px-5 py-3 border-b border-zinc-800/60 space-y-2">
          <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Phase Breakdown
          </h4>

          {/* Stacked horizontal bar */}
          <div className="flex w-full h-5 rounded-md overflow-hidden bg-zinc-800/60">
            {report.phases.map((phase) => {
              const isBottleneck = phase.name === bottleneckPhaseName;
              const barColor = isBottleneck
                ? BOTTLENECK_BAR_COLOR
                : PHASE_COLORS[phase.name] ?? '#71717a';

              return (
                <div
                  key={phase.name}
                  className="relative group h-full transition-opacity hover:opacity-90"
                  style={{
                    width: `${Math.max(phase.pct_of_total, 1)}%`,
                    backgroundColor: barColor,
                  }}
                  title={`${PHASE_LABELS[phase.name]}: ${phase.duration_ms.toFixed(0)}ms (${phase.pct_of_total.toFixed(1)}%)`}
                >
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
                    <div className="bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-[10px] text-zinc-300 whitespace-nowrap shadow-xl">
                      {PHASE_LABELS[phase.name]}: {phase.duration_ms.toFixed(0)}ms ({phase.pct_of_total.toFixed(1)}%)
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {report.phases.map((phase) => {
              const isBottleneck = phase.name === bottleneckPhaseName;
              const dotColor = isBottleneck
                ? BOTTLENECK_BAR_COLOR
                : PHASE_COLORS[phase.name] ?? '#71717a';

              return (
                <div key={phase.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span
                    className={cn(
                      'text-[10px]',
                      isBottleneck ? 'text-red-400 font-medium' : 'text-zinc-500',
                    )}
                  >
                    {PHASE_LABELS[phase.name]} {phase.pct_of_total.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Suggested Fixes ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-zinc-800/60 space-y-2">
        <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Suggested Fixes
        </h4>
        <ol className="space-y-1.5">
          {report.suggested_fixes.slice(0, 3).map((fix, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5',
                  i === 0
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-500',
                )}
              >
                {i + 1}
              </span>
              <span className="text-xs text-zinc-300 leading-relaxed">
                {fix}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── What Should I Upgrade? ──────────────────────────────────────────── */}
      {hasCommunityData && (
        <div className="px-5 py-3 space-y-2">
          <button
            onClick={() => setUpgradeExpanded((v) => !v)}
            className="flex items-center justify-between w-full group"
          >
            <h4 className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider group-hover:text-zinc-400 transition-colors">
              What Should I Upgrade?
            </h4>
            {upgradeExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            )}
          </button>

          {upgradeExpanded && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-zinc-600">
                Compared to community medians for the same model:
              </p>

              {communityComparisons.map((c) => (
                <div
                  key={c.metric}
                  className="flex items-center justify-between rounded-lg bg-zinc-800/50 border border-zinc-700/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-300">
                      {c.metric}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Yours: {formatMetric(c.metric, c.yours)} / Median: {formatMetric(c.metric, c.median)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {c.verdict === 'above' && (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[11px] font-medium text-emerald-400">
                          +{Math.abs(c.delta_pct).toFixed(0)}%
                        </span>
                      </>
                    )}
                    {c.verdict === 'below' && (
                      <>
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[11px] font-medium text-red-400">
                          {c.delta_pct.toFixed(0)}%
                        </span>
                      </>
                    )}
                    {c.verdict === 'at' && (
                      <>
                        <Minus className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-[11px] font-medium text-zinc-500">
                          On par
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Actionable recommendation based on classification */}
              <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/20 p-3 mt-1">
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {getUpgradeRecommendation(report.classification, communityComparisons)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* If no community data, show a minimal footer */}
      {!hasCommunityData && (
        <div className="px-5 py-2.5">
          <p className="text-[10px] text-zinc-600 text-center">
            Share your benchmark to compare against community medians
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMetric(metric: string, value: number): string {
  if (metric.toLowerCase().includes('tok/s')) return `${value.toFixed(1)} tok/s`;
  if (metric.toLowerCase().includes('ttft')) return `${value.toFixed(0)}ms`;
  return value.toFixed(1);
}

function getUpgradeRecommendation(
  classification: BottleneckClassification,
  comparisons: CommunityComparison[],
): string {
  const belowMedian = comparisons.filter((c) => c.verdict === 'below');

  if (belowMedian.length === 0) {
    return 'Your setup is performing at or above community medians. Focus on the suggested fixes above to squeeze out the last gains.';
  }

  switch (classification) {
    case 'memory':
      return 'Your system is memory-constrained. Upgrading RAM (or switching to a smaller model) would have the most impact. Consider unified-memory machines (Apple Silicon) where GPU and CPU share the same pool.';
    case 'gpu':
      return 'Your GPU is the limiting factor. A newer GPU with more VRAM/cores, or switching to Apple Silicon with a higher GPU core count, would directly improve tok/s.';
    case 'cpu':
      return 'CPU is holding back inference. If you lack a GPU, adding one is the single biggest upgrade. On Apple Silicon, a chip with more performance cores (M4 Pro/Max) would help.';
    case 'thermal':
      return 'Thermal throttling is degrading sustained performance. Better cooling (external fan, desktop form factor, or re-pasting) would help before considering a hardware upgrade.';
    case 'network':
      return 'Network latency dominates your pipeline. The highest-impact change is switching to a local LLM. If you must use a remote API, choose a provider with lower round-trip latency.';
    case 'tool_exec':
      return 'Tool execution is the slowest phase. This is typically a software optimisation opportunity (parallelism, caching) rather than a hardware upgrade.';
    case 'io':
      return 'I/O is the bottleneck during context assembly. An NVMe SSD upgrade or moving retrieval indices to RAM-backed storage would help most.';
    default:
      return 'Review the suggested fixes above for the most impactful improvements.';
  }
}
