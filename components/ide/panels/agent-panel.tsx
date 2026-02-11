'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Send,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Syringe,
  Users,
  Clock,
  Terminal,
  Shield,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

interface AgentSession {
  id: string;
  task: string;
  model: string;
  status: AgentStatus;
  startedAt: number;
  tokens: number;
  injectionActive: boolean;
}

interface ToolApproval {
  id: string;
  tool: string;
  args: string;
  agentId: string;
  timestamp: number;
}

interface AgentOutput {
  agentId: string;
  type: 'text' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockSessions(): AgentSession[] {
  return [
    { id: 'a-001', task: 'Write context-bus-panel.tsx', model: 'opus', status: 'completed', startedAt: Date.now() - 300000, tokens: 4200, injectionActive: true },
    { id: 'a-002', task: 'Wire panels into panel-factory', model: 'sonnet', status: 'running', startedAt: Date.now() - 60000, tokens: 1800, injectionActive: true },
    { id: 'a-003', task: 'Run build check', model: 'haiku', status: 'idle', startedAt: 0, tokens: 0, injectionActive: false },
  ];
}

function getMockApprovals(): ToolApproval[] {
  return [
    { id: 'ta-1', tool: 'Write', args: 'panel-factory.tsx', agentId: 'a-002', timestamp: Date.now() - 5000 },
  ];
}

function getMockOutput(): AgentOutput[] {
  return [
    { agentId: 'a-002', type: 'text', content: 'Reading panel-factory.tsx to understand registration pattern...', timestamp: Date.now() - 30000 },
    { agentId: 'a-002', type: 'tool_call', content: 'Read: admin.contextdna.io/components/ide/panel-factory.tsx', timestamp: Date.now() - 25000 },
    { agentId: 'a-002', type: 'tool_result', content: '635 lines read successfully', timestamp: Date.now() - 24000 },
    { agentId: 'a-002', type: 'text', content: 'Adding 7 new panel imports and registrations...', timestamp: Date.now() - 10000 },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusIcon(status: AgentStatus) {
  switch (status) {
    case 'idle': return <Circle className="w-3 h-3 text-[#6b6b75]" />;
    case 'running': return <Loader2 className="w-3 h-3 text-[#3b82f6] animate-spin" />;
    case 'completed': return <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />;
    case 'failed': return <XCircle className="w-3 h-3 text-[#ef4444]" />;
    case 'stopped': return <Square className="w-3 h-3 text-[#e5c07b]" />;
  }
}

function timeAgo(ms: number): string {
  if (ms === 0) return '--';
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
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
// AgentPanel — main export
// ---------------------------------------------------------------------------
export function AgentPanel() {
  const [sessions, setSessions] = useState<AgentSession[]>(getMockSessions);
  const [approvals, setApprovals] = useState<ToolApproval[]>(getMockApprovals);
  const [output, setOutput] = useState<AgentOutput[]>(getMockOutput);
  const [taskInput, setTaskInput] = useState('');
  const [model, setModel] = useState<'opus' | 'sonnet' | 'haiku'>('sonnet');
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8029/api/agents/status', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sessions) setSessions(data.sessions);
          if (data.approvals) setApprovals(data.approvals);
        }
      } catch { /* keep mock */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for live output
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ws = new WebSocket('ws://127.0.0.1:8029/ws/agents');
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            setOutput((prev) => [...prev.slice(-100), msg.data]);
          }
          if (msg.type === 'approval') {
            setApprovals((prev) => [...prev, msg.data]);
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => ws.close();
      return () => { ws.onclose = null; ws.close(); };
    } catch { /* no WS */ }
  }, []);

  const submitTask = useCallback(async () => {
    if (!taskInput.trim()) return;
    try {
      await fetch('http://127.0.0.1:8029/api/agents/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: taskInput.trim(), model }),
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* ignore */ }
    setTaskInput('');
  }, [taskInput, model]);

  const approveAction = useCallback(async (approvalId: string, approved: boolean) => {
    setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    try {
      await fetch(`http://127.0.0.1:8029/api/agents/approve/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* ignore */ }
  }, []);

  const runningCount = sessions.filter((s) => s.status === 'running').length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-[#3b82f6]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Agent Tasks</span>
        {runningCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6]">
            {runningCount} running
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Task Submission */}
        <Section title="New Task">
          <div className="px-3 py-2 space-y-2">
            <textarea
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="Describe the task..."
              className="w-full h-16 px-2 py-1.5 text-xs bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#6b6b75] focus:outline-none focus:border-[#3b82f6]/50 resize-none"
              spellCheck={false}
            />
            <div className="flex items-center gap-2">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as 'opus' | 'sonnet' | 'haiku')}
                className="text-[10px] px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] focus:outline-none"
              >
                <option value="opus">Opus (complex)</option>
                <option value="sonnet">Sonnet (balanced)</option>
                <option value="haiku">Haiku (fast)</option>
              </select>
              <button
                onClick={submitTask}
                disabled={!taskInput.trim()}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-[#3b82f6] text-white hover:bg-[#3b82f6]/90 disabled:opacity-40"
              >
                <Play className="w-3 h-3" /> Spawn
              </button>
              <button
                onClick={() => {/* spawn swarm */}}
                className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-[#c678dd]/20 text-[#c678dd] hover:bg-[#c678dd]/30"
              >
                <Users className="w-3 h-3" /> Swarm (10)
              </button>
            </div>
          </div>
        </Section>

        {/* Tool Approvals */}
        {approvals.length > 0 && (
          <Section title="Tool Approvals" count={approvals.length}>
            <div className="px-3 py-1 space-y-1">
              {approvals.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-1.5 px-2 rounded bg-[#e5c07b]/5 border border-[#e5c07b]/20">
                  <Shield className="w-3 h-3 text-[#e5c07b] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[#e5e5e5]">{a.tool}: {a.args}</div>
                    <div className="text-[9px] text-[#6b6b75]">Agent: {a.agentId}</div>
                  </div>
                  <button
                    onClick={() => approveAction(a.id, true)}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] hover:bg-[#22c55e]/25"
                  >
                    Allow
                  </button>
                  <button
                    onClick={() => approveAction(a.id, false)}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25"
                  >
                    Deny
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Sessions */}
        <Section title="Sessions" count={sessions.length}>
          <div className="px-3 py-1 space-y-0.5">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                {statusIcon(s.status)}
                <span className="text-[#e5e5e5] truncate flex-1">{s.task}</span>
                <span className="text-[9px] px-1 rounded bg-[#1a1a24] text-[#6b6b75]">{s.model}</span>
                {s.injectionActive && (
                  <Syringe className="w-3 h-3 text-[#22c55e]" title="Context DNA injection active" />
                )}
                <span className="text-[#6b6b75]">{timeAgo(s.startedAt)}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Live Output */}
        <Section title="Output" defaultOpen={false}>
          <div className="px-3 py-1 max-h-[200px] overflow-y-auto">
            {output.map((o, i) => (
              <div key={i} className="text-[10px] py-0.5 font-mono">
                {o.type === 'text' && <span className="text-[#e5e5e5]">{o.content}</span>}
                {o.type === 'tool_call' && <span className="text-[#3b82f6]">{'>'} {o.content}</span>}
                {o.type === 'tool_result' && <span className="text-[#22c55e]">  {o.content}</span>}
                {o.type === 'error' && <span className="text-[#ef4444]">! {o.content}</span>}
              </div>
            ))}
            <div ref={outputEndRef} />
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Bot className="w-3 h-3" />
        <span>Claude Code-style agent integration with Context DNA injection</span>
      </div>
    </div>
  );
}
