'use client';

// =============================================================================
// ReceiptRow — single 3-Surgeons audit receipt
// Compact row: mode badge, timestamp, auditors, findings, duration, cache.
// Click to expand → rendered text (if any) + raw JSON.
// =============================================================================

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Users,
  Gauge,
  Database,
  ListChecks,
} from 'lucide-react';
import type {
  Receipt,
  ReceiptAuditor,
  ReceiptCacheStats,
  ReceiptFindings,
  ReceiptMode,
} from '@/lib/hooks/use-receipts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '—';
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return dateStr;
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function modeStyle(mode?: ReceiptMode): { color: string; bg: string; border: string; label: string } {
  switch (mode) {
    case 'consult':
      return {
        color: 'text-[#3b82f6]',
        bg: 'bg-[#3b82f6]/10',
        border: 'border-[#3b82f6]/20',
        label: 'consult',
      };
    case 'cross-exam':
      return {
        color: 'text-purple-400',
        bg: 'bg-purple-400/10',
        border: 'border-purple-400/20',
        label: 'cross-exam',
      };
    case 'consensus':
      return {
        color: 'text-[#22c55e]',
        bg: 'bg-[#22c55e]/10',
        border: 'border-[#22c55e]/20',
        label: 'consensus',
      };
    default:
      return {
        color: 'text-[#6b6b75]',
        bg: 'bg-[#12121a]',
        border: 'border-[#2a2a35]',
        label: mode || 'unknown',
      };
  }
}

function findingsSummary(findings?: ReceiptFindings): string | null {
  if (!findings) return null;
  if (Array.isArray(findings.items)) {
    const n = findings.items.length;
    return `${n} item${n === 1 ? '' : 's'}`;
  }
  const c = Number(findings.consensus ?? 0) | 0;
  const ct = Number(findings.contested ?? 0) | 0;
  const u = Number(findings.unique ?? 0) | 0;
  if (c === 0 && ct === 0 && u === 0) return null;
  return `${c} consensus, ${ct} contested, ${u} unique`;
}

function cacheSummary(stats?: ReceiptCacheStats): string | null {
  if (!stats) return null;
  if (stats.cache_eligible === false) {
    return `cache off${stats.cache_eligible_reason ? ` — ${stats.cache_eligible_reason}` : ''}`;
  }
  const parts: string[] = [];
  if (typeof stats.cache_creation_input_tokens === 'number') {
    parts.push(`${Math.trunc(stats.cache_creation_input_tokens)} created`);
  }
  if (typeof stats.cache_read_input_tokens === 'number') {
    parts.push(`${Math.trunc(stats.cache_read_input_tokens)} read`);
  }
  return parts.length ? parts.join(' / ') : null;
}

function auditorsLine(auditors?: ReceiptAuditor[]): string {
  if (!auditors || auditors.length === 0) return '—';
  return auditors.map((a) => a.id).filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------
// ReceiptRow
// ---------------------------------------------------------------------------

export interface ReceiptRowProps {
  receipt: Receipt;
}

export function ReceiptRow({ receipt }: ReceiptRowProps) {
  const [expanded, setExpanded] = useState(false);
  const style = modeStyle(receipt.mode);
  const findings = findingsSummary(receipt.findings);
  const cache = cacheSummary(receipt.cache_stats);
  const auditors = auditorsLine(receipt.auditors);

  return (
    <div className="border-b border-[#2a2a35] last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-3 py-2 hover:bg-[#1a1a24] transition-colors"
      >
        <div className="flex items-start gap-2">
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0 mt-1" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0 mt-1" />
          )}

          <div className="flex-1 min-w-0">
            {/* Top line: mode badge + timestamp */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${style.bg} ${style.color} ${style.border}`}
              >
                {style.label}
              </span>
              <span className="text-[10px] text-[#6b6b75] flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {timeAgo(receipt.timestamp)}
              </span>
              <span className="text-[10px] text-[#6b6b75]">
                {formatDuration(receipt.duration_ms)}
              </span>
            </div>

            {/* Auditors */}
            <div className="mt-1 text-[11px] text-[#a0a0ab] flex items-center gap-1">
              <Users className="w-2.5 h-2.5 text-[#6b6b75] flex-shrink-0" />
              <span className="truncate">{auditors}</span>
            </div>

            {/* Findings + cache (compact) */}
            <div className="mt-1 flex items-center gap-3 flex-wrap text-[10px] text-[#6b6b75]">
              {findings && (
                <span className="flex items-center gap-0.5">
                  <ListChecks className="w-2.5 h-2.5" />
                  {findings}
                </span>
              )}
              {cache && (
                <span className="flex items-center gap-0.5">
                  <Database className="w-2.5 h-2.5" />
                  {cache}
                </span>
              )}
              {!findings && !cache && (
                <span className="flex items-center gap-0.5 italic">
                  <Gauge className="w-2.5 h-2.5" />
                  no findings recorded
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 pl-8 space-y-2">
          {receipt.rendered && (
            <div>
              <div className="text-[10px] text-[#6b6b75] uppercase tracking-wider mb-1">
                Rendered
              </div>
              <pre className="text-[11px] text-[#e5e5e5] font-mono bg-[#12121a] border border-[#2a2a35] rounded px-2 py-1.5 whitespace-pre-wrap break-words">
                {receipt.rendered}
              </pre>
            </div>
          )}
          <div>
            <div className="text-[10px] text-[#6b6b75] uppercase tracking-wider mb-1">
              Raw JSON
            </div>
            <pre className="text-[11px] text-[#a0a0ab] font-mono bg-[#12121a] border border-[#2a2a35] rounded px-2 py-1.5 whitespace-pre-wrap break-words overflow-x-auto">
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
