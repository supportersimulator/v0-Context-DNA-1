'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Bot,
  Brain,
  Users,
  Cpu,
  Circle,
  FileText,
  MessageSquare,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
  Loader2,
  Filter,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getProjectDialogue,
  type ProjectDialogueEvent,
  type ProjectDialogueEventType,
} from '@/lib/agents';
import { getAgentManager, type AgentState } from '@/lib/agents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedCard {
  id: string;
  event: ProjectDialogueEvent;
  agentName: string;
  agentAccent: string;
  icon: LucideIcon;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ICONS: Record<string, LucideIcon> = {
  claude: Bot,
  synaptic: Brain,
  openhands: Users,
  deepseek: Cpu,
};

const AGENT_ACCENTS: Record<string, string> = {
  claude: '#22c55e',
  synaptic: '#a78bfa',
  openhands: '#f59e0b',
  deepseek: '#38bdf8',
};

const EVENT_ICONS: Record<ProjectDialogueEventType, LucideIcon> = {
  user_message: MessageSquare,
  agent_response: Bot,
  file_change: FileText,
  test_result: CheckCircle2,
  plan_update: GitBranch,
  context_handoff: ArrowRightLeft,
  agent_status: Circle,
};

const MAX_FEED_ITEMS = 100;

// ---------------------------------------------------------------------------
// Feed card component
// ---------------------------------------------------------------------------

function FeedCardItem({ card }: { card: FeedCard }) {
  const AgentIcon = AGENT_ICONS[card.event.agent_id] ?? Circle;
  const EventIcon = EVENT_ICONS[card.event.type] ?? Circle;
  const timeAgo = formatTimeAgo(card.event.timestamp);

  return (
    <div className="flex gap-2 px-3 py-2 border-b border-[#1a1a24] hover:bg-[#12121a] transition-colors">
      {/* Agent icon with accent */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center mt-0.5"
        style={{ backgroundColor: `${card.agentAccent}15` }}
      >
        <AgentIcon className="w-3.5 h-3.5" style={{ color: card.agentAccent }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-medium text-[#e5e5e5]">{card.agentName}</span>
          <EventIcon className="w-3 h-3 text-[#4a4a55]" />
          <span className="text-[#6b6b75]">{formatEventType(card.event.type)}</span>
          <span className="text-[#3a3a45] ml-auto">{timeAgo}</span>
        </div>
        <div className="text-xs text-[#8b8b95] mt-0.5 truncate">
          {formatPayload(card.event)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatEventType(type: ProjectDialogueEventType): string {
  const map: Record<ProjectDialogueEventType, string> = {
    user_message: 'message',
    agent_response: 'response',
    file_change: 'file change',
    test_result: 'test result',
    plan_update: 'plan update',
    context_handoff: 'handoff',
    agent_status: 'status',
  };
  return map[type] ?? type;
}

function formatPayload(event: ProjectDialogueEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'user_message':
    case 'agent_response':
      return (p?.text as string) ?? (p?.message as string) ?? '...';
    case 'file_change':
      return (p?.path as string) ?? '...';
    case 'test_result':
      return `${p?.status ?? 'unknown'}: ${p?.name ?? ''}`;
    case 'context_handoff':
      return `${p?.from ?? '?'} → ${p?.to ?? '?'}`;
    case 'agent_status':
      return `Status: ${p?.status ?? 'unknown'}`;
    case 'plan_update':
      return (p?.summary as string) ?? '...';
    default:
      return JSON.stringify(p).slice(0, 80);
  }
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  return `${Math.floor(diff / 3_600_000)}h`;
}

// ---------------------------------------------------------------------------
// SwarmFeedPanel — main export
// ---------------------------------------------------------------------------

export function SwarmFeedPanel() {
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [filter, setFilter] = useState<ProjectDialogueEventType | 'all'>('all');
  const feedRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  // Subscribe to ProjectDialogue events
  useEffect(() => {
    const dialogue = getProjectDialogue();
    const manager = getAgentManager();

    // Seed with existing history
    const history = dialogue.getRecent(50);
    const initial = history.map((event) => eventToCard(event, manager, idCounter));
    setCards(initial);

    // Subscribe to new events
    const unsub = dialogue.subscribe({}, (event) => {
      const card = eventToCard(event, manager, idCounter);
      setCards((prev) => {
        const next = [...prev, card];
        return next.length > MAX_FEED_ITEMS ? next.slice(-MAX_FEED_ITEMS) : next;
      });
    });

    return unsub;
  }, []);

  // Auto-scroll to bottom on new cards
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [cards.length]);

  const filteredCards = useMemo(() => {
    if (filter === 'all') return cards;
    return cards.filter((c) => c.event.type === filter);
  }, [cards, filter]);

  const handleClear = useCallback(() => setCards([]), []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a35]">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#f59e0b]" />
          <span className="text-xs font-medium text-[#e5e5e5]">Swarm Feed</span>
          <span className="text-xs text-[#4a4a55]">({filteredCards.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Filter dropdown */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ProjectDialogueEventType | 'all')}
            className="text-xs bg-[#12121a] border border-[#2a2a35] rounded px-1.5 py-0.5 text-[#e5e5e5] outline-none"
          >
            <option value="all">All</option>
            <option value="user_message">Messages</option>
            <option value="agent_response">Responses</option>
            <option value="file_change">Files</option>
            <option value="context_handoff">Handoffs</option>
            <option value="agent_status">Status</option>
            <option value="test_result">Tests</option>
            <option value="plan_update">Plans</option>
          </select>
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]"
            title="Clear feed"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto min-h-0">
        {filteredCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#4a4a55] gap-2">
            <Users className="w-8 h-8" />
            <span className="text-xs">No activity yet</span>
          </div>
        ) : (
          filteredCards.map((card) => <FeedCardItem key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function eventToCard(
  event: ProjectDialogueEvent,
  manager: ReturnType<typeof getAgentManager>,
  counter: React.MutableRefObject<number>,
): FeedCard {
  const agent = manager.get(event.agent_id);
  return {
    id: `feed-${counter.current++}`,
    event,
    agentName: agent?.definition.name ?? event.agent_id,
    agentAccent: AGENT_ACCENTS[event.agent_id] ?? '#6b6b75',
    icon: AGENT_ICONS[event.agent_id] ?? Circle,
  };
}
