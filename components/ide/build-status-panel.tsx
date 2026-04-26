'use client';

/**
 * BuildStatusPanel — ER Sim build + git status surface.
 *
 * Polls /api/git/status every 5s for simulator-core/er-sim-monitor and renders
 * branch + ahead/behind chips, file counts (color-coded), last commit. Buttons
 * POST to /api/build/run; while running, shows spinner + elapsed time. On
 * finish, renders exit-code icon + collapsible stdout/stderr.
 *
 * READ-ONLY w.r.t. git. Long-running dev servers go through /api/er-sim/launch.
 */

import { useEffect, useState } from 'react';
import {
  GitBranch, RefreshCw, Hammer, CheckCircle2, XCircle, Clock, ArrowUp,
  ArrowDown, AlertTriangle, TerminalSquare, FlaskConical, Eraser,
} from 'lucide-react';

import { useGitStatus } from '@/lib/hooks/use-git-status';
import { useBuildRun, type BuildTarget, type BuildRunResponse } from '@/lib/hooks/use-build-run';

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';
const TONE: Record<Tone, string> = {
  green: 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10',
  amber: 'text-[#e5c07b] border-[#e5c07b]/30 bg-[#e5c07b]/10',
  red:   'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10',
  gray:  'text-[#a1a1aa] border-[#2a2a35] bg-[#1a1a24]',
  blue:  'text-[#60a5fa] border-[#60a5fa]/30 bg-[#60a5fa]/10',
};

function Chip({ icon, label, value, tone = 'gray' as Tone }:
  { icon?: React.ReactNode; label: string; value: number | string; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono ${TONE[tone]}`} title={label}>
      {icon}<span className="opacity-70">{label}</span><span className="font-semibold">{value}</span>
    </span>
  );
}

function elapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function BuildResultBlock({ result }: { result: BuildRunResponse }) {
  const ok = result.ok && result.exit_code === 0;
  return (
    <div className="border border-[#2a2a35] rounded p-2 mt-2 bg-[#0e0e16]">
      <div className="flex items-center gap-2 text-[11px] text-[#e5e5e5]">
        {ok
          ? <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e]" />
          : <XCircle className="w-3.5 h-3.5 text-[#ef4444]" />}
        <span className="font-medium">{result.target}</span>
        <span className="text-[#6b6b75]">·</span>
        <span className="text-[#a1a1aa]">exit {result.exit_code ?? 'n/a'}</span>
        <span className="text-[#6b6b75]">·</span>
        <span className="text-[#a1a1aa]">{elapsed(result.duration_ms)}</span>
        {result.timed_out && (
          <span className="ml-auto inline-flex items-center gap-1 text-[#f97316] text-[10px]">
            <AlertTriangle className="w-3 h-3" /> timed out
          </span>
        )}
      </div>
      {(result.stdout || result.stderr) && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10px] text-[#6b6b75] hover:text-[#a1a1aa]">
            output (last 2000 chars)
          </summary>
          {result.stdout && (
            <pre className="mt-1 text-[10px] font-mono text-[#cbd5e1] bg-[#070710] border border-[#1a1a24] rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{result.stdout}</pre>
          )}
          {result.stderr && (
            <pre className="mt-1 text-[10px] font-mono text-[#fca5a5] bg-[#070710] border border-[#1a1a24] rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{result.stderr}</pre>
          )}
        </details>
      )}
    </div>
  );
}

function ActionButton({ target, label, icon, disabled, onClick }:
  { target: BuildTarget; label: string; icon: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[11px] text-[#e5e5e5] hover:bg-[#22222e] hover:border-[#3a3a48] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      title={`Run npm ${target === 'test' ? 'test' : `run ${target}`}`}
    >
      {icon}<span>{label}</span>
    </button>
  );
}

export function BuildStatusPanel() {
  const { data, loading, error, refresh } = useGitStatus();
  const { run, status, lastResult, running, inFlight } = useBuildRun();

  // While a build runs, advance `elapsedMs` from a 1Hz interval rather than
  // calling Date.now() inside render (react-hooks/purity). The first tick
  // fires after 1s — for sub-second builds the panel just shows 0ms briefly.
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!running || !status?.started_at) return;
    const startedAt = status.started_at;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => {
      clearInterval(id);
      setElapsedMs(0);
    };
  }, [running, status?.started_at]);

  const handleRun = (target: BuildTarget) => {
    if (running || inFlight) return;
    run(target);
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-[11px]">Loading git status…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2 p-4">
        <AlertTriangle className="w-5 h-5 text-[#f97316]" />
        <span className="text-[11px] text-center">{error}</span>
        <button onClick={refresh} className="text-[11px] text-[#60a5fa] hover:underline">Retry</button>
      </div>
    );
  }

  if (data && data.ok === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2 p-4">
        <AlertTriangle className="w-5 h-5 text-[#f97316]" />
        <span className="text-[11px] text-center">{data.error}</span>
        {data.cwd && <code className="text-[10px] text-[#6b6b75] break-all">{data.cwd}</code>}
        <button onClick={refresh} className="text-[11px] text-[#60a5fa] hover:underline">Retry</button>
      </div>
    );
  }

  if (!data || data.ok !== true) return null;

  const stagedCount = data.staged.length;
  const unstagedCount = data.unstaged.length;
  const untrackedCount = data.untracked.length;
  const clean = stagedCount === 0 && unstagedCount === 0 && untrackedCount === 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-[#e5e5e5]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a35] flex-shrink-0">
        <GitBranch className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium">{data.branch}</span>
        {data.ahead > 0 && <Chip icon={<ArrowUp className="w-3 h-3" />} label="ahead" value={data.ahead} tone="blue" />}
        {data.behind > 0 && <Chip icon={<ArrowDown className="w-3 h-3" />} label="behind" value={data.behind} tone="amber" />}
        <button onClick={refresh} className="ml-auto text-[#6b6b75] hover:text-[#e5e5e5]" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-[#2a2a35] flex-shrink-0">
        <Chip label="staged" value={stagedCount} tone={stagedCount > 0 ? 'green' : 'gray'} />
        <Chip label="unstaged" value={unstagedCount} tone={unstagedCount > 0 ? 'amber' : 'gray'} />
        <Chip label="untracked" value={untrackedCount} tone={untrackedCount > 0 ? 'red' : 'gray'} />
        {clean && <span className="text-[10px] text-[#22c55e] italic px-1">working tree clean</span>}
      </div>

      {data.last_commit && (
        <div className="px-3 py-2 border-b border-[#2a2a35] flex-shrink-0 text-[11px]">
          <div className="flex items-center gap-2 text-[#a1a1aa]">
            <Clock className="w-3 h-3" />
            <span>{data.last_commit.when}</span>
            <span className="text-[#6b6b75]">·</span>
            <span>{data.last_commit.author}</span>
            <code className="ml-auto text-[10px] text-[#6b6b75]">{data.last_commit.hash.slice(0, 7)}</code>
          </div>
          <div className="text-[#e5e5e5] mt-0.5 truncate" title={data.last_commit.subject}>{data.last_commit.subject}</div>
        </div>
      )}

      <div className="px-3 py-2 border-b border-[#2a2a35] flex-shrink-0 flex flex-wrap gap-1.5">
        <ActionButton target="build" label="Run build" icon={<Hammer className="w-3.5 h-3.5" />} disabled={running || inFlight} onClick={() => handleRun('build')} />
        <ActionButton target="test" label="Run tests" icon={<FlaskConical className="w-3.5 h-3.5" />} disabled={running || inFlight} onClick={() => handleRun('test')} />
        <ActionButton target="lint" label="Run lint" icon={<Eraser className="w-3.5 h-3.5" />} disabled={running || inFlight} onClick={() => handleRun('lint')} />
        {(running || inFlight) && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[#60a5fa] ml-auto">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {status?.target ?? 'starting'} · {elapsed(elapsedMs)}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        <div className="text-[10px] text-[#6b6b75] flex items-center gap-1">
          <TerminalSquare className="w-3 h-3" />
          <code className="break-all">{data.cwd}</code>
        </div>
        {lastResult && <BuildResultBlock result={lastResult} />}
      </div>
    </div>
  );
}
