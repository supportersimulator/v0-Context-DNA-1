'use client';

// =============================================================================
// Session Timeline Panel — Coding session history, continuity, crash recovery
// Unique to ContextDNA IDE: no other IDE tracks session continuity this way
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  CheckCircle2,
  CircleX,
  AlertTriangle,
  GitBranch,
  Cpu,
  BookOpen,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Zap,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionEntry {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: 'completed' | 'in_progress' | 'crashed';
  summary: string;
  decisions: string[];
  outcomes: Array<{ type: 'success' | 'failure'; description: string }>;
  learnings_count: number;
  files_modified: string[];
  agents_spawned: number;
  crash_info?: { reason: string; recovered: boolean };
}

interface SessionStats {
  total_this_week: number;
  crash_rate: number;
  avg_duration_minutes: number;
  learnings_per_session: number;
}

interface SessionHistoryResponse {
  sessions: SessionEntry[];
  stats: SessionStats;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function formatDuration(startStr: string, endStr: string | null): string {
  if (!endStr) return 'ongoing';
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();
  const diff = Math.max(0, end - start);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

function statusColor(status: SessionEntry['status']): string {
  switch (status) {
    case 'completed': return '#22c55e';
    case 'in_progress': return '#f59e0b';
    case 'crashed': return '#ef4444';
  }
}

function statusLabel(status: SessionEntry['status']): string {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in_progress': return 'In Progress';
    case 'crashed': return 'Crashed';
  }
}

// ---------------------------------------------------------------------------
// Mock data (fallback when API unavailable)
// ---------------------------------------------------------------------------

const MOCK_SESSIONS: SessionEntry[] = [
  {
    id: 'sess-001',
    startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    endedAt: null,
    status: 'in_progress',
    summary: 'Building Session Timeline panel for ContextDNA IDE. Implementing crash recovery visualization and session continuity tracking.',
    decisions: ['Use vertical timeline layout', 'Mock fallback for API unavailability'],
    outcomes: [
      { type: 'success', description: 'Panel component structure defined' },
    ],
    learnings_count: 2,
    files_modified: ['components/ide/panels/session-timeline-panel.tsx'],
    agents_spawned: 0,
  },
  {
    id: 'sess-002',
    startedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    endedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'completed',
    summary: 'Fixed FD leak in SQLiteStorage singleton bypass. Three compounding memory leaks identified and resolved. Scheduler dropped from 3.5GB to 103MB.',
    decisions: [
      'Cache SQLiteStorage instances as LiteScheduler._cached_* attributes',
      'Use try/finally for DuplicateDetector connections',
      'Disable scheduled codebase_map_refresh (build on-demand)',
    ],
    outcomes: [
      { type: 'success', description: 'Scheduler memory 3.5GB -> 103MB' },
      { type: 'success', description: 'Agent service 2.3GB -> 184MB' },
      { type: 'success', description: 'FD leak root cause eliminated' },
    ],
    learnings_count: 5,
    files_modified: [
      'memory/lite_scheduler.py',
      'context-dna/agent_service.py',
      'memory/sqlite_storage.py',
    ],
    agents_spawned: 3,
  },
  {
    id: 'sess-003',
    startedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    endedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    status: 'crashed',
    summary: 'Attempting evidence pipeline wiring with cross-session pattern promotion. Session crashed from prompt-too-long after deep codebase exploration.',
    decisions: [
      'Wire session_historian to evidence pipeline',
      'Use quarantine_item() not record_quarantine()',
    ],
    outcomes: [
      { type: 'success', description: 'Identified correct quarantine API' },
      { type: 'failure', description: 'Session crashed before completing promotion wiring' },
    ],
    learnings_count: 3,
    files_modified: [
      'memory/session_historian.py',
      'memory/observability_store.py',
    ],
    agents_spawned: 2,
    crash_info: {
      reason: 'Prompt too long - context exceeded 200K tokens during full codebase scan',
      recovered: true,
    },
  },
  {
    id: 'sess-004',
    startedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    endedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    status: 'completed',
    summary: 'Upgraded local LLM from Qwen2.5-Coder-14B to Qwen3-14B with native thinking mode. Wired into Section 2 (WISDOM) and Section 8 (8TH_INTELLIGENCE).',
    decisions: [
      'Use Qwen3 native <think> mode instead of prompt engineering',
      'Temperature 0.6 for reasoning, 0.7 for generative',
    ],
    outcomes: [
      { type: 'success', description: 'Section 2 now has multi-step causal reasoning' },
      { type: 'success', description: 'Section 8 generates with <think> chains' },
      { type: 'failure', description: 'Initial speed regression (fixed with profile tuning)' },
    ],
    learnings_count: 4,
    files_modified: [
      'context-dna/local_llm/llm_service.py',
      'context-dna/agent_service.py',
      'memory/professor.py',
    ],
    agents_spawned: 1,
  },
  {
    id: 'sess-005',
    startedAt: new Date(Date.now() - 50 * 3600000).toISOString(),
    endedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    status: 'completed',
    summary: 'Redis Python client triple-fix: async_timeout missing, wrong port 16379->6379, wrong password. All P0 Redis-dependent features now operational.',
    decisions: [
      'Use context-dna-redis on port 6379 (no auth), not contextdna-redis on 16379',
    ],
    outcomes: [
      { type: 'success', description: 'P0.1 graph cache operational' },
      { type: 'success', description: 'P0.3 section cache operational' },
      { type: 'success', description: 'P0.4 lockout operational' },
    ],
    learnings_count: 3,
    files_modified: ['memory/redis_cache.py'],
    agents_spawned: 0,
  },
];

const MOCK_STATS: SessionStats = {
  total_this_week: 14,
  crash_rate: 12.5,
  avg_duration_minutes: 135,
  learnings_per_session: 3.2,
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const HISTORY_URL = getServiceUrl('memory_api') + '/api/session/history';
const POLL_INTERVAL = 60_000;

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof Clock;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded bg-[#12121a] border border-[#2a2a35] min-w-[56px]">
      <Icon className={`w-3 h-3 ${color}`} />
      <span className="text-xs font-semibold text-[#e5e5e5]">{value}</span>
      <span className="text-[8px] text-[#6b6b75] uppercase tracking-wider leading-tight text-center">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionRow — single session in the timeline
// ---------------------------------------------------------------------------

function SessionRow({
  session,
  expanded,
  onToggle,
  isFirst,
}: {
  session: SessionEntry;
  expanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
}) {
  const color = statusColor(session.status);
  const timeRange = session.endedAt
    ? `${formatTime(session.startedAt)} - ${formatTime(session.endedAt)}`
    : `${formatTime(session.startedAt)} - now`;
  const duration = formatDuration(session.startedAt, session.endedAt);

  return (
    <div className="relative">
      {/* Timeline connector line */}
      <div
        className="absolute left-[15px] top-0 bottom-0 w-[2px] bg-[#2a2a35]"
        style={{ top: isFirst ? '16px' : 0 }}
      />

      {/* Timeline dot */}
      <div
        className="absolute left-[12px] top-[14px] w-[8px] h-[8px] rounded-full border-2 z-10"
        style={{
          backgroundColor: color,
          borderColor: color,
          boxShadow: session.status === 'in_progress' ? `0 0 8px ${color}80` : 'none',
        }}
      />

      {/* Content */}
      <div className="ml-[30px] mr-2">
        <button
          onClick={onToggle}
          className="w-full text-left py-2 px-2 rounded hover:bg-[#1a1a24] transition-colors group"
        >
          {/* Header row */}
          <div className="flex items-center gap-1.5 mb-1">
            {expanded
              ? <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
            }
            <span className="text-[10px] text-[#6b6b75]">{timeRange}</span>
            <span className="text-[10px] font-medium" style={{ color }}>{duration}</span>
            <span
              className="ml-auto text-[9px] px-1.5 py-0.5 rounded border"
              style={{
                color,
                backgroundColor: `${color}10`,
                borderColor: `${color}30`,
              }}
            >
              {statusLabel(session.status)}
            </span>
          </div>

          {/* Summary */}
          <p className="text-xs text-[#e5e5e5] leading-relaxed line-clamp-2 mb-1.5">
            {session.summary}
          </p>

          {/* Quick stats */}
          <div className="flex items-center gap-3 text-[10px] text-[#6b6b75]">
            {session.agents_spawned > 0 && (
              <span className="flex items-center gap-0.5">
                <Cpu className="w-2.5 h-2.5" />
                {session.agents_spawned} agent{session.agents_spawned !== 1 ? 's' : ''}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <BookOpen className="w-2.5 h-2.5" />
              {session.learnings_count} learning{session.learnings_count !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(session.startedAt)}
            </span>
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-2 pb-3 space-y-3">
            {/* Decisions */}
            {session.decisions.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b75] flex items-center gap-1 mb-1">
                  <GitBranch className="w-2.5 h-2.5" />
                  Key Decisions
                </span>
                <div className="space-y-0.5">
                  {session.decisions.map((d, i) => (
                    <p key={i} className="text-[11px] text-[#a0a0ab] leading-relaxed pl-3 border-l-2 border-[#2a2a35]">
                      {d}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Outcomes */}
            {session.outcomes.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b75] flex items-center gap-1 mb-1">
                  <Zap className="w-2.5 h-2.5" />
                  Outcomes
                </span>
                <div className="space-y-0.5">
                  {session.outcomes.map((o, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      {o.type === 'success' ? (
                        <CheckCircle2 className="w-3 h-3 text-[#22c55e] flex-shrink-0 mt-0.5" />
                      ) : (
                        <CircleX className="w-3 h-3 text-[#ef4444] flex-shrink-0 mt-0.5" />
                      )}
                      <span className="text-[11px] text-[#a0a0ab] leading-relaxed">{o.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Files Modified */}
            {session.files_modified.length > 0 && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b75] flex items-center gap-1 mb-1">
                  <FileText className="w-2.5 h-2.5" />
                  Files Modified ({session.files_modified.length})
                </span>
                <div className="space-y-0.5">
                  {session.files_modified.map((f, i) => (
                    <p key={i} className="text-[10px] text-[#6b6b75] font-mono pl-3 truncate" title={f}>
                      {f}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Crash Info */}
            {session.crash_info && (
              <div className="rounded border border-[#ef4444]/20 bg-[#ef4444]/5 px-2.5 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#ef4444] flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Crash Info
                </span>
                <p className="text-[11px] text-[#ef4444]/80 leading-relaxed mb-1">
                  {session.crash_info.reason}
                </p>
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    color: session.crash_info.recovered ? '#22c55e' : '#f59e0b',
                    backgroundColor: session.crash_info.recovered ? '#22c55e10' : '#f59e0b10',
                    border: `1px solid ${session.crash_info.recovered ? '#22c55e30' : '#f59e0b30'}`,
                  }}
                >
                  {session.crash_info.recovered ? (
                    <><CheckCircle2 className="w-2.5 h-2.5" /> Recovered</>
                  ) : (
                    <><AlertTriangle className="w-2.5 h-2.5" /> Not Recovered</>
                  )}
                </span>
              </div>
            )}

            {/* Spawned Agents */}
            {session.agents_spawned > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#6b6b75]">
                <Cpu className="w-3 h-3 text-[#3b82f6]" />
                <span>
                  {session.agents_spawned} sub-agent{session.agents_spawned !== 1 ? 's' : ''} spawned during this session
                </span>
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        <div className="border-b border-[#2a2a35]/50" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SessionTimelinePanel — main export
// ---------------------------------------------------------------------------

export function SessionTimelinePanel() {
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(HISTORY_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SessionHistoryResponse = await res.json();
      setSessions(data.sessions);
      setStats(data.stats);
      setError(null);
    } catch {
      // Fallback to mock data when API unavailable
      setSessions(MOCK_SESSIONS);
      setStats(MOCK_STATS);
      setError('mock');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [refresh]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ---------- Loading ----------
  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0f] text-[#6b6b75] text-sm gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-xs">Loading session history...</span>
      </div>
    );
  }

  // ---------- Empty state ----------
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0f] text-center p-6">
        <div className="w-12 h-12 rounded-full bg-[#22c55e]/10 flex items-center justify-center mb-3">
          <Clock className="w-6 h-6 text-[#22c55e]" />
        </div>
        <h3 className="text-sm font-medium text-[#e5e5e5] mb-1">Session Timeline</h3>
        <p className="text-xs text-[#6b6b75] max-w-[260px]">
          No sessions recorded yet. Sessions are tracked automatically by the Session Historian and provide crash recovery context.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-[#22c55e]" />
          <span className="text-xs font-medium text-[#e5e5e5]">Session Timeline</span>
          <span className="text-[10px] text-[#6b6b75]">({sessions.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {error === 'mock' && (
            <span className="text-[9px] text-[#f59e0b] bg-[#f59e0b]/10 px-1.5 py-0.5 rounded border border-[#f59e0b]/20">
              mock data
            </span>
          )}
          <button
            onClick={refresh}
            className="text-[#6b6b75] hover:text-[#e5e5e5] transition-colors p-0.5"
            title="Refresh sessions"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Session list with timeline */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.map((session, idx) => (
          <SessionRow
            key={session.id}
            session={session}
            expanded={expandedId === session.id}
            onToggle={() => handleToggle(session.id)}
            isFirst={idx === 0}
          />
        ))}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="border-t border-[#2a2a35] flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-2 overflow-x-auto">
            <StatCard
              icon={TrendingUp}
              value={String(stats.total_this_week)}
              label="This Week"
              color="text-[#3b82f6]"
            />
            <StatCard
              icon={AlertTriangle}
              value={`${stats.crash_rate.toFixed(0)}%`}
              label="Crash Rate"
              color={stats.crash_rate > 20 ? 'text-[#ef4444]' : stats.crash_rate > 10 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}
            />
            <StatCard
              icon={Timer}
              value={stats.avg_duration_minutes >= 60
                ? `${(stats.avg_duration_minutes / 60).toFixed(1)}h`
                : `${stats.avg_duration_minutes}m`}
              label="Avg Duration"
              color="text-[#a78bfa]"
            />
            <StatCard
              icon={BookOpen}
              value={stats.learnings_per_session.toFixed(1)}
              label="Learnings/Sess"
              color="text-[#22c55e]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
