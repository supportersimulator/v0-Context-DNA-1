'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Shield,
  Zap,
  Lock,
  Unlock,
  AlertTriangle,
  Users,
  Brain,
  Gauge,
  Timer,
  BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type GateStatus = 'open' | 'restricted' | 'locked';
type AgentStatus = 'running' | 'completed' | 'failed' | 'waiting' | 'gated';

interface ModelCost {
  name: string;
  inputPer1M: number;
  outputPer1M: number;
  color: string;
}

interface AgentInfo {
  id: string;
  role: string;
  model: string;
  status: AgentStatus;
  tokensIn: number;
  tokensOut: number;
  contextUsed: number;
  contextLimit: number;
  spawnedAt: number;
  gated: boolean;
}

interface CostSummary {
  modelBreakdown: { model: string; cost: number; color: string }[];
  sessionTotal: number;
}

interface HarmonizerGate {
  status: GateStatus;
  reason: string;
  gatedAgents: string[];
  lastChanged: number;
}

interface SwarmControllerData {
  agents: AgentInfo[];
  gate: HarmonizerGate;
  costs: CostSummary;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MODEL_COSTS: ModelCost[] = [
  { name: 'Opus',     inputPer1M: 15,   outputPer1M: 75,   color: '#c678dd' },
  { name: 'Sonnet',   inputPer1M: 3,    outputPer1M: 15,   color: '#3b82f6' },
  { name: 'Haiku',    inputPer1M: 0.25, outputPer1M: 1.25, color: '#22c55e' },
  { name: 'DeepSeek', inputPer1M: 0.14, outputPer1M: 0.28, color: '#f97316' },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockData(): SwarmControllerData {
  const now = Date.now();
  return {
    agents: [
      { id: 'sw-001', role: 'CODE_ARCHAEOLOGIST', model: 'DeepSeek', status: 'running',   tokensIn: 12400, tokensOut: 3200, contextUsed: 18200, contextLimit: 65536, spawnedAt: now - 45000, gated: false },
      { id: 'sw-002', role: 'PATCH_DRAFTER',      model: 'DeepSeek', status: 'running',   tokensIn: 8700,  tokensOut: 5100, contextUsed: 32800, contextLimit: 65536, spawnedAt: now - 42000, gated: false },
      { id: 'sw-003', role: 'TEST_WRITER',        model: 'DeepSeek', status: 'gated',     tokensIn: 4200,  tokensOut: 1800, contextUsed: 8400,  contextLimit: 65536, spawnedAt: now - 38000, gated: true },
      { id: 'sw-004', role: 'RISK_REVIEWER',       model: 'Sonnet',   status: 'waiting',   tokensIn: 0,     tokensOut: 0,    contextUsed: 0,     contextLimit: 200000, spawnedAt: now - 35000, gated: false },
      { id: 'sw-005', role: 'PERFORMANCE_REVIEWER', model: 'Haiku',   status: 'completed', tokensIn: 6100,  tokensOut: 2900, contextUsed: 14200, contextLimit: 200000, spawnedAt: now - 120000, gated: false },
    ],
    gate: {
      status: 'restricted',
      reason: 'Harmonizer awaiting archaeologist context before releasing test writer',
      gatedAgents: ['sw-003'],
      lastChanged: now - 12000,
    },
    costs: {
      modelBreakdown: [
        { model: 'DeepSeek', cost: 0.0072, color: '#f97316' },
        { model: 'Sonnet',   cost: 0.0000, color: '#3b82f6' },
        { model: 'Haiku',    cost: 0.0019, color: '#22c55e' },
      ],
      sessionTotal: 0.0091,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function computeAgentCost(agent: AgentInfo): number {
  const m = MODEL_COSTS.find((mc) => mc.name === agent.model);
  if (!m) return 0;
  return (agent.tokensIn / 1_000_000) * m.inputPer1M + (agent.tokensOut / 1_000_000) * m.outputPer1M;
}

function formatElapsed(spawnedAt: number): string {
  if (spawnedAt === 0) return '--';
  const sec = Math.floor((Date.now() - spawnedAt) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

function agentStatusIcon(status: AgentStatus) {
  switch (status) {
    case 'running':   return <Loader2 className="w-3 h-3 text-[#3b82f6] animate-spin" />;
    case 'completed': return <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />;
    case 'failed':    return <XCircle className="w-3 h-3 text-[#ef4444]" />;
    case 'waiting':   return <Clock className="w-3 h-3 text-[#6b6b75]" />;
    case 'gated':     return <Lock className="w-3 h-3 text-[#e5c07b]" />;
  }
}

function gateStatusColor(status: GateStatus): { bg: string; text: string; fill: string } {
  switch (status) {
    case 'open':       return { bg: 'bg-[#22c55e]/15', text: 'text-[#22c55e]', fill: '#22c55e' };
    case 'restricted': return { bg: 'bg-[#e5c07b]/15', text: 'text-[#e5c07b]', fill: '#e5c07b' };
    case 'locked':     return { bg: 'bg-[#ef4444]/15', text: 'text-[#ef4444]', fill: '#ef4444' };
  }
}

function modelColor(model: string): string {
  return MODEL_COSTS.find((m) => m.name === model)?.color ?? '#6b6b75';
}

// ---------------------------------------------------------------------------
// Section (collapsible, matches existing panels)
// ---------------------------------------------------------------------------
function Section({ title, count, badge, defaultOpen = true, children }: {
  title: string; count?: number; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
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
        {badge}
        {count !== undefined && (
          <span className="bg-[#1a1a24] px-1.5 rounded-full text-[9px]">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CostBar — horizontal bar for cost visualization
// ---------------------------------------------------------------------------
function CostBar({ label, value, maxValue, color }: {
  label: string; value: number; maxValue: number; color: string;
}) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 text-[#e5e5e5] truncate">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a24] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-16 text-right text-[#6b6b75] font-mono">${value.toFixed(4)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TokenBar — usage bar for agent resources
// ---------------------------------------------------------------------------
function TokenBar({ used, limit, color }: {
  used: number; limit: number; color: string;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isHigh = pct > 80;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-[#1a1a24] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: isHigh ? '#ef4444' : color }}
        />
      </div>
      <span className="text-[9px] text-[#6b6b75] font-mono w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SwarmControllerPanel — main export
// ---------------------------------------------------------------------------
export function SwarmControllerPanel() {
  const [data, setData] = useState<SwarmControllerData>(getMockData);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Fetch real data with fallback to mock
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8029/api/swarm/controller', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.agents) setData(json);
        }
      } catch { /* keep mock */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Tick every second to update elapsed times
  useEffect(() => {
    const timer = setInterval(() => setElapsedTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Force gate open
  const forceOpenGate = useCallback(async () => {
    setData((prev) => ({
      ...prev,
      gate: { ...prev.gate, status: 'open' as GateStatus, reason: 'Manually overridden', gatedAgents: [] },
      agents: prev.agents.map((a) => a.gated ? { ...a, gated: false, status: 'running' as AgentStatus } : a),
    }));
    try {
      await fetch('http://127.0.0.1:8029/api/swarm/gate/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_open' }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* ignore */ }
  }, []);

  const { agents, gate, costs } = data;
  const runningCount = agents.filter((a) => a.status === 'running').length;
  const gatedCount = agents.filter((a) => a.gated).length;
  const gateColors = gateStatusColor(gate.status);
  const maxCost = Math.max(...costs.modelBreakdown.map((m) => m.cost), 0.001);

  // Recompute costs from live agent data
  const liveCosts = agents.reduce((sum, a) => sum + computeAgentCost(a), 0);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Users className="w-3.5 h-3.5 text-[#f97316]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Swarm Controller</span>
        {runningCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6]">
            {runningCount} active
          </span>
        )}
        {gatedCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#e5c07b]/15 text-[#e5c07b]">
            {gatedCount} gated
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* ============================================================= */}
        {/* Cost Tracking */}
        {/* ============================================================= */}
        <Section title="Cost Tracking" badge={
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#f97316]/10 text-[#f97316]">
            ${liveCosts.toFixed(4)}
          </span>
        }>
          <div className="px-3 py-2 space-y-2">
            {/* Per-model rate card */}
            <div className="grid grid-cols-4 gap-1">
              {MODEL_COSTS.map((m) => (
                <div key={m.name} className="text-center p-1.5 rounded bg-[#1a1a24]">
                  <div className="text-[10px] font-medium" style={{ color: m.color }}>{m.name}</div>
                  <div className="text-[9px] text-[#6b6b75] mt-0.5">
                    <span className="font-mono">${m.inputPer1M}</span>
                    <span className="text-[#4a4a55]">/</span>
                    <span className="font-mono">${m.outputPer1M}</span>
                  </div>
                  <div className="text-[8px] text-[#4a4a55]">in/out per 1M</div>
                </div>
              ))}
            </div>

            {/* Session total */}
            <div className="flex items-center gap-2 pt-1">
              <DollarSign className="w-3 h-3 text-[#22c55e]" />
              <span className="text-[10px] text-[#6b6b75]">Session total</span>
              <span className="text-sm font-mono text-[#22c55e] ml-auto">${liveCosts.toFixed(4)}</span>
            </div>

            {/* Per-agent cost bars */}
            <div className="space-y-1 pt-1">
              <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider">Per-Agent Cost</div>
              {agents.filter((a) => a.tokensIn + a.tokensOut > 0).map((a) => {
                const agentCost = computeAgentCost(a);
                const agentMax = Math.max(...agents.map(computeAgentCost), 0.0001);
                return (
                  <CostBar
                    key={a.id}
                    label={a.role.replace(/_/g, ' ').split(' ').map((w) => w[0]).join('')}
                    value={agentCost}
                    maxValue={agentMax}
                    color={modelColor(a.model)}
                  />
                );
              })}
            </div>
          </div>
        </Section>

        {/* ============================================================= */}
        {/* Harmonizer Gate */}
        {/* ============================================================= */}
        <Section title="Harmonizer Gate" badge={
          <span className={`text-[9px] px-1.5 py-0.5 rounded ${gateColors.bg} ${gateColors.text}`}>
            {gate.status.toUpperCase()}
          </span>
        }>
          <div className="px-3 py-2 space-y-2">
            {/* Gate status indicator */}
            <div className="flex items-center gap-2">
              <Circle className="w-3 h-3" style={{ color: gateColors.fill, fill: gateColors.fill }} />
              <span className={`text-[10px] font-medium ${gateColors.text}`}>
                Gate {gate.status}
              </span>
              {gate.status !== 'open' && (
                <button
                  onClick={forceOpenGate}
                  className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[9px] rounded bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
                  title="Force open the harmonizer gate"
                >
                  <Unlock className="w-2.5 h-2.5" /> Override
                </button>
              )}
            </div>

            {/* Reason */}
            {gate.reason && (
              <div className="text-[10px] text-[#6b6b75] px-2 py-1.5 rounded bg-[#1a1a24] border border-[#2a2a35]/50">
                {gate.reason}
              </div>
            )}

            {/* Gated agents list */}
            {gate.gatedAgents.length > 0 && (
              <div className="space-y-0.5">
                <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider">Waiting for Approval</div>
                {gate.gatedAgents.map((agentId) => {
                  const agent = agents.find((a) => a.id === agentId);
                  return (
                    <div key={agentId} className="flex items-center gap-2 py-1 px-2 rounded bg-[#e5c07b]/5 border border-[#e5c07b]/15">
                      <Lock className="w-3 h-3 text-[#e5c07b] flex-shrink-0" />
                      <span className="text-[10px] text-[#e5e5e5]">
                        {agent?.role.replace(/_/g, ' ') ?? agentId}
                      </span>
                      <span className="text-[9px] text-[#6b6b75] ml-auto">{agentId}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Gate timing */}
            <div className="flex items-center gap-2 text-[9px] text-[#6b6b75]">
              <Clock className="w-3 h-3" />
              <span>Last changed: {formatElapsed(gate.lastChanged)} ago</span>
            </div>
          </div>
        </Section>

        {/* ============================================================= */}
        {/* Swarm Agents (with per-agent resource meters) */}
        {/* ============================================================= */}
        <Section title="Swarm Agents" count={agents.length}>
          <div className="px-3 py-1 space-y-0.5">
            {agents.map((agent) => {
              const isExpanded = expandedAgent === agent.id;
              const contextPct = agent.contextLimit > 0
                ? (agent.contextUsed / agent.contextLimit) * 100
                : 0;
              const totalTokens = agent.tokensIn + agent.tokensOut;
              const agentCost = computeAgentCost(agent);

              return (
                <div key={agent.id} className="rounded hover:bg-[#1a1a24]/50">
                  {/* Agent summary row */}
                  <button
                    onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                    className="flex items-center gap-2 w-full text-left py-1.5 px-1"
                  >
                    {agentStatusIcon(agent.status)}
                    <span className="text-[10px] text-[#e5e5e5] truncate flex-1">
                      {agent.role.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[9px] px-1 rounded bg-[#1a1a24]" style={{ color: modelColor(agent.model) }}>
                      {agent.model}
                    </span>
                    {agent.gated && (
                      <span className="text-[8px] px-1 rounded bg-[#e5c07b]/15 text-[#e5c07b]">GATED</span>
                    )}
                    <span className="text-[9px] text-[#6b6b75] font-mono">{formatElapsed(agent.spawnedAt)}</span>
                    {isExpanded
                      ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" />
                      : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />
                    }
                  </button>

                  {/* Expanded resource meters */}
                  {isExpanded && (
                    <div className="px-2 pb-2 pt-1 space-y-2 ml-5 border-l border-[#2a2a35]/50">
                      {/* Token usage */}
                      <div>
                        <div className="flex items-center gap-1 text-[9px] text-[#6b6b75] mb-0.5">
                          <BarChart3 className="w-2.5 h-2.5" />
                          <span>Tokens: {(totalTokens / 1000).toFixed(1)}k</span>
                          <span className="ml-auto">{(agent.tokensIn / 1000).toFixed(1)}k in / {(agent.tokensOut / 1000).toFixed(1)}k out</span>
                        </div>
                        <TokenBar
                          used={totalTokens}
                          limit={agent.contextLimit}
                          color={modelColor(agent.model)}
                        />
                      </div>

                      {/* Context window */}
                      <div>
                        <div className="flex items-center gap-1 text-[9px] text-[#6b6b75] mb-0.5">
                          <Brain className="w-2.5 h-2.5" />
                          <span>Context: {(agent.contextUsed / 1000).toFixed(1)}k / {(agent.contextLimit / 1000).toFixed(0)}k</span>
                          <span className="ml-auto">{contextPct.toFixed(0)}% filled</span>
                        </div>
                        <TokenBar
                          used={agent.contextUsed}
                          limit={agent.contextLimit}
                          color={contextPct > 80 ? '#ef4444' : contextPct > 60 ? '#e5c07b' : '#3b82f6'}
                        />
                      </div>

                      {/* Time elapsed */}
                      <div className="flex items-center gap-1 text-[9px] text-[#6b6b75]">
                        <Timer className="w-2.5 h-2.5" />
                        <span>Elapsed: {formatElapsed(agent.spawnedAt)}</span>
                      </div>

                      {/* Agent cost */}
                      <div className="flex items-center gap-1 text-[9px] text-[#6b6b75]">
                        <DollarSign className="w-2.5 h-2.5" />
                        <span>Cost: <span className="font-mono text-[#e5e5e5]">${agentCost.toFixed(6)}</span></span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* ============================================================= */}
        {/* Model Reference (collapsed by default) */}
        {/* ============================================================= */}
        <Section title="Model Pricing Reference" defaultOpen={false}>
          <div className="px-3 py-2">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[9px] text-[#6b6b75] uppercase tracking-wider">
                  <th className="text-left py-0.5 font-semibold">Model</th>
                  <th className="text-right py-0.5 font-semibold">Input</th>
                  <th className="text-right py-0.5 font-semibold">Output</th>
                  <th className="text-right py-0.5 font-semibold">$/MTok</th>
                </tr>
              </thead>
              <tbody>
                {MODEL_COSTS.map((m) => (
                  <tr key={m.name} className="border-t border-[#2a2a35]/30">
                    <td className="py-1 font-medium" style={{ color: m.color }}>{m.name}</td>
                    <td className="py-1 text-right text-[#e5e5e5] font-mono">${m.inputPer1M}</td>
                    <td className="py-1 text-right text-[#e5e5e5] font-mono">${m.outputPer1M}</td>
                    <td className="py-1 text-right text-[#6b6b75] font-mono">
                      ${((m.inputPer1M + m.outputPer1M) / 2).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Zap className="w-3 h-3" />
        <span>Swarm: {agents.length} agents</span>
        <span className="text-[#4a4a55]">|</span>
        <span>Gate: {gate.status}</span>
        <span className="ml-auto font-mono">${liveCosts.toFixed(4)}</span>
      </div>
    </div>
  );
}
