'use client';

// =============================================================================
// Swarm View — THE Killer Feature
// Visual multi-agent orchestration from within the IDE.
// Submit tasks → watch agents work → see integrated results.
// =============================================================================

import { useState, useCallback, useMemo } from 'react';
import {
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Code2,
  Shield,
  TestTube2,
  Search,
  Gauge,
  Brain,
  DollarSign,
} from 'lucide-react';
import { useSwarmSubmit, useSwarmStatus, useSwarmHistory } from '@/lib/hooks/use-swarm';
import type { SwarmAgentRole, SwarmAgentResult, SwarmRunStatus, SwarmRun } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_ROLES: { value: SwarmAgentRole; label: string; icon: typeof Code2; desc: string }[] = [
  { value: 'CODE_ARCHAEOLOGIST', label: 'Archaeologist', icon: Search, desc: 'Explores codebase context' },
  { value: 'PATCH_DRAFTER', label: 'Drafter', icon: Code2, desc: 'Writes the code patch' },
  { value: 'TEST_WRITER', label: 'Tester', icon: TestTube2, desc: 'Generates test cases' },
  { value: 'RISK_REVIEWER', label: 'Risk', icon: Shield, desc: 'Reviews for security/risk' },
  { value: 'PERFORMANCE_REVIEWER', label: 'Perf', icon: Gauge, desc: 'Checks performance impact' },
];

const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: 'pending', label: 'Queue' },
  { key: 'running', label: 'Fan-out' },
  { key: 'collecting', label: 'Collect' },
  { key: 'harmonizing', label: 'Harmonize' },
  { key: 'integrating', label: 'Integrate' },
  { key: 'complete', label: 'Done' },
];

const STAGE_ORDER: Record<string, number> = {};
PIPELINE_STAGES.forEach((s, i) => { STAGE_ORDER[s.key] = i; });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: SwarmRunStatus): string {
  switch (status) {
    case 'complete': return 'text-[#22c55e]';
    case 'failed': return 'text-red-400';
    case 'running': case 'collecting': case 'harmonizing': case 'integrating': return 'text-[#3b82f6]';
    default: return 'text-[#6b6b75]';
  }
}

function roleIcon(role: string) {
  const r = AGENT_ROLES.find((ar) => ar.value === role);
  if (r) {
    const Icon = r.icon;
    return <Icon className="w-3.5 h-3.5" />;
  }
  return <Brain className="w-3.5 h-3.5" />;
}

// ---------------------------------------------------------------------------
// TaskInput — submit a task to the swarm
// ---------------------------------------------------------------------------

function TaskInput({ onSubmit, disabled }: { onSubmit: (task: string, roles?: SwarmAgentRole[]) => void; disabled: boolean }) {
  const [task, setTask] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<SwarmAgentRole[]>([]);
  const [showRoles, setShowRoles] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!task.trim()) return;
    onSubmit(task.trim(), selectedRoles.length > 0 ? selectedRoles : undefined);
    setTask('');
  }, [task, selectedRoles, onSubmit]);

  const toggleRole = useCallback((role: SwarmAgentRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }, []);

  return (
    <div className="p-3 border-b border-[#2a2a35]">
      <div className="flex gap-2">
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Describe your task... (e.g., 'Fix the race condition in session_historian.py')"
          className="flex-1 bg-[#12121a] border border-[#2a2a35] rounded px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#6b6b75] resize-none focus:outline-none focus:border-[#22c55e]/50 min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !task.trim()}
          className="self-end px-4 py-2 rounded bg-[#22c55e] text-[#0a0a0f] text-sm font-medium hover:bg-[#22c55e]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {disabled ? 'Running...' : 'Submit'}
        </button>
      </div>

      {/* Role selector toggle */}
      <button
        onClick={() => setShowRoles(!showRoles)}
        className="mt-2 text-xs text-[#6b6b75] hover:text-[#e5e5e5] flex items-center gap-1 transition-colors"
      >
        {showRoles ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {selectedRoles.length > 0 ? `${selectedRoles.length} roles selected` : 'Select agent roles (optional)'}
      </button>

      {showRoles && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {AGENT_ROLES.map((role) => {
            const isSelected = selectedRoles.includes(role.value);
            return (
              <button
                key={role.value}
                onClick={() => toggleRole(role.value)}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors border ${
                  isSelected
                    ? 'border-[#22c55e]/50 bg-[#22c55e]/10 text-[#22c55e]'
                    : 'border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:border-[#3a3a45]'
                }`}
                title={role.desc}
              >
                <role.icon className="w-3 h-3" />
                {role.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-1.5 text-[10px] text-[#6b6b75]">
        {'\u2318'}+Enter to submit &bull; Agents: DeepSeek ($0.28/1M) &bull; Integrator: local Qwen3
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineProgress — visual pipeline stages
// ---------------------------------------------------------------------------

function PipelineProgress({ status }: { status: SwarmRunStatus }) {
  const currentIdx = STAGE_ORDER[status] ?? 0;

  return (
    <div className="flex items-center gap-0.5 px-3 py-2">
      {PIPELINE_STAGES.map((stage, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isFailed = status === 'failed' && isCurrent;

        return (
          <div key={stage.key} className="flex items-center gap-0.5 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`h-1 w-full rounded-full transition-colors ${
                  isDone ? 'bg-[#22c55e]' :
                  isCurrent && !isFailed ? 'bg-[#3b82f6] animate-pulse' :
                  isFailed ? 'bg-red-400' :
                  'bg-[#2a2a35]'
                }`}
              />
              <span className={`text-[9px] mt-0.5 ${
                isCurrent ? 'text-[#e5e5e5] font-medium' : isDone ? 'text-[#22c55e]' : 'text-[#6b6b75]'
              }`}>
                {stage.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentCard — individual agent result
// ---------------------------------------------------------------------------

function AgentCard({ agentId, result }: { agentId: string; result: SwarmAgentResult }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!result.error;

  return (
    <div className={`border rounded px-3 py-2 ${hasError ? 'border-red-400/30' : 'border-[#2a2a35]'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className={hasError ? 'text-red-400' : 'text-[#22c55e]'}>
          {roleIcon(result.role)}
        </span>
        <span className="text-xs text-[#e5e5e5] font-medium flex-1 truncate">
          {AGENT_ROLES.find((r) => r.value === result.role)?.label ?? result.role}
        </span>
        <span className="text-[10px] text-[#6b6b75]">
          {result.tokens_used > 0 && `${(result.tokens_used / 1000).toFixed(1)}k tok`}
        </span>
        {hasError ? (
          <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0" />
        )}
        {expanded ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />}
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-[#2a2a35]">
          {hasError ? (
            <pre className="text-xs text-red-400 whitespace-pre-wrap break-words">{result.error}</pre>
          ) : (
            <pre className="text-xs text-[#a0a0ab] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto">{result.output}</pre>
          )}
          <div className="mt-1 flex gap-3 text-[10px] text-[#6b6b75]">
            <span>{result.elapsed_s.toFixed(1)}s</span>
            {result.cost_usd > 0 && <span>${result.cost_usd.toFixed(4)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActiveRun — visualization of a running/completed swarm
// ---------------------------------------------------------------------------

function ActiveRun({ run }: { run: SwarmRun }) {
  const [resultExpanded, setResultExpanded] = useState(true);
  const agents = Object.entries(run.agent_results);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Pipeline progress */}
      <PipelineProgress status={run.status} />

      {/* Task description */}
      <div className="px-3 py-2 border-b border-[#2a2a35]">
        <div className="text-[10px] text-[#6b6b75] uppercase tracking-wider mb-0.5">Task</div>
        <div className="text-sm text-[#e5e5e5]">{run.task}</div>
      </div>

      {/* Agent results */}
      {agents.length > 0 && (
        <div className="px-3 py-2 border-b border-[#2a2a35]">
          <div className="text-[10px] text-[#6b6b75] uppercase tracking-wider mb-2">
            Agents ({agents.filter(([, r]) => !r.error).length}/{agents.length} succeeded)
          </div>
          <div className="flex flex-col gap-1.5">
            {agents.map(([id, result]) => (
              <AgentCard key={id} agentId={id} result={result} />
            ))}
          </div>
        </div>
      )}

      {/* Integrated result */}
      {run.integrated_result && (
        <div className="px-3 py-2 border-b border-[#2a2a35]">
          <button
            onClick={() => setResultExpanded(!resultExpanded)}
            className="w-full flex items-center gap-2 text-left mb-1"
          >
            <Zap className="w-3.5 h-3.5 text-[#22c55e]" />
            <span className="text-[10px] text-[#6b6b75] uppercase tracking-wider flex-1">Integrated Result</span>
            {resultExpanded ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />}
          </button>
          {resultExpanded && (
            <pre className="text-xs text-[#a0a0ab] whitespace-pre-wrap break-words bg-[#12121a] rounded p-3 max-h-[300px] overflow-y-auto border border-[#2a2a35]">
              {run.integrated_result}
            </pre>
          )}
        </div>
      )}

      {/* Cost & timing footer */}
      <div className="px-3 py-2 flex items-center gap-4 text-[10px] text-[#6b6b75]">
        <span className={statusColor(run.status)}>
          {run.status === 'complete' && <CheckCircle2 className="w-3 h-3 inline mr-0.5" />}
          {run.status === 'failed' && <XCircle className="w-3 h-3 inline mr-0.5" />}
          {run.status}
        </span>
        {run.cost_estimate.total_usd > 0 && (
          <span className="flex items-center gap-0.5">
            <DollarSign className="w-3 h-3" />
            ${run.cost_estimate.total_usd.toFixed(4)}
          </span>
        )}
        {run.completed_at && (
          <span>{(run.completed_at - run.created_at).toFixed(1)}s elapsed</span>
        )}
        <span>
          {run.cost_estimate.input_tokens + run.cost_estimate.output_tokens > 0 &&
            `${((run.cost_estimate.input_tokens + run.cost_estimate.output_tokens) / 1000).toFixed(1)}k tokens`}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryRow — expandable row for a past swarm run
// ---------------------------------------------------------------------------

function HistoryRow({ run, onRerun }: { run: SwarmRun; onRerun: (task: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[#2a2a35] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1a24] transition-colors"
      >
        <span className={statusColor(run.status)}>
          {run.status === 'complete' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
           run.status === 'failed' ? <XCircle className="w-3.5 h-3.5" /> :
           <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        </span>
        <span className="text-xs text-[#e5e5e5] flex-1 truncate">{run.task}</span>
        <span className="text-[10px] text-[#6b6b75]">
          {run.cost_estimate.total_usd > 0 && `$${run.cost_estimate.total_usd.toFixed(4)}`}
        </span>
        {expanded ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2">
          {run.integrated_result && (
            <pre className="text-xs text-[#a0a0ab] whitespace-pre-wrap break-words bg-[#12121a] rounded p-2 max-h-[150px] overflow-y-auto border border-[#2a2a35] mb-2">
              {run.integrated_result.slice(0, 500)}
              {run.integrated_result.length > 500 && '...'}
            </pre>
          )}
          <button
            onClick={() => onRerun(run.task)}
            className="text-xs text-[#3b82f6] hover:text-[#3b82f6]/80 flex items-center gap-1 transition-colors"
          >
            <RotateCw className="w-3 h-3" /> Re-run
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — shown when no run is active
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-full bg-[#22c55e]/10 flex items-center justify-center mb-3">
        <Zap className="w-6 h-6 text-[#22c55e]" />
      </div>
      <h3 className="text-sm font-medium text-[#e5e5e5] mb-1">Agent Swarm</h3>
      <p className="text-xs text-[#6b6b75] max-w-[240px]">
        Submit a coding task to orchestrate multiple DeepSeek agents working in parallel. Results are synthesized by your local Qwen3 integrator.
      </p>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-[#6b6b75]">
        <span className="flex items-center gap-1"><Search className="w-3 h-3" /> Archaeologist</span>
        <span className="flex items-center gap-1"><Code2 className="w-3 h-3" /> Drafter</span>
        <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> Risk</span>
        <span className="flex items-center gap-1"><TestTube2 className="w-3 h-3" /> Tester</span>
        <span className="flex items-center gap-1"><Gauge className="w-3 h-3" /> Perf</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SwarmView — main export
// ---------------------------------------------------------------------------

export function SwarmView() {
  const { submit, submitting, error: submitError, lastResponse } = useSwarmSubmit();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const { run: activeRun, isTerminal } = useSwarmStatus(activeRunId);
  const { runs: history, refresh: refreshHistory } = useSwarmHistory();
  const [showHistory, setShowHistory] = useState(false);

  const handleSubmit = useCallback(
    async (task: string, roles?: SwarmAgentRole[]) => {
      const res = await submit({ task, roles });
      if (res) {
        setActiveRunId(res.run_id);
        setShowHistory(false);
      }
    },
    [submit],
  );

  const handleRerun = useCallback(
    (task: string) => {
      handleSubmit(task);
    },
    [handleSubmit],
  );

  // When a run completes, refresh history
  useMemo(() => {
    if (isTerminal) refreshHistory();
  }, [isTerminal, refreshHistory]);

  return (
    <div className="flex flex-col h-full bg-[#0f0f17]">
      {/* Task input */}
      <TaskInput onSubmit={handleSubmit} disabled={submitting || (!!activeRunId && !isTerminal)} />

      {/* Error banner */}
      {submitError && (
        <div className="px-3 py-2 bg-red-400/10 border-b border-red-400/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400">{submitError}</span>
        </div>
      )}

      {/* Active run OR empty state */}
      {activeRun ? (
        <ActiveRun run={activeRun} />
      ) : (
        <EmptyState />
      )}

      {/* History section */}
      <div className="border-t border-[#2a2a35]">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1a24] transition-colors"
        >
          {showHistory ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />}
          <span className="text-[10px] text-[#6b6b75] uppercase tracking-wider flex-1">
            History ({history.length})
          </span>
        </button>

        {showHistory && (
          <div className="max-h-[200px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[#6b6b75] text-center">No previous runs</div>
            ) : (
              history.map((run) => (
                <HistoryRow key={run.run_id} run={run} onRerun={handleRerun} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
