'use client';

// =============================================================================
// LogViewerPanel — unified IDE error/log surface.
//
// Polls /api/logs every 2s via useLogs. Renders rows (ts | level chip | source
// pill | msg). Click a row to expand and inspect detail. Top bar exposes
// level toggles, source dropdown, and clear-all.
//
// Scroll behavior: auto-pin to bottom unless the user has scrolled up
// (sticky-bottom pattern — bottom 32px tolerance).
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { useLogs, type LogEntry, type LogLevel } from '@/lib/hooks/use-logs';
import { Bug, Info, AlertTriangle, AlertOctagon, Trash2, Loader2 } from 'lucide-react';

const LEVELS: LogLevel[] = ['info', 'warn', 'error'];

function LevelChip({ level }: { level: LogLevel }) {
  const cls =
    level === 'error'
      ? 'bg-red-500/15 text-red-400 ring-red-500/30'
      : level === 'warn'
        ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
        : 'bg-sky-500/15 text-sky-400 ring-sky-500/30';
  const Icon = level === 'error' ? AlertOctagon : level === 'warn' ? AlertTriangle : Info;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ring-1',
        cls,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {level}
    </span>
  );
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function LogRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'border-b border-border/40 px-2 py-1 cursor-pointer hover:bg-muted/40 transition-colors',
        expanded && 'bg-muted/30',
      )}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className="text-muted-foreground tabular-nums shrink-0">{fmtTs(entry.ts)}</span>
        <LevelChip level={entry.level} />
        <span className="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-foreground/80 shrink-0">
          {entry.source}
        </span>
        <span className="truncate text-foreground/90">{entry.msg}</span>
      </div>
      {expanded && entry.detail !== undefined && (
        <pre className="mt-1 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words bg-background/50 rounded p-2 ring-1 ring-border/30">
          {typeof entry.detail === 'string'
            ? entry.detail
            : JSON.stringify(entry.detail, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function LogViewerPanel() {
  const { logs, isLoading, error, clear } = useLogs({ intervalMs: 2000 });
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(
    () => new Set<LogLevel>(LEVELS),
  );
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyBottomRef = useRef<boolean>(true);

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.source);
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (!activeLevels.has(l.level)) return false;
      if (sourceFilter && l.source !== sourceFilter) return false;
      return true;
    });
  }, [logs, activeLevels, sourceFilter]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickyBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
  };

  useEffect(() => {
    if (!stickyBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  const toggleLevel = (lvl: LogLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/60 bg-card/40">
        <Bug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Logs</span>

        <div className="flex items-center gap-1 ml-2">
          {LEVELS.map((lvl) => {
            const on = activeLevels.has(lvl);
            return (
              <button
                key={lvl}
                onClick={() => toggleLevel(lvl)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ring-1 transition-opacity',
                  on ? 'opacity-100' : 'opacity-40',
                  lvl === 'error' && 'bg-red-500/10 text-red-400 ring-red-500/30',
                  lvl === 'warn' && 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
                  lvl === 'info' && 'bg-sky-500/10 text-sky-400 ring-sky-500/30',
                )}
                title={`Toggle ${lvl}`}
              >
                {lvl}
              </button>
            );
          })}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="text-[11px] bg-muted/40 border border-border/60 rounded px-1 py-0.5 ml-2 max-w-[140px]"
        >
          <option value="">all sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        <span className="text-[10px] text-muted-foreground tabular-nums">
          {filtered.length}/{logs.length}
        </span>
        <button
          onClick={() => void clear()}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded hover:bg-muted/60 text-muted-foreground"
          title="Clear all"
        >
          <Trash2 className="h-3 w-3" />
          clear
        </button>
      </div>

      {/* Body */}
      {isLoading && logs.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading logs...
        </div>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto">
          {error && (
            <div className="text-[11px] text-red-400 px-2 py-1 bg-red-500/10 border-b border-red-500/20">
              poll error: {error}
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              No log entries
            </div>
          ) : (
            filtered.map((entry, i) => (
              <LogRow
                key={`${entry.ts}-${i}`}
                entry={entry}
                expanded={expanded === entry.ts}
                onToggle={() => setExpanded(expanded === entry.ts ? null : entry.ts)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
