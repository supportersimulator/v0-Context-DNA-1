'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Syringe,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Zap,
  Shield,
  BookOpen,
  Brain,
  Eye,
  Lightbulb,
  AlertTriangle,
  Library,
  Sparkles,
  Radio,
  Circle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SectionData {
  id: number;
  name: string;
  tokens: number;
  timingMs: number;
  freshness: 'realtime' | 'idle' | 'cached' | 'stale';
  content: string;
  variant?: string;
}

interface InjectionPayload {
  hash: string;
  timestamp: number;
  totalTokens: number;
  totalTimingMs: number;
  abVariant: string;
  sections: SectionData[];
}

// ---------------------------------------------------------------------------
// Section config (icons, colors)
// ---------------------------------------------------------------------------
const SECTION_CONFIG: Record<number, { icon: React.ElementType; color: string; label: string }> = {
  0: { icon: Shield, color: '#ef4444', label: 'SAFETY' },
  1: { icon: BookOpen, color: '#3b82f6', label: 'FOUNDATION' },
  2: { icon: Lightbulb, color: '#e5c07b', label: 'WISDOM' },
  3: { icon: Eye, color: '#f97316', label: 'AWARENESS' },
  4: { icon: Brain, color: '#c678dd', label: 'DEEP CONTEXT' },
  5: { icon: Zap, color: '#22c55e', label: 'PROTOCOL' },
  6: { icon: Radio, color: '#06b6d4', label: 'HOLISTIC' },
  7: { icon: Library, color: '#6b6b75', label: 'FULL LIBRARY' },
  8: { icon: Sparkles, color: '#c678dd', label: '8TH INTELLIGENCE' },
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockPayload(): InjectionPayload {
  return {
    hash: 'a7f3c2e1',
    timestamp: Date.now() - 5000,
    totalTokens: 8420,
    totalTimingMs: 2340,
    abVariant: 'A',
    sections: [
      { id: 0, name: 'SAFETY', tokens: 180, timingMs: 12, freshness: 'cached', content: '⛔ NEVER DO: Force push to main, delete production databases, skip pre-commit hooks...' },
      { id: 1, name: 'FOUNDATION', tokens: 2100, timingMs: 89, freshness: 'realtime', content: '📄 File: admin.contextdna.io/components/ide/panels/...\n🔧 SOPs: Panel creation pattern, Dockview registration...' },
      { id: 2, name: 'WISDOM', tokens: 680, timingMs: 450, freshness: 'realtime', content: '🎓 [Qwen3-14B reasoning]\n<think>Panel architecture follows VS Code pattern...</think>\nFocus on consistent dark theme, collapsible sections...' },
      { id: 3, name: 'AWARENESS', tokens: 920, timingMs: 156, freshness: 'realtime', content: '⚡ Recent: 7 new panel files committed (Phase 10D-G)\n⚠️ Ripple: panel-factory.tsx needs 7 new registrations...' },
      { id: 4, name: 'DEEP CONTEXT', tokens: 1450, timingMs: 230, freshness: 'idle', content: '🧠 Blueprint: 9-section webhook → IDE panel mapping\n📊 Brain state: Butler readiness 9.5/10...' },
      { id: 5, name: 'PROTOCOL', tokens: 320, timingMs: 18, freshness: 'cached', content: '✅ First-try likelihood: 78%\n📸 Remember to capture_success() on completion' },
      { id: 6, name: 'HOLISTIC', tokens: 580, timingMs: 890, freshness: 'realtime', content: '[Synaptic → Atlas]\nPanel infrastructure is solid. Wire ContextBus status into health checks...' },
      { id: 7, name: 'FULL LIBRARY', tokens: 0, timingMs: 5, freshness: 'stale', content: '(Not triggered — escalation tier < 3)' },
      { id: 8, name: '8TH INTELLIGENCE', tokens: 2190, timingMs: 490, freshness: 'realtime', content: '[Synaptic → Aaron]\nThe mansion is well-maintained. 9.5/10 readiness. Session patterns show...' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Freshness badge
// ---------------------------------------------------------------------------
function FreshnessBadge({ freshness }: { freshness: SectionData['freshness'] }) {
  const config = {
    realtime: { color: '#22c55e', label: 'LIVE' },
    idle: { color: '#3b82f6', label: 'IDLE' },
    cached: { color: '#e5c07b', label: 'CACHED' },
    stale: { color: '#6b6b75', label: 'STALE' },
  }[freshness];
  return (
    <span className="text-[8px] px-1 py-0.5 rounded" style={{ backgroundColor: `${config.color}20`, color: config.color }}>
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------
function SectionCard({ section }: { section: SectionData }) {
  const [expanded, setExpanded] = useState(false);
  const config = SECTION_CONFIG[section.id] ?? { icon: Circle, color: '#6b6b75', label: `Section ${section.id}` };
  const Icon = config.icon;

  return (
    <div className="border-b border-[#2a2a35]/50 last:border-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-[#1a1a24]/50"
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />}
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: config.color }} />
        <span className="text-[10px] font-medium" style={{ color: config.color }}>§{section.id}</span>
        <span className="text-[10px] text-[#e5e5e5]">{config.label}</span>
        <FreshnessBadge freshness={section.freshness} />
        <span className="text-[9px] text-[#6b6b75] ml-auto">{section.tokens}tok</span>
        <span className="text-[9px] text-[#6b6b75]">{section.timingMs}ms</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          <pre className="text-[10px] text-[#e5e5e5]/80 bg-[#1a1a24] rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[200px] overflow-y-auto">
            {section.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InjectionViewerPanel — main export
// ---------------------------------------------------------------------------
export function InjectionViewerPanel() {
  const [payload, setPayload] = useState<InjectionPayload>(getMockPayload);
  const [live, setLive] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch latest injection
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8029/api/injection/latest', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hash) setPayload(data);
        }
      } catch { /* keep mock */ }
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 10000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for live updates
  useEffect(() => {
    if (!live || typeof window === 'undefined') return;
    try {
      const ws = new WebSocket('ws://127.0.0.1:8029/ws/events');
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['injection'] }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel === 'injection' && msg.data?.hash) {
            setPayload(msg.data);
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => { wsRef.current = null; };
      return () => { ws.onclose = null; ws.close(); };
    } catch { /* no WS */ }
  }, [live]);

  const timeAgo = (ms: number) => {
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Syringe className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Injection Viewer</span>
        <button
          onClick={() => setLive((v) => !v)}
          className={`text-[9px] px-1.5 py-0.5 rounded-full ml-auto ${
            live ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'bg-[#6b6b75]/15 text-[#6b6b75]'
          }`}
        >
          {live ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      {/* Payload meta */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#2a2a35]/50 text-[10px] text-[#6b6b75]">
        <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{payload.hash}</span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(payload.timestamp)}</span>
        <span>{payload.totalTokens.toLocaleString()} tokens</span>
        <span>{payload.totalTimingMs}ms</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6]">
          Variant {payload.abVariant}
        </span>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {payload.sections.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>

      {/* Freshness legend */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-3 text-[9px] text-[#6b6b75]">
        {(['realtime', 'idle', 'cached', 'stale'] as const).map((f) => (
          <span key={f} className="flex items-center gap-1">
            <FreshnessBadge freshness={f} />
          </span>
        ))}
      </div>
    </div>
  );
}
