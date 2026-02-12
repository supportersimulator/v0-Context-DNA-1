'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Library,
  ChevronDown,
  ChevronRight,
  Search,
  Send,
  Circle,
  FileText,
  GitBranch,
  TestTube2,
  Link2,
  FileQuestion,
  Scale,
  Clock,
  Database,
  Brain,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type LibrarianIntent =
  | 'locate'     // Find where something is
  | 'explain'    // Explain how something works
  | 'trace'      // Trace data flow
  | 'impact'     // Assess change impact
  | 'tests'      // Find related tests
  | 'deps'       // List dependencies
  | 'docs'       // Find documentation
  | 'decision';  // Surface architecture decisions

interface QueryResult {
  intent: LibrarianIntent;
  query: string;
  files: { path: string; relevance: number; snippet?: string }[];
  answer?: string;
  timestamp: number;
  durationMs: number;
}

interface GraphStats {
  totalFiles: number;
  totalEdges: number;
  lastUpdated: number;
  incrementalMode: boolean;
}

interface IndexHealth {
  name: string;
  status: 'healthy' | 'stale' | 'rebuilding';
  rows: number;
  lastUpdate: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockStats(): GraphStats {
  return { totalFiles: 241, totalEdges: 29218, lastUpdated: Date.now() - 90000, incrementalMode: true };
}

function getMockIndexes(): IndexHealth[] {
  return [
    { name: 'codebase_graph', status: 'healthy', rows: 241, lastUpdate: Date.now() - 90000 },
    { name: 'learnings_fts5', status: 'healthy', rows: 313, lastUpdate: Date.now() - 60000 },
    { name: 'sop_index', status: 'healthy', rows: 45, lastUpdate: Date.now() - 300000 },
    { name: 'architecture_decisions', status: 'healthy', rows: 22, lastUpdate: Date.now() - 600000 },
    { name: 'failure_patterns', status: 'healthy', rows: 45, lastUpdate: Date.now() - 120000 },
    { name: 'repair_sops', status: 'stale', rows: 1, lastUpdate: Date.now() - 7200000 },
  ];
}

function getMockHistory(): QueryResult[] {
  return [
    {
      intent: 'locate',
      query: 'Where is the injection builder?',
      files: [{ path: 'context-dna/injection/builder.py', relevance: 0.97 }],
      answer: 'The injection builder lives at context-dna/injection/builder.py',
      timestamp: Date.now() - 300000,
      durationMs: 1200,
    },
    {
      intent: 'trace',
      query: 'How does a learning reach the evidence pipeline?',
      files: [
        { path: 'context-dna/injection/evidence_pipeline.py', relevance: 0.92 },
        { path: 'memory/auto_capture.py', relevance: 0.85 },
      ],
      answer: 'capture_success() → quarantine_item() → claim → outcomes → promotion',
      timestamp: Date.now() - 600000,
      durationMs: 2800,
    },
  ];
}

// ---------------------------------------------------------------------------
// Intent config
// ---------------------------------------------------------------------------
const INTENT_CONFIG: Record<LibrarianIntent, { icon: React.ElementType; color: string; label: string }> = {
  locate: { icon: Search, color: '#3b82f6', label: 'Locate' },
  explain: { icon: Brain, color: '#c678dd', label: 'Explain' },
  trace: { icon: GitBranch, color: '#22c55e', label: 'Trace' },
  impact: { icon: Activity, color: '#f97316', label: 'Impact' },
  tests: { icon: TestTube2, color: '#06b6d4', label: 'Tests' },
  deps: { icon: Link2, color: '#e5c07b', label: 'Deps' },
  docs: { icon: FileText, color: '#6b6b75', label: 'Docs' },
  decision: { icon: Scale, color: '#ef4444', label: 'Decision' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Section
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
// LibrarianPanel — main export
// ---------------------------------------------------------------------------
export function LibrarianPanel() {
  const [online, setOnline] = useState(true);
  const [stats, setStats] = useState<GraphStats>(getMockStats);
  const [indexes, setIndexes] = useState<IndexHealth[]>(getMockIndexes);
  const [history, setHistory] = useState<QueryResult[]>(getMockHistory);
  const [query, setQuery] = useState('');
  const [intent, setIntent] = useState<LibrarianIntent>('locate');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/librarian/status', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          setOnline(true);
          if (data.stats) setStats(data.stats);
          if (data.indexes) setIndexes(data.indexes);
          if (data.history) setHistory(data.history);
        }
      } catch { setOnline(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const submitQuery = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(getServiceUrl('helper_agent') + '/api/librarian/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), intent }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const result = await res.json();
        setHistory((prev) => [result, ...prev].slice(0, 20));
      }
    } catch { /* ignore */ }
    setSearching(false);
    setQuery('');
  }, [query, intent]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Library className="w-3.5 h-3.5 text-[#e5c07b]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Repo Librarian</span>
        <Circle className="w-2.5 h-2.5 ml-auto" style={{
          color: online ? '#22c55e' : '#ef4444',
          fill: online ? '#22c55e' : '#ef4444',
        }} />
        <span className={`text-[10px] ${online ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
          {online ? 'Qwen3-14B' : 'Offline'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Query Interface */}
        <Section title="Query">
          <div className="px-3 py-2 space-y-2">
            {/* Intent selector */}
            <div className="flex flex-wrap gap-1">
              {(Object.keys(INTENT_CONFIG) as LibrarianIntent[]).map((i) => {
                const cfg = INTENT_CONFIG[i];
                const Icon = cfg.icon;
                return (
                  <button
                    key={i}
                    onClick={() => setIntent(i)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                      intent === i
                        ? 'text-white'
                        : 'text-[#6b6b75] hover:text-[#e5e5e5]'
                    }`}
                    style={intent === i ? { backgroundColor: `${cfg.color}30`, color: cfg.color } : {}}
                  >
                    <Icon className="w-2.5 h-2.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            {/* Query input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitQuery()}
                placeholder={`${INTENT_CONFIG[intent].label}: ask the librarian...`}
                className="flex-1 px-2 py-1 text-xs bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#6b6b75] focus:outline-none focus:border-[#3b82f6]/50"
                spellCheck={false}
              />
              <button
                onClick={submitQuery}
                disabled={!query.trim() || searching}
                className="p-1.5 rounded bg-[#e5c07b] text-black hover:bg-[#e5c07b]/90 disabled:opacity-40"
              >
                {searching ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </Section>

        {/* Codebase Graph */}
        <Section title="Codebase Graph">
          <div className="px-3 py-2 grid grid-cols-3 gap-2">
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#3b82f6]">{stats.totalFiles}</div>
              <div className="text-[9px] text-[#6b6b75]">files</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#c678dd]">{stats.totalEdges.toLocaleString()}</div>
              <div className="text-[9px] text-[#6b6b75]">edges</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#22c55e]">{stats.incrementalMode ? 'git-first' : 'full'}</div>
              <div className="text-[9px] text-[#6b6b75]">mode</div>
            </div>
          </div>
        </Section>

        {/* Recent Queries */}
        {history.length > 0 && (
          <Section title="Recent Queries" count={history.length}>
            <div className="px-3 py-1 space-y-1.5">
              {history.map((r, i) => {
                const cfg = INTENT_CONFIG[r.intent];
                const Icon = cfg.icon;
                return (
                  <div key={i} className="text-[10px] py-1 border-b border-[#2a2a35]/30 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3 h-3 flex-shrink-0" style={{ color: cfg.color }} />
                      <span className="text-[#e5e5e5] truncate flex-1">{r.query}</span>
                      <span className="text-[#6b6b75]">{r.durationMs}ms</span>
                    </div>
                    {r.answer && (
                      <div className="text-[#e5e5e5]/70 mt-0.5 pl-4 truncate">{r.answer}</div>
                    )}
                    {r.files.length > 0 && (
                      <div className="mt-0.5 pl-4 space-y-0.5">
                        {r.files.slice(0, 3).map((f, fi) => (
                          <div key={fi} className="flex items-center gap-1 text-[9px]">
                            <FileText className="w-2.5 h-2.5 text-[#6b6b75]" />
                            <span className="text-[#3b82f6] truncate">{f.path}</span>
                            <span className="text-[#6b6b75] ml-auto">{(f.relevance * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Index Health */}
        <Section title="Index Health" count={indexes.length} defaultOpen={false}>
          <div className="px-3 py-1 space-y-0.5">
            {indexes.map((idx) => (
              <div key={idx.name} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                <Database className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
                <span className="text-[#e5e5e5] truncate flex-1">{idx.name}</span>
                <span className="text-[#6b6b75]">{idx.rows}</span>
                {idx.status === 'healthy' && <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />}
                {idx.status === 'stale' && <Clock className="w-3 h-3 text-[#e5c07b]" />}
                {idx.status === 'rebuilding' && <Activity className="w-3 h-3 text-[#3b82f6] animate-spin" />}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Library className="w-3 h-3" />
        <span>8 intents · Qwen3-14B · Incremental graph ({stats.totalFiles} files)</span>
      </div>
    </div>
  );
}
