'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Tag,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Search,
  Circle,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Learning {
  id: string;
  title: string;
  details: string;
  domain: string;
  confidence: number;
  evidenceStatus?: 'quarantine' | 'claim' | 'applied';
  timestamp: number;
  tags: string[];
  source: string;
}

interface LearningsStats {
  todayCount: number;
  allTimeCount: number;
  topDomain: string;
  avgConfidence: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DOMAIN_COLORS: Record<string, string> = {
  injection: '#22c55e',
  scheduler: '#3b82f6',
  docker: '#c678dd',
  aws: '#f97316',
  database: '#e5c07b',
  redis: '#ef4444',
  networking: '#06b6d4',
  livekit: '#ec4899',
  async: '#8b5cf6',
  infrastructure: '#f97316',
  deployment: '#22d3ee',
  performance: '#fbbf24',
};

const DEFAULT_DOMAIN_COLOR = '#6b6b75';

const EVIDENCE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  quarantine: { color: '#e5c07b', bg: '#e5c07b20', label: 'QTN' },
  claim: { color: '#3b82f6', bg: '#3b82f620', label: 'CLM' },
  applied: { color: '#22c55e', bg: '#22c55e20', label: 'APL' },
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockLearnings(): Learning[] {
  const now = Date.now();
  return [
    {
      id: 'l-001',
      title: 'SQLiteStorage singleton bypass causes FD leak',
      details: 'SQLiteStorage() bypassed singleton in 3 hot-path locations. Always use get_sqlite_storage().',
      domain: 'database',
      confidence: 0.95,
      evidenceStatus: 'applied',
      timestamp: now - 1800000,
      tags: ['sqlite', 'fd-leak', 'singleton'],
      source: 'auto_capture',
    },
    {
      id: 'l-002',
      title: 'codebase_map_refresh parsed 1281 files every 5min',
      details: '2.25GB spike per run. Disabled scheduled refresh, graph built on-demand during injection.',
      domain: 'scheduler',
      confidence: 0.92,
      evidenceStatus: 'applied',
      timestamp: now - 3600000,
      tags: ['memory', 'scheduler', 'codebase-graph'],
      source: 'bug_fix',
    },
    {
      id: 'l-003',
      title: 'Qwen3-14B native thinking mode for Section 2',
      details: 'Dynamic wisdom via <think> mode (T=0.6, 700 tokens). Matches Qwen2.5-32B quality at 14B density.',
      domain: 'injection',
      confidence: 0.88,
      evidenceStatus: 'claim',
      timestamp: now - 7200000,
      tags: ['qwen3', 'wisdom', 'llm'],
      source: 'architecture_decision',
    },
    {
      id: 'l-004',
      title: 'Docker restart does not reload env vars',
      details: 'docker restart does not reload env vars. Must recreate container with docker-compose up -d.',
      domain: 'docker',
      confidence: 0.97,
      evidenceStatus: 'applied',
      timestamp: now - 14400000,
      tags: ['docker', 'env', 'gotcha'],
      source: 'bug_fix',
    },
    {
      id: 'l-005',
      title: 'localhost vs 127.0.0.1 IPv6 resolution on macOS',
      details: 'localhost resolves to IPv6 on macOS with Docker. Always use 127.0.0.1 to avoid resolution issues.',
      domain: 'networking',
      confidence: 0.97,
      evidenceStatus: 'applied',
      timestamp: now - 28800000,
      tags: ['ipv6', 'macos', 'docker'],
      source: 'bug_fix',
    },
    {
      id: 'l-006',
      title: 'Redis context-dna port 6379 no auth',
      details: 'Python code uses context-dna-redis (6379, no auth). Was incorrectly pointing to 16379 with password.',
      domain: 'redis',
      confidence: 0.90,
      evidenceStatus: 'claim',
      timestamp: now - 43200000,
      tags: ['redis', 'port', 'auth'],
      source: 'bug_fix',
    },
    {
      id: 'l-007',
      title: 'session_historian calls quarantine_item not record_quarantine',
      details: 'observability_store.quarantine_item() is the correct method. record_quarantine() does not exist.',
      domain: 'scheduler',
      confidence: 0.85,
      evidenceStatus: 'quarantine',
      timestamp: now - 54000000,
      tags: ['historian', 'api', 'miswiring'],
      source: 'hindsight_validator',
    },
    {
      id: 'l-008',
      title: 'WebRTC needs direct UDP — Cloudflare proxy breaks it',
      details: 'WebRTC needs direct UDP. Set Cloudflare DNS proxied=false for WebRTC/TURN domains.',
      domain: 'networking',
      confidence: 0.93,
      evidenceStatus: 'applied',
      timestamp: now - 172800000,
      tags: ['webrtc', 'cloudflare', 'udp'],
      source: 'bug_fix',
    },
    {
      id: 'l-009',
      title: 'ASG gives new private IP on restart',
      details: 'GPU EC2 instances get new private IP on ASG restart. Use Internal NLB for stable addressing.',
      domain: 'aws',
      confidence: 0.91,
      evidenceStatus: 'applied',
      timestamp: now - 259200000,
      tags: ['asg', 'ip', 'nlb', 'gpu'],
      source: 'architecture_decision',
    },
    {
      id: 'l-010',
      title: 'Incremental codebase graph: 42s first run, 1.4s subsequent',
      details: 'git diff-based incremental parsing. Only re-parses changed files. 155s/2354MB -> 1.4s/248MB.',
      domain: 'performance',
      confidence: 0.88,
      evidenceStatus: 'claim',
      timestamp: now - 345600000,
      tags: ['codebase-graph', 'performance', 'git'],
      source: 'performance_lesson',
    },
    {
      id: 'l-011',
      title: 'Python sqlite3 with-connect does not close connection',
      details: 'with connect() as conn: does NOT close the connection. Must use try/finally/conn.close().',
      domain: 'database',
      confidence: 0.94,
      evidenceStatus: 'applied',
      timestamp: now - 432000000,
      tags: ['sqlite', 'python', 'gotcha'],
      source: 'bug_fix',
    },
    {
      id: 'l-012',
      title: 'reward=-0.3 is codebase convention for negative outcomes',
      details: 'Standard negative reward value across evidence pipeline. Used by hindsight_validator and mmotw_miner.',
      domain: 'injection',
      confidence: 0.72,
      evidenceStatus: 'quarantine',
      timestamp: now - 518400000,
      tags: ['evidence', 'convention', 'reward'],
      source: 'auto_capture',
    },
  ];
}

function getMockStats(): LearningsStats {
  return {
    todayCount: 5,
    allTimeCount: 313,
    topDomain: 'database',
    avgConfidence: 0.89,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function getDomainColor(domain: string): string {
  return DOMAIN_COLORS[domain.toLowerCase()] ?? DEFAULT_DOMAIN_COLOR;
}

function getConfidenceColor(confidence: number): string {
  if (confidence < 0.3) return '#ef4444';
  if (confidence < 0.7) return '#e5c07b';
  return '#22c55e';
}

function isToday(timestamp: number): boolean {
  return Date.now() - timestamp < 86400000;
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
// Domain pill
// ---------------------------------------------------------------------------
function DomainPill({ domain }: { domain: string }) {
  const color = getDomainColor(domain);
  return (
    <span
      className="text-[8px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {domain}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Evidence badge
// ---------------------------------------------------------------------------
function EvidenceBadge({ status }: { status?: string }) {
  if (!status || !EVIDENCE_CONFIG[status]) return null;
  const cfg = EVIDENCE_CONFIG[status];
  return (
    <span
      className="text-[7px] px-1 py-0.5 rounded font-mono flex-shrink-0"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confidence bar
// ---------------------------------------------------------------------------
function ConfidenceBar({ confidence }: { confidence: number }) {
  const color = getConfidenceColor(confidence);
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <div className="flex-1 h-1 bg-[#1a1a24] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, confidence * 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[8px] font-mono" style={{ color }}>
        {(confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Learning card
// ---------------------------------------------------------------------------
function LearningCard({ learning }: { learning: Learning }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[#2a2a35]/30 last:border-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-1.5 w-full text-left px-3 py-1.5 hover:bg-[#1a1a24]/50"
      >
        {expanded
          ? <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0 mt-0.5" />
          : <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[#e5e5e5] truncate">{learning.title}</span>
            <DomainPill domain={learning.domain} />
            <EvidenceBadge status={learning.evidenceStatus} />
          </div>
          <ConfidenceBar confidence={learning.confidence} />
        </div>
        <span className="text-[9px] text-[#6b6b75] flex-shrink-0 mt-0.5 ml-1">
          {timeAgo(learning.timestamp)}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 pl-7">
          <div className="text-[10px] text-[#e5e5e5]/70 bg-[#1a1a24] rounded p-2 whitespace-pre-wrap leading-relaxed">
            {learning.details}
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {learning.tags.map((tag) => (
              <span key={tag} className="text-[8px] text-[#6b6b75] flex items-center gap-0.5">
                <Tag className="w-2 h-2" />{tag}
              </span>
            ))}
            <span className="text-[8px] text-[#6b6b75] ml-auto">via {learning.source}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain distribution
// ---------------------------------------------------------------------------
function DomainDistribution({ learnings }: { learnings: Learning[] }) {
  const counts: Record<string, number> = {};
  for (const l of learnings) {
    counts[l.domain] = (counts[l.domain] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...sorted.map(([, v]) => v), 1);

  return (
    <div className="px-3 py-2 space-y-1">
      {sorted.map(([domain, count]) => (
        <div key={domain} className="flex items-center gap-2 text-[10px]">
          <span className="w-20 text-right">
            <DomainPill domain={domain} />
          </span>
          <div className="flex-1 h-2.5 bg-[#1a1a24] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (count / max) * 100)}%`,
                backgroundColor: getDomainColor(domain),
              }}
            />
          </div>
          <span className="w-6 text-right font-mono text-[#6b6b75]">{count}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TodayLearningsPanel -- main export
// ---------------------------------------------------------------------------
export function TodayLearningsPanel() {
  const [allLearnings, setAllLearnings] = useState<Learning[]>(getMockLearnings);
  const [stats, setStats] = useState<LearningsStats>(getMockStats);
  const [showAllTime, setShowAllTime] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch live data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/learnings', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.learnings) setAllLearnings(data.learnings);
          if (data.stats) setStats(data.stats);
        }
      } catch { /* keep mock */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter by time range and search
  const filtered = allLearnings.filter((l) => {
    if (!showAllTime && !isToday(l.timestamp)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        l.title.toLowerCase().includes(q) ||
        l.domain.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const displayCount = showAllTime ? stats.allTimeCount : stats.todayCount;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <BookOpen className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">
          {showAllTime ? 'All Learnings' : "Today's Learnings"}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">
          {displayCount}
        </span>
        {/* Time range toggle */}
        <button
          onClick={() => setShowAllTime((v) => !v)}
          className="ml-auto flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded hover:bg-[#1a1a24] transition-colors"
          title={showAllTime ? 'Switch to Today' : 'Switch to All Time'}
        >
          {showAllTime
            ? <ToggleRight className="w-3.5 h-3.5 text-[#c678dd]" />
            : <ToggleLeft className="w-3.5 h-3.5 text-[#22c55e]" />
          }
          <span className={showAllTime ? 'text-[#c678dd]' : 'text-[#22c55e]'}>
            {showAllTime ? 'ALL' : '24H'}
          </span>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-1.5 border-b border-[#2a2a35]/50 flex-shrink-0">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a24] rounded border border-[#2a2a35]">
          <Search className="w-3 h-3 text-[#6b6b75]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by title, domain, tag..."
            className="flex-1 text-[10px] bg-transparent text-[#e5e5e5] placeholder-[#6b6b75] focus:outline-none"
            spellCheck={false}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-[#6b6b75] hover:text-[#e5e5e5]">
              <Circle className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Stats Overview */}
        <Section title="Overview">
          <div className="px-3 py-2 grid grid-cols-4 gap-2">
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#22c55e]">{stats.todayCount}</div>
              <div className="text-[9px] text-[#6b6b75]">today</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#3b82f6]">{stats.allTimeCount}</div>
              <div className="text-[9px] text-[#6b6b75]">all time</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono" style={{ color: getDomainColor(stats.topDomain) }}>
                {stats.topDomain}
              </div>
              <div className="text-[9px] text-[#6b6b75]">top domain</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono" style={{ color: getConfidenceColor(stats.avgConfidence) }}>
                {(stats.avgConfidence * 100).toFixed(0)}%
              </div>
              <div className="text-[9px] text-[#6b6b75]">avg conf</div>
            </div>
          </div>
        </Section>

        {/* Evidence Pipeline Summary */}
        <Section title="Evidence Pipeline">
          <div className="px-3 py-2 flex items-center gap-3">
            {(['quarantine', 'claim', 'applied'] as const).map((status) => {
              const count = filtered.filter((l) => l.evidenceStatus === status).length;
              const cfg = EVIDENCE_CONFIG[status];
              return (
                <div key={status} className="flex items-center gap-1.5 text-[10px]">
                  {status === 'quarantine' && <AlertTriangle className="w-3 h-3" style={{ color: cfg.color }} />}
                  {status === 'claim' && <FlaskConical className="w-3 h-3" style={{ color: cfg.color }} />}
                  {status === 'applied' && <CheckCircle2 className="w-3 h-3" style={{ color: cfg.color }} />}
                  <span style={{ color: cfg.color }}>{count}</span>
                  <span className="text-[#6b6b75]">{status}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 text-[10px] ml-auto">
              <Circle className="w-3 h-3 text-[#6b6b75]" />
              <span className="text-[#6b6b75]">
                {filtered.filter((l) => !l.evidenceStatus).length} untracked
              </span>
            </div>
          </div>
        </Section>

        {/* Learnings List */}
        <Section title="Learnings" count={filtered.length}>
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] text-[#6b6b75]">
              <Lightbulb className="w-5 h-5 mx-auto mb-1 opacity-40" />
              {searchQuery ? 'No learnings match your filter' : 'No learnings in this time range'}
            </div>
          ) : (
            <div>
              {filtered
                .sort((a, b) => b.timestamp - a.timestamp)
                .map((learning) => (
                  <LearningCard key={learning.id} learning={learning} />
                ))}
            </div>
          )}
        </Section>

        {/* Domain Distribution */}
        <Section title="Domain Distribution" count={Object.keys(
          filtered.reduce((acc, l) => ({ ...acc, [l.domain]: true }), {} as Record<string, boolean>)
        ).length} defaultOpen={false}>
          <DomainDistribution learnings={filtered} />
        </Section>

        {/* Confidence Distribution */}
        <Section title="Confidence Tiers" defaultOpen={false}>
          <div className="px-3 py-2 space-y-1.5">
            {[
              { label: 'High (>=70%)', min: 0.7, max: 1.01, color: '#22c55e' },
              { label: 'Medium (30-69%)', min: 0.3, max: 0.7, color: '#e5c07b' },
              { label: 'Low (<30%)', min: 0, max: 0.3, color: '#ef4444' },
            ].map((tier) => {
              const count = filtered.filter((l) => l.confidence >= tier.min && l.confidence < tier.max).length;
              const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
              return (
                <div key={tier.label} className="flex items-center gap-2 text-[10px]">
                  <span className="w-28 text-[#6b6b75]">{tier.label}</span>
                  <div className="flex-1 h-2.5 bg-[#1a1a24] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: tier.color }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono" style={{ color: tier.color }}>{count}</span>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <TrendingUp className="w-3 h-3" />
        <span>
          {showAllTime ? `${stats.allTimeCount} total` : `${stats.todayCount} today`} ·
          avg confidence {(stats.avgConfidence * 100).toFixed(0)}% ·
          query → implement → record
        </span>
      </div>
    </div>
  );
}
