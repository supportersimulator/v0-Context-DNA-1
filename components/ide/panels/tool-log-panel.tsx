'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Wrench,
  FileText,
  Terminal,
  Search,
  Pencil,
  Eye,
  Code2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  getProjectDialogue,
  type ProjectDialogueEvent,
} from '@/lib/agents';
import { getAgentManager } from '@/lib/agents';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCall {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  agentAccent: string;
  tool: string;
  input: string;
  duration?: number;
  status: 'running' | 'success' | 'error';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: Eye,
  Edit: Pencil,
  Write: FileText,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  WebFetch: Code2,
  WebSearch: Search,
  default: Wrench,
};

const AGENT_ACCENTS: Record<string, string> = {
  claude: '#22c55e',
  synaptic: '#a78bfa',
  openhands: '#f59e0b',
  deepseek: '#38bdf8',
};

const MAX_LOG_ITEMS = 200;

// ---------------------------------------------------------------------------
// Tool call row
// ---------------------------------------------------------------------------

function ToolCallRow({ call, expanded, onToggle }: {
  call: ToolCall;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = TOOL_ICONS[call.tool] ?? TOOL_ICONS.default;
  const timeStr = new Date(call.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="border-b border-[#1a1a24]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#12121a] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[#4a4a55] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#4a4a55] flex-shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: call.agentAccent }} />
        <span className="text-xs font-mono text-[#e5e5e5] flex-shrink-0">{call.tool}</span>
        <span className="text-xs text-[#6b6b75] truncate flex-1">{call.input}</span>
        <span className="text-xs text-[#3a3a45] flex-shrink-0 tabular-nums">{timeStr}</span>
        {call.status === 'running' && (
          <Circle className="w-2.5 h-2.5 text-green-400 animate-pulse flex-shrink-0" />
        )}
        {call.status === 'error' && (
          <Circle className="w-2.5 h-2.5 text-red-500 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-8 py-2 bg-[#0d0d14] text-xs">
          <div className="flex items-center gap-2 text-[#6b6b75] mb-1">
            <span>Agent: {call.agentName}</span>
            {call.duration != null && <span>Duration: {call.duration}ms</span>}
          </div>
          <pre className="text-[#8b8b95] font-mono text-[11px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {call.input}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolLogPanel — main export
// ---------------------------------------------------------------------------

export function ToolLogPanel() {
  const [calls, setCalls] = useState<ToolCall[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterTool, setFilterTool] = useState<string>('all');
  const logRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    const dialogue = getProjectDialogue();
    const manager = getAgentManager();

    const unsub = dialogue.subscribe(
      { types: ['agent_response', 'file_change'] },
      (event: ProjectDialogueEvent) => {
        const agent = manager.get(event.agent_id);
        const payload = event.payload as Record<string, unknown>;
        const tool = (payload?.tool as string) ?? (event.type === 'file_change' ? 'Edit' : 'unknown');
        const input = (payload?.input as string) ?? (payload?.path as string) ?? JSON.stringify(payload).slice(0, 200);

        const call: ToolCall = {
          id: `tool-${idCounter.current++}`,
          timestamp: event.timestamp,
          agentId: event.agent_id,
          agentName: agent?.definition.name ?? event.agent_id,
          agentAccent: AGENT_ACCENTS[event.agent_id] ?? '#6b6b75',
          tool,
          input,
          status: (payload?.error) ? 'error' : 'success',
          duration: payload?.duration as number | undefined,
        };

        setCalls((prev) => {
          const next = [...prev, call];
          return next.length > MAX_LOG_ITEMS ? next.slice(-MAX_LOG_ITEMS) : next;
        });
      },
    );

    return unsub;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [calls.length]);

  const filteredCalls = useMemo(() => {
    if (filterTool === 'all') return calls;
    return calls.filter((c) => c.tool === filterTool);
  }, [calls, filterTool]);

  const toolTypes = useMemo(() => {
    const set = new Set(calls.map((c) => c.tool));
    return ['all', ...Array.from(set).sort()];
  }, [calls]);

  const handleClear = useCallback(() => setCalls([]), []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a35]">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-[#22c55e]" />
          <span className="text-xs font-medium text-[#e5e5e5]">Tool Log</span>
          <span className="text-xs text-[#4a4a55]">({filteredCalls.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={filterTool}
            onChange={(e) => setFilterTool(e.target.value)}
            className="text-xs bg-[#12121a] border border-[#2a2a35] rounded px-1.5 py-0.5 text-[#e5e5e5] outline-none"
          >
            {toolTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All Tools' : t}
              </option>
            ))}
          </select>
          <button
            onClick={handleClear}
            className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]"
            title="Clear log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div ref={logRef} className="flex-1 overflow-y-auto min-h-0">
        {filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#4a4a55] gap-2">
            <Wrench className="w-8 h-8" />
            <span className="text-xs">No tool calls recorded</span>
          </div>
        ) : (
          filteredCalls.map((call) => (
            <ToolCallRow
              key={call.id}
              call={call}
              expanded={expandedId === call.id}
              onToggle={() => setExpandedId(expandedId === call.id ? null : call.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
