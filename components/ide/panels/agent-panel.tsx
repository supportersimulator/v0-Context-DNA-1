'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Syringe,
  Users,
  Shield,
  RotateCcw,
  Key,
  Zap,
} from 'lucide-react';
import { useSetting } from '@/lib/ide/settings-store';
import { getServiceUrl } from '@/lib/ide/service-registry';
import {
  MODEL_CATALOG,
  PROVIDERS,
  getEnabledModels,
  groupByProvider,
  getModel,
} from '@/lib/ide/model-catalog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'crashed' | 'stopped';
type AgentMode = 'subscription' | 'api';

interface AgentSession {
  id: string;
  task: string;
  model: string;
  status: AgentStatus;
  startedAt: number;
  tokens: number;
  injectionActive: boolean;
  mode?: AgentMode;
  cost_usd?: number;
  claude_session_id?: string | null;
  num_turns?: number;
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
// Constants
// ---------------------------------------------------------------------------
const AGENT_API = getServiceUrl('helper_agent');
const AGENT_WS = getServiceUrl('helper_agent').replace('http://', 'ws://') + '/ws/agents';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function statusIcon(status: AgentStatus) {
  switch (status) {
    case 'idle': return <Circle className="w-3 h-3 text-[#6b6b75]" />;
    case 'running': return <Loader2 className="w-3 h-3 text-[#3b82f6] animate-spin" />;
    case 'completed': return <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />;
    case 'failed': return <XCircle className="w-3 h-3 text-[#ef4444]" />;
    case 'crashed': return <XCircle className="w-3 h-3 text-[#ef4444] animate-pulse" />;
    case 'stopped': return <Square className="w-3 h-3 text-[#e5c07b]" />;
  }
}

function timeAgo(ms: number): string {
  if (ms === 0) return '--';
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

function formatCost(cost?: number): string {
  if (cost == null || cost === 0) return '';
  return `$${cost.toFixed(4)}`;
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
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [approvals, setApprovals] = useState<ToolApproval[]>([]);
  const [output, setOutput] = useState<AgentOutput[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [model, setModel] = useState('anthropic/sonnet');
  const [primaryMode] = useSetting('agents.primaryMode');
  const [autoFallback] = useSetting('agents.autoFallback');
  const [mode, setMode] = useState<AgentMode>(primaryMode);
  const [enabledModels] = useSetting('models.enabled');

  // Sync mode with primaryMode setting when it changes
  useEffect(() => { setMode(primaryMode); }, [primaryMode]);
  const [sessionPersistence, setSessionPersistence] = useState(true);
  const [connected, setConnected] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  // Poll for session status
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${AGENT_API}/api/agents/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.sessions) setSessions(data.sessions);
          if (data.approvals) setApprovals(data.approvals);
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for live output
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(AGENT_WS);
        ws.onopen = () => setConnected(true);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'output') {
              setOutput((prev) => [...prev.slice(-200), msg.data]);
            }
            if (msg.type === 'session_update') {
              setSessions((prev) => {
                const idx = prev.findIndex((s) => s.id === msg.data.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = msg.data;
                  return updated;
                }
                return [...prev, msg.data];
              });
            }
            if (msg.type === 'approval') {
              setApprovals((prev) => [...prev, msg.data]);
            }
          } catch { /* ignore */ }
        };
        ws.onclose = () => {
          setConnected(false);
          reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => ws?.close();
      } catch { /* no WS */ }
    };

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, []);

  // Spawn a new task (with auto-fallback)
  const submitTask = useCallback(async () => {
    if (!taskInput.trim()) return;

    const selectedModel = getModel(model);
    const canFallback = autoFallback && selectedModel?.supportsSubscription && selectedModel?.supportsApi;
    const fallbackMode: AgentMode = mode === 'subscription' ? 'api' : 'subscription';

    const trySpawn = async (useMode: AgentMode): Promise<boolean> => {
      const res = await fetch(`${AGENT_API}/api/agents/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: taskInput.trim(),
          model,
          mode: useMode,
          inject_context: true,
          session_persistence: sessionPersistence,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setOutput((prev) => [...prev, {
          agentId: data.session_id,
          type: 'text',
          content: `Spawned ${useMode} session ${data.session_id} (${model})`,
          timestamp: Date.now(),
        }]);
        return true;
      }
      return false;
    };

    try {
      const ok = await trySpawn(mode);
      if (!ok && canFallback) {
        setOutput((prev) => [...prev, {
          agentId: 'system',
          type: 'text',
          content: `Primary mode (${mode}) failed — falling back to ${fallbackMode}...`,
          timestamp: Date.now(),
        }]);
        await trySpawn(fallbackMode);
      }
    } catch {
      if (canFallback) {
        try {
          setOutput((prev) => [...prev, {
            agentId: 'system',
            type: 'text',
            content: `Primary mode (${mode}) failed — falling back to ${fallbackMode}...`,
            timestamp: Date.now(),
          }]);
          await trySpawn(fallbackMode);
        } catch { /* both failed */ }
      }
    }
    setTaskInput('');
  }, [taskInput, model, mode, autoFallback, sessionPersistence]);

  // Resume a crashed session
  const resumeSession = useCallback(async (session: AgentSession) => {
    if (!session.claude_session_id) return;
    try {
      await fetch(`${AGENT_API}/api/agents/resume/${session.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claude_session_id: session.claude_session_id }),
        signal: AbortSignal.timeout(10000),
      });
    } catch { /* ignore */ }
  }, []);

  // Stop a session
  const stopSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`${AGENT_API}/api/agents/stop/${sessionId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch { /* ignore */ }
  }, []);

  // Approve/Deny tool
  const approveAction = useCallback(async (approvalId: string, approved: boolean) => {
    setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    try {
      await fetch(`${AGENT_API}/api/agents/approve/${approvalId}?approved=${approved}`, {
        method: 'POST',
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
        <span className="ml-auto">
          <span className={`w-1.5 h-1.5 rounded-full inline-block ${connected ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
        </span>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitTask();
                }
              }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              {/* Mode selector */}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as AgentMode)}
                className="text-[10px] px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] focus:outline-none"
              >
                <option value="subscription">Subscription (Pro/Max)</option>
                <option value="api">API Key</option>
              </select>
              {/* Model selector — catalog-driven, grouped by provider */}
              <select
                value={model}
                onChange={(e) => {
                  const m = getModel(e.target.value);
                  setModel(e.target.value);
                  if (m && !m.supportsSubscription) setMode('api');
                }}
                className="text-[10px] px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] focus:outline-none"
              >
                {(() => {
                  const active = getEnabledModels(enabledModels);
                  const grouped = groupByProvider(active);
                  return Object.entries(grouped).map(([pid, models]) => {
                    const provider = PROVIDERS.find((p) => p.id === pid);
                    return (
                      <optgroup key={pid} label={provider?.name ?? pid}>
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}{!m.supportsSubscription ? ` ($${m.costPerMInput}/M)` : ''}
                          </option>
                        ))}
                      </optgroup>
                    );
                  });
                })()}
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
                <Users className="w-3 h-3" /> Swarm
              </button>
            </div>
            {/* Mode indicator + fallback + persistence toggle */}
            <div className="flex items-center gap-1.5 text-[9px] text-[#6b6b75]">
              {mode === 'subscription' ? (
                <>
                  <Zap className="w-3 h-3 text-[#22c55e]" />
                  <span>Subscription{autoFallback ? ' → API fallback' : ''}</span>
                </>
              ) : (
                <>
                  <Key className="w-3 h-3 text-[#e5c07b]" />
                  <span>API{autoFallback && getModel(model)?.supportsSubscription ? ' → Sub fallback' : ''}</span>
                </>
              )}
              <span className="mx-1 text-[#2a2a35]">|</span>
              <button
                onClick={() => setSessionPersistence((v) => !v)}
                className="relative group/tip flex items-center gap-1 hover:text-[#e5e5e5] transition-colors"
                title={sessionPersistence
                  ? 'Session persistence ON — sessions survive crashes and can be resumed'
                  : 'Session persistence OFF — sessions are ephemeral (no disk writes)'}
              >
                <span className={`w-5 h-2.5 rounded-full transition-colors inline-flex items-center ${sessionPersistence ? 'bg-[#22c55e]/30' : 'bg-[#6b6b75]/30'}`}>
                  <span className={`w-2 h-2 rounded-full transition-all ${sessionPersistence ? 'bg-[#22c55e] translate-x-2.5' : 'bg-[#6b6b75] translate-x-0.5'}`} />
                </span>
                <span>persist</span>
                {/* Hover tooltip */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[8px] text-[#e5e5e5] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity z-50">
                  {sessionPersistence
                    ? 'ON: Sessions saved to disk — crash resume enabled'
                    : 'OFF: Ephemeral sessions — no disk writes, no resume'}
                </span>
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
            {sessions.length === 0 && (
              <div className="text-[10px] text-[#6b6b75] py-2 text-center">
                No sessions yet. Spawn a task above.
              </div>
            )}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded group">
                {statusIcon(s.status)}
                <span className="text-[#e5e5e5] truncate flex-1">{s.task}</span>
                <span className="text-[9px] px-1 rounded bg-[#1a1a24] text-[#6b6b75]">{s.model}</span>
                {s.mode === 'subscription' && (
                  <Zap className="w-3 h-3 text-[#22c55e]" title="Subscription" />
                )}
                {s.mode === 'api' && (
                  <Key className="w-3 h-3 text-[#e5c07b]" title="API Key" />
                )}
                {s.injectionActive && (
                  <Syringe className="w-3 h-3 text-[#22c55e]" title="Context DNA injected" />
                )}
                {/* Cost display for API mode */}
                {s.cost_usd != null && s.cost_usd > 0 && (
                  <span className="text-[9px] text-[#e5c07b]">{formatCost(s.cost_usd)}</span>
                )}
                {s.tokens > 0 && (
                  <span className="text-[9px] text-[#6b6b75]">{(s.tokens / 1000).toFixed(1)}k</span>
                )}
                <span className="text-[#6b6b75]">{timeAgo(s.startedAt)}</span>
                {/* Action buttons */}
                {s.status === 'running' && (
                  <button
                    onClick={() => stopSession(s.id)}
                    className="opacity-0 group-hover:opacity-100 text-[9px] px-1 py-0.5 rounded bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25"
                    title="Stop"
                  >
                    <Square className="w-2.5 h-2.5" />
                  </button>
                )}
                {(s.status === 'crashed' || s.status === 'failed') && s.claude_session_id && (
                  <button
                    onClick={() => resumeSession(s)}
                    className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-[#3b82f6]/15 text-[#3b82f6] hover:bg-[#3b82f6]/25 animate-pulse"
                    title="Resume session"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Resume
                  </button>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Live Output */}
        <Section title="Output" defaultOpen={output.length > 0}>
          <div className="px-3 py-1 max-h-[300px] overflow-y-auto">
            {output.length === 0 && (
              <div className="text-[10px] text-[#6b6b75] py-2 text-center">
                Output will appear here when agents run.
              </div>
            )}
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
        <span>Claude Code integration with Context DNA injection</span>
        <span className="ml-auto">{sessions.length > 0 ? `${sessions.length} sessions` : ''}</span>
      </div>
    </div>
  );
}
