'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Database,
  HardDrive,
  Server,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SyncTarget {
  name: string;
  type: 'sqlite' | 'postgres' | 'redis';
  rows: number;
  lastSync: number;
  status: 'synced' | 'behind' | 'error' | 'syncing';
  lagMs: number;
}

interface SyncEvent {
  id: string;
  timestamp: number;
  source: string;
  target: string;
  rowsSynced: number;
  durationMs: number;
  status: 'success' | 'conflict' | 'error';
  message?: string;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockTargets(): SyncTarget[] {
  return [
    { name: 'learnings.db', type: 'sqlite', rows: 313, lastSync: Date.now() - 60000, status: 'synced', lagMs: 0 },
    { name: '.observability.db', type: 'sqlite', rows: 751, lastSync: Date.now() - 120000, status: 'synced', lagMs: 0 },
    { name: '.context_ab_tracking.db', type: 'sqlite', rows: 542, lastSync: Date.now() - 180000, status: 'synced', lagMs: 0 },
    { name: 'session_archive.db', type: 'sqlite', rows: 388, lastSync: Date.now() - 300000, status: 'behind', lagMs: 45000 },
    { name: 'context_dna (PG:5432)', type: 'postgres', rows: 1584, lastSync: Date.now() - 90000, status: 'synced', lagMs: 0 },
    { name: 'acontext (PG:15432)', type: 'postgres', rows: 892, lastSync: Date.now() - 150000, status: 'synced', lagMs: 0 },
    { name: 'Redis (6379)', type: 'redis', rows: 47, lastSync: Date.now() - 30000, status: 'synced', lagMs: 0 },
  ];
}

function getMockEvents(): SyncEvent[] {
  return [
    { id: 's1', timestamp: Date.now() - 60000, source: 'learnings.db', target: 'context_dna (PG)', rowsSynced: 3, durationMs: 245, status: 'success' },
    { id: 's2', timestamp: Date.now() - 120000, source: '.observability.db', target: 'context_dna (PG)', rowsSynced: 12, durationMs: 890, status: 'success' },
    { id: 's3', timestamp: Date.now() - 300000, source: 'session_archive.db', target: 'context_dna (PG)', rowsSynced: 0, durationMs: 45, status: 'conflict', message: 'PK collision on insight_id' },
    { id: 's4', timestamp: Date.now() - 600000, source: 'Redis', target: 'learnings.db', rowsSynced: 1, durationMs: 12, status: 'success' },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function statusIcon(status: SyncTarget['status']) {
  switch (status) {
    case 'synced': return <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />;
    case 'behind': return <Clock className="w-3 h-3 text-[#e5c07b]" />;
    case 'error': return <XCircle className="w-3 h-3 text-[#ef4444]" />;
    case 'syncing': return <RefreshCw className="w-3 h-3 text-[#3b82f6] animate-spin" />;
  }
}

function typeIcon(type: SyncTarget['type']) {
  switch (type) {
    case 'sqlite': return <HardDrive className="w-3 h-3 text-[#e5c07b]" />;
    case 'postgres': return <Database className="w-3 h-3 text-[#3b82f6]" />;
    case 'redis': return <Server className="w-3 h-3 text-[#c678dd]" />;
  }
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------
function Section({ title, count, defaultOpen = true, children }: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1 hover:bg-[#1a1a24] text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75] border-b border-[#2a2a35]/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="flex-1">{title}</span>
        {count !== undefined && (
          <span className="bg-[#1a1a24] px-1.5 rounded-full text-[9px]">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SyncPanel — main export
// ---------------------------------------------------------------------------
export function SyncPanel() {
  const [targets, setTargets] = useState<SyncTarget[]>(getMockTargets);
  const [events, setEvents] = useState<SyncEvent[]>(getMockEvents);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8029/api/sync/status', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.targets) setTargets(data.targets);
          if (data.events) setEvents(data.events);
        }
      } catch { /* keep mock */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('http://127.0.0.1:8029/api/sync/trigger', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* ignore */ }
    setTimeout(() => setSyncing(false), 3000);
  }, []);

  const syncedCount = targets.filter((t) => t.status === 'synced').length;
  const behindCount = targets.filter((t) => t.status === 'behind').length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <ArrowLeftRight className="w-3.5 h-3.5 text-[#3b82f6]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Bidirectional Sync</span>
        <span className="text-[10px] text-[#6b6b75] ml-auto">{syncedCount}/{targets.length} synced</span>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5] disabled:opacity-40"
          title="Trigger sync now"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-[#3b82f6]' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Topology */}
        <Section title="Three-Tier Topology">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex flex-col items-center gap-0.5">
                <HardDrive className="w-4 h-4 text-[#e5c07b]" />
                <span className="text-[#e5c07b]">SQLite</span>
                <span className="text-[#6b6b75]">11 DBs</span>
              </div>
              <div className="flex-1 mx-2 border-t border-dashed border-[#3b82f6] relative">
                <ArrowLeftRight className="w-3 h-3 text-[#3b82f6] absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0f]" />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Database className="w-4 h-4 text-[#3b82f6]" />
                <span className="text-[#3b82f6]">PostgreSQL</span>
                <span className="text-[#6b6b75]">2 DBs</span>
              </div>
              <div className="flex-1 mx-2 border-t border-dashed border-[#c678dd] relative">
                <ArrowLeftRight className="w-3 h-3 text-[#c678dd] absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0a0a0f]" />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Server className="w-4 h-4 text-[#c678dd]" />
                <span className="text-[#c678dd]">Redis</span>
                <span className="text-[#6b6b75]">Cache</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Sync Targets */}
        <Section title="Sync Targets" count={targets.length}>
          <div className="px-3 py-1 space-y-0.5">
            {targets.map((t) => (
              <div key={t.name} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                {typeIcon(t.type)}
                <span className="text-[#e5e5e5] truncate flex-1">{t.name}</span>
                <span className="text-[#6b6b75]">{t.rows.toLocaleString()}</span>
                {statusIcon(t.status)}
                <span className="text-[#6b6b75] w-12 text-right">{timeAgo(t.lastSync)}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Sync History */}
        <Section title="Recent Syncs" count={events.length} defaultOpen={false}>
          <div className="px-3 py-1 space-y-1">
            {events.map((ev) => (
              <div key={ev.id} className="text-[10px] py-1 border-b border-[#2a2a35]/30 last:border-0">
                <div className="flex items-center gap-1.5">
                  {ev.status === 'success' && <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />}
                  {ev.status === 'conflict' && <AlertTriangle className="w-3 h-3 text-[#e5c07b]" />}
                  {ev.status === 'error' && <XCircle className="w-3 h-3 text-[#ef4444]" />}
                  <span className="text-[#e5e5e5]">{ev.source}</span>
                  <ArrowLeftRight className="w-2.5 h-2.5 text-[#6b6b75]" />
                  <span className="text-[#e5e5e5]">{ev.target}</span>
                  <span className="text-[#6b6b75] ml-auto">{timeAgo(ev.timestamp)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 pl-4.5 text-[#6b6b75]">
                  <span>{ev.rowsSynced} rows</span>
                  <span>{ev.durationMs}ms</span>
                  {ev.message && <span className="text-[#e5c07b]">{ev.message}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        {behindCount > 0 ? (
          <><AlertTriangle className="w-3 h-3 text-[#e5c07b]" /> {behindCount} target{behindCount > 1 ? 's' : ''} behind</>
        ) : (
          <><CheckCircle2 className="w-3 h-3 text-[#22c55e]" /> All targets synchronized</>
        )}
      </div>
    </div>
  );
}
