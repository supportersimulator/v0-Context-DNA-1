'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Shield, Download, Trash2, Filter, CheckCircle2, XCircle, AlertTriangle, Ban } from 'lucide-react';
import { getAuditLogger, type AuditEntry } from '@/lib/ide/audit-logger';

// ---------------------------------------------------------------------------
// Outcome colors and icons
// ---------------------------------------------------------------------------

const OUTCOME_STYLES: Record<AuditEntry['outcome'], { color: string; icon: typeof CheckCircle2 }> = {
  success:   { color: 'text-green-400',  icon: CheckCircle2 },
  error:     { color: 'text-red-400',    icon: XCircle },
  denied:    { color: 'text-orange-400', icon: Ban },
  cancelled: { color: 'text-yellow-400', icon: AlertTriangle },
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type OutcomeFilter = AuditEntry['outcome'] | 'all';

// ---------------------------------------------------------------------------
// AuditPanel
// ---------------------------------------------------------------------------

export default function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<OutcomeFilter>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load entries
  useEffect(() => {
    const logger = getAuditLogger();
    setEntries(logger.getRecentEntries(200));
  }, [refreshKey]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.outcome === filter);
  }, [entries, filter]);

  const handleExport = useCallback(() => {
    const json = getAuditLogger().export();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contextdna-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleClear = useCallback(() => {
    getAuditLogger().clear();
    setRefreshKey((k) => k + 1);
  }, []);

  // Outcome counts
  const counts = useMemo(() => {
    const c = { success: 0, error: 0, denied: 0, cancelled: 0, total: entries.length };
    for (const e of entries) c[e.outcome]++;
    return c;
  }, [entries]);

  return (
    <div className="flex h-full flex-col overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-white/60" />
          <span className="text-sm font-medium text-white/80">Audit Log</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
            {counts.total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExport}
            title="Export audit log"
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
          >
            <Download size={12} />
          </button>
          <button
            onClick={handleClear}
            title="Clear audit log"
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-1 border-b border-white/5 px-3 py-1.5">
        <Filter size={10} className="text-white/40" />
        {(['all', 'success', 'error', 'denied', 'cancelled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
              filter === f
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:bg-white/5 hover:text-white/70'
            }`}
          >
            {f === 'all' ? `All (${counts.total})` : `${f} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-white/30">
            <Shield size={24} className="mb-2" />
            <p>No audit entries{filter !== 'all' ? ` matching "${filter}"` : ''}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...filtered].reverse().map((entry) => {
              const style = OUTCOME_STYLES[entry.outcome];
              const Icon = style.icon;
              const time = new Date(entry.timestamp);
              const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 px-3 py-2 hover:bg-white/5"
                >
                  <Icon size={12} className={`mt-0.5 flex-shrink-0 ${style.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-white/80">{entry.action}</span>
                      <span className="text-white/30">&larr;</span>
                      <span className="text-white/40">{entry.sourcePanel}</span>
                      <span className="ml-auto text-white/30">{timeStr}</span>
                    </div>
                    {entry.error && (
                      <p className="mt-0.5 truncate text-red-400/70">{entry.error}</p>
                    )}
                    {entry.reason && (
                      <p className="mt-0.5 truncate text-orange-400/70">{entry.reason}</p>
                    )}
                    {entry.durationMs !== undefined && entry.outcome === 'success' && (
                      <span className="text-white/30">{entry.durationMs}ms</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
