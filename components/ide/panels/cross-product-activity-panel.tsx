'use client';

// =============================================================================
// CrossProductActivityPanel
//
// Unified cross-product activity stream — the IDE's single pane of glass for
// watching Multi-Fleet, 3-Surgeons, and ER Simulator activity in one place.
//
// Implements the IDE-side consumer for Wire 2 of the 5-product wiring plan
// ("Evidence bidirectional sync") and Session 2 of the core-alignment plan
// ("Surface surgeon disagreements in UI" / fleet visibility).
//
// Source-of-truth backend aggregator: /api/cross-product/activity
// =============================================================================

import { useMemo, useState } from 'react';
import {
  Activity,
  RefreshCw,
  Radio,
  Stethoscope,
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Filter,
} from 'lucide-react';

import {
  useCrossProductActivity,
  type CrossProductEvent,
  type CrossProductSource,
} from '@/lib/hooks/use-cross-product-activity';
import { cn } from '@/lib/utils';

const SOURCE_META: Record<
  CrossProductSource,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  fleet: { label: 'Fleet', icon: Radio, color: 'text-blue-400' },
  surgeons: { label: 'Surgeons', icon: Stethoscope, color: 'text-emerald-400' },
  'er-sim': { label: 'ER Sim', icon: HeartPulse, color: 'text-red-400' },
};

function severityIcon(severity: CrossProductEvent['severity']) {
  switch (severity) {
    case 'success':
      return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
    case 'warn':
      return <AlertTriangle className="h-3 w-3 text-amber-500" />;
    case 'error':
      return <XCircle className="h-3 w-3 text-red-500" />;
    default:
      return <Info className="h-3 w-3 text-zinc-400" />;
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function SourceFilterChip({
  source,
  active,
  onClick,
  reachable,
}: {
  source: CrossProductSource;
  active: boolean;
  onClick: () => void;
  reachable: boolean;
}) {
  const meta = SOURCE_META[source];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors',
        active
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-[#2a2a35] bg-[#111118] text-[#a1a1aa] hover:bg-[#1a1a24]',
      )}
      title={
        reachable
          ? `${meta.label}: filter on/off`
          : `${meta.label}: source unreachable`
      }
    >
      <Icon className={cn('h-3 w-3', reachable ? meta.color : 'text-zinc-600')} />
      <span>{meta.label}</span>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          reachable ? 'bg-emerald-500' : 'bg-zinc-600',
        )}
        aria-hidden
      />
    </button>
  );
}

function EventRow({ event }: { event: CrossProductEvent }) {
  const meta = SOURCE_META[event.source];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-2 px-3 py-2 border-b border-[#1a1a24] hover:bg-[#0e0e16] transition-colors">
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', meta.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {severityIcon(event.severity)}
          <span className="text-[11px] text-[#e5e5e5] truncate">
            {event.title}
          </span>
        </div>
        {event.detail && (
          <div className="text-[10px] text-[#6b6b75] truncate" title={event.detail}>
            {event.detail}
          </div>
        )}
        <div className="text-[10px] text-[#52525b] flex items-center gap-1.5 mt-0.5">
          <span>{formatRelative(event.timestamp)}</span>
          <span className="opacity-50">·</span>
          <span className="font-mono">{event.kind}</span>
          {!event.live && (
            <>
              <span className="opacity-50">·</span>
              <span className="italic opacity-70" title="Synthesized from snapshot, not a live event">
                snapshot
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function CrossProductActivityPanel() {
  const { data, loading, error, refresh } = useCrossProductActivity(7000, 80);
  const [activeFilters, setActiveFilters] = useState<Set<CrossProductSource>>(
    new Set<CrossProductSource>(['fleet', 'surgeons', 'er-sim']),
  );

  const events = useMemo<CrossProductEvent[]>(() => {
    const list = data?.events ?? [];
    if (activeFilters.size === 3) return list;
    return list.filter((e) => activeFilters.has(e.source));
  }, [data, activeFilters]);

  const reachable = data?.reachable ?? {
    fleet: false,
    surgeons: false,
    'er-sim': false,
  };

  const toggleFilter = (source: CrossProductSource) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        // Don't allow turning off the last filter — that's confusing UX.
        if (next.size === 1) return prev;
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-[#e5e5e5]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Activity className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-medium">Cross-Product Activity</span>
        <button
          onClick={refresh}
          className="ml-auto text-[#6b6b75] hover:text-[#e5e5e5]"
          title="Refresh"
        >
          <RefreshCw
            className={cn('h-3 w-3', loading && 'animate-spin')}
          />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#1a1a24] flex-shrink-0 flex-wrap">
        <Filter className="h-3 w-3 text-[#52525b]" />
        {(['fleet', 'surgeons', 'er-sim'] as CrossProductSource[]).map((s) => (
          <SourceFilterChip
            key={s}
            source={s}
            active={activeFilters.has(s)}
            onClick={() => toggleFilter(s)}
            reachable={reachable[s]}
          />
        ))}
      </div>

      {/* Errors banner (transport only — source-down is rendered as filter dot) */}
      {error && !data && (
        <div className="px-3 py-2 border-b border-[#1a1a24] text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/* Events */}
      <div className="flex-1 overflow-auto">
        {events.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-[#52525b] gap-2 p-6">
            <Activity className="h-8 w-8 opacity-30" />
            <span className="text-xs">No activity yet</span>
            <span className="text-[10px] text-center max-w-[280px]">
              Start the fleet daemon, agent_service, or ER Simulator to see
              events here.
            </span>
          </div>
        )}
        <ul>
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      </div>

      {/* Footer */}
      {data?.fetched_at && (
        <div className="px-3 py-1 border-t border-[#1a1a24] flex-shrink-0 text-[9px] text-[#52525b] flex items-center justify-between">
          <span>
            {events.length} event{events.length === 1 ? '' : 's'}
            {activeFilters.size < 3 ? ' (filtered)' : ''}
          </span>
          <span title={new Date(data.fetched_at).toISOString()}>
            updated {formatRelative(data.fetched_at)}
          </span>
        </div>
      )}
    </div>
  );
}
