'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  Database,
  ToggleLeft,
  ToggleRight,
  Activity,
  HardDrive,
  Server,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Wifi,
  WifiOff,
  Circle,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type BusMode = 'lite' | 'heavy';

interface BusStatus {
  mode: BusMode;
  connected: boolean;
  sqlite: { connected: boolean; dbCount: number; totalRows: number };
  redis: { connected: boolean; keys: number; memoryUsed: string; subscribers: number };
  postgres: { connected: boolean; databases: string[]; totalRows: number };
  stats: { messagesPerSec: number; avgLatencyMs: number; uptime: string };
}

interface SqliteDbInfo {
  name: string;
  path: string;
  rows: number;
  sizeKb: number;
  walMode: boolean;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockStatus(): BusStatus {
  return {
    mode: 'lite',
    connected: true,
    sqlite: { connected: true, dbCount: 11, totalRows: 2847 },
    redis: { connected: false, keys: 0, memoryUsed: '0 MB', subscribers: 0 },
    postgres: { connected: true, databases: ['context_dna', 'contextdna'], totalRows: 1584 },
    stats: { messagesPerSec: 12.4, avgLatencyMs: 2.1, uptime: '4h 32m' },
  };
}

function getMockDbs(): SqliteDbInfo[] {
  return [
    { name: 'learnings.db', path: 'memory/learnings.db', rows: 313, sizeKb: 2048, walMode: true },
    { name: '.observability.db', path: 'memory/.observability.db', rows: 751, sizeKb: 4096, walMode: true },
    { name: '.context_ab_tracking.db', path: 'memory/.context_ab_tracking.db', rows: 542, sizeKb: 1536, walMode: true },
    { name: 'session_archive.db', path: 'memory/session_archive.db', rows: 388, sizeKb: 3072, walMode: true },
    { name: '.meta_analysis.db', path: 'memory/.meta_analysis.db', rows: 127, sizeKb: 512, walMode: true },
    { name: 'repair_sops.db', path: 'memory/repair_sops.db', rows: 1, sizeKb: 64, walMode: true },
    { name: 'codebase_graph.db', path: 'memory/codebase_graph.db', rows: 241, sizeKb: 1024, walMode: true },
    { name: '.duplicate_detector.db', path: 'memory/.duplicate_detector.db', rows: 89, sizeKb: 256, walMode: false },
    { name: '.failure_patterns.db', path: 'memory/.failure_patterns.db', rows: 45, sizeKb: 128, walMode: true },
    { name: '.butler_notes.db', path: 'memory/.butler_notes.db', rows: 22, sizeKb: 96, walMode: true },
    { name: '.evidence_pipeline.db', path: 'memory/.evidence_pipeline.db', rows: 328, sizeKb: 1280, walMode: true },
  ];
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
// ContextBusPanel — main export
// ---------------------------------------------------------------------------
export function ContextBusPanel() {
  const [status, setStatus] = useState<BusStatus>(getMockStatus);
  const [dbs, setDbs] = useState<SqliteDbInfo[]>(getMockDbs);
  const [mode, setMode] = useState<BusMode>('lite');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/context-bus/status', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.mode) setStatus(data);
          if (data.mode) setMode(data.mode);
        }
      } catch { /* keep mock */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchDbs = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/context-bus/databases', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.databases) setDbs(data.databases);
        }
      } catch { /* keep mock */ }
    };
    fetchDbs();
  }, []);

  const toggleMode = useCallback(async () => {
    const newMode = mode === 'lite' ? 'heavy' : 'lite';
    setMode(newMode);
    try {
      await fetch(getServiceUrl('helper_agent') + '/api/context-bus/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* revert on failure */ setMode(mode); }
  }, [mode]);

  const isHeavy = mode === 'heavy';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Radio className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">ContextBus</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-1 ${
          isHeavy ? 'bg-[#c678dd]/15 text-[#c678dd]' : 'bg-[#22c55e]/15 text-[#22c55e]'
        }`}>
          {isHeavy ? 'HEAVY' : 'LITE'}
        </span>
        <span className="text-[10px] text-[#6b6b75] ml-auto flex items-center gap-1">
          {status.connected
            ? <><Wifi className="w-3 h-3 text-[#22c55e]" /> Online</>
            : <><WifiOff className="w-3 h-3 text-[#ef4444]" /> Offline</>
          }
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Mode Toggle */}
        <Section title="Mode">
          <div className="px-3 py-2">
            <button
              onClick={toggleMode}
              className="flex items-center gap-2 w-full p-2 rounded bg-[#1a1a24] border border-[#2a2a35] hover:border-[#3b3b45] transition-colors"
            >
              {isHeavy
                ? <ToggleRight className="w-5 h-5 text-[#c678dd]" />
                : <ToggleLeft className="w-5 h-5 text-[#22c55e]" />
              }
              <div className="flex-1 text-left">
                <div className="text-xs text-[#e5e5e5]">{isHeavy ? 'Heavy Mode' : 'Lite Mode'}</div>
                <div className="text-[9px] text-[#6b6b75]">
                  {isHeavy ? 'RedisBus + Docker required' : 'SQLiteBus — no Docker needed'}
                </div>
              </div>
            </button>
            {isHeavy && !status.redis.connected && (
              <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1 rounded bg-[#ef4444]/10 text-[10px] text-[#ef4444]">
                <AlertTriangle className="w-3 h-3" />
                Redis not connected — Heavy mode requires Docker
              </div>
            )}
          </div>
        </Section>

        {/* Connection Status */}
        <Section title="Connections">
          <div className="px-3 py-1.5 space-y-1.5">
            {/* SQLite */}
            <div className="flex items-center gap-2 text-[11px]">
              <Circle className="w-2.5 h-2.5 flex-shrink-0" style={{
                color: status.sqlite.connected ? '#22c55e' : '#ef4444',
                fill: status.sqlite.connected ? '#22c55e' : '#ef4444',
              }} />
              <HardDrive className="w-3 h-3 text-[#e5c07b]" />
              <span className="text-[#e5e5e5]">SQLite</span>
              <span className="text-[#6b6b75] ml-auto">{status.sqlite.dbCount} DBs / {status.sqlite.totalRows.toLocaleString()} rows</span>
            </div>
            {/* Redis */}
            <div className="flex items-center gap-2 text-[11px]">
              <Circle className="w-2.5 h-2.5 flex-shrink-0" style={{
                color: status.redis.connected ? '#22c55e' : '#6b6b75',
                fill: status.redis.connected ? '#22c55e' : '#6b6b75',
              }} />
              <Server className="w-3 h-3 text-[#c678dd]" />
              <span className={status.redis.connected ? 'text-[#e5e5e5]' : 'text-[#6b6b75]'}>Redis (6379)</span>
              <span className="text-[#6b6b75] ml-auto">
                {status.redis.connected ? `${status.redis.keys} keys` : isHeavy ? 'Disconnected' : 'Lite mode'}
              </span>
            </div>
            {/* PostgreSQL */}
            <div className="flex items-center gap-2 text-[11px]">
              <Circle className="w-2.5 h-2.5 flex-shrink-0" style={{
                color: status.postgres.connected ? '#22c55e' : '#ef4444',
                fill: status.postgres.connected ? '#22c55e' : '#ef4444',
              }} />
              <Database className="w-3 h-3 text-[#3b82f6]" />
              <span className="text-[#e5e5e5]">PostgreSQL</span>
              <span className="text-[#6b6b75] ml-auto">{status.postgres.databases.join(', ')}</span>
            </div>
          </div>
        </Section>

        {/* Bus Stats */}
        <Section title="Bus Metrics">
          <div className="px-3 py-1.5 grid grid-cols-3 gap-2">
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#22c55e]">{status.stats.messagesPerSec}</div>
              <div className="text-[9px] text-[#6b6b75]">msg/sec</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#3b82f6]">{status.stats.avgLatencyMs}ms</div>
              <div className="text-[9px] text-[#6b6b75]">latency</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#e5c07b]">{status.stats.uptime}</div>
              <div className="text-[9px] text-[#6b6b75]">uptime</div>
            </div>
          </div>
        </Section>

        {/* SQLite Databases */}
        <Section title="SQLite Databases" count={dbs.length} defaultOpen={false}>
          <div className="px-3 py-1 space-y-0.5">
            {dbs.map((db) => (
              <div key={db.name} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                <HardDrive className="w-3 h-3 text-[#e5c07b] flex-shrink-0" />
                <span className="text-[#e5e5e5] truncate flex-1">{db.name}</span>
                <span className="text-[#6b6b75]">{db.rows} rows</span>
                <span className="text-[#6b6b75]">{(db.sizeKb / 1024).toFixed(1)}MB</span>
                {db.walMode && (
                  <span className="text-[8px] px-1 rounded bg-[#22c55e]/10 text-[#22c55e]">WAL</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Activity className="w-3 h-3" />
        <span>Same API contract — SQLiteBus and RedisBus are interchangeable</span>
      </div>
    </div>
  );
}
