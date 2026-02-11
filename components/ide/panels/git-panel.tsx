'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  Plus,
  Check,
  FileText,
  FilePlus,
  FileX,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'conflict';
  staged: boolean;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
}

// ---------------------------------------------------------------------------
// Status label + color helpers
// ---------------------------------------------------------------------------
function statusLabel(status: GitFileStatus['status']): string {
  switch (status) {
    case 'modified':  return 'M';
    case 'added':     return 'A';
    case 'untracked': return '??';
    case 'deleted':   return 'D';
    case 'renamed':   return 'R';
    case 'conflict':  return '!';
  }
}

function statusColor(status: GitFileStatus['status']): string {
  switch (status) {
    case 'modified':  return 'text-[#e5c07b]';
    case 'added':
    case 'untracked': return 'text-[#22c55e]';
    case 'deleted':   return 'text-[#ef4444]';
    case 'renamed':   return 'text-[#e5c07b]';
    case 'conflict':  return 'text-[#f97316]';
  }
}

function statusIcon(status: GitFileStatus['status']) {
  switch (status) {
    case 'modified':  return <FileText className="w-3.5 h-3.5" />;
    case 'added':
    case 'untracked': return <FilePlus className="w-3.5 h-3.5" />;
    case 'deleted':   return <FileX className="w-3.5 h-3.5" />;
    case 'conflict':  return <AlertCircle className="w-3.5 h-3.5" />;
    case 'renamed':   return <FileText className="w-3.5 h-3.5" />;
  }
}

const API_URL = 'http://127.0.0.1:3456/api/git/status';
const POLL_INTERVAL = 10_000;

// ---------------------------------------------------------------------------
// FileRow
// ---------------------------------------------------------------------------
function FileRow({ file }: { file: GitFileStatus }) {
  return (
    <button
      className="flex items-center gap-2 w-full text-left px-3 py-1 hover:bg-[#1a1a24] transition-colors group"
      title={file.path}
    >
      <span className={`font-mono text-[10px] w-5 text-right flex-shrink-0 ${statusColor(file.status)}`}>
        {statusLabel(file.status)}
      </span>
      <span className={`flex-shrink-0 ${statusColor(file.status)}`}>
        {statusIcon(file.status)}
      </span>
      <span className="text-xs text-[#e5e5e5] truncate flex-1 group-hover:text-white">
        {file.path}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// GitPanel
// ---------------------------------------------------------------------------
export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Fetch git status from Context DNA API
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(API_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GitStatus = await res.json();
      setStatus(data);
      setError(null);
    } catch {
      setStatus(null);
      setError('Git status unavailable \u2014 requires Context DNA backend');
    }
  }, []);

  // Polling
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [refresh]);

  // Partition files
  const staged = status?.files.filter((f) => f.staged) ?? [];
  const unstaged = status?.files.filter((f) => !f.staged) ?? [];

  // Placeholder actions (future: wire to backend)
  const handleCommit = useCallback(() => {
    if (!commitMsg.trim()) return;
    setLoading(true);
    // TODO: POST to /api/git/commit
    setTimeout(() => {
      setLoading(false);
      setCommitMsg('');
      refresh();
    }, 600);
  }, [commitMsg, refresh]);

  const handleStageAll = useCallback(() => {
    // TODO: POST to /api/git/stage-all
    refresh();
  }, [refresh]);

  // ---------- Fallback: API unavailable ----------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2 p-4">
        <GitBranch className="w-8 h-8 opacity-50" />
        <span className="text-center">{error}</span>
        <button onClick={refresh} className="text-xs text-[#22c55e] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  // ---------- Loading ----------
  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-xs">Loading git status...</span>
      </div>
    );
  }

  // ---------- Main UI ----------
  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Branch header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <GitBranch className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">{status.branch}</span>
        {(status.ahead > 0 || status.behind > 0) && (
          <span className="text-[10px] text-[#6b6b75]">
            {status.ahead > 0 && `\u2191${status.ahead}`}
            {status.behind > 0 && `\u2193${status.behind}`}
          </span>
        )}
        <button onClick={refresh} className="ml-auto" title="Refresh">
          <RefreshCw className="w-3 h-3 text-[#6b6b75] hover:text-[#e5e5e5]" />
        </button>
      </div>

      {/* Commit area */}
      <div className="px-3 py-2 border-b border-[#2a2a35] flex-shrink-0 space-y-2">
        <input
          type="text"
          placeholder="Commit message"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
          className="w-full px-2 py-1 text-xs bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#6b6b75] focus:outline-none focus:border-[#22c55e]/50"
        />
        <div className="flex gap-1.5">
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || loading}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#22c55e] text-black text-[10px] font-medium hover:bg-[#22c55e]/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Commit
          </button>
          <button
            onClick={handleStageAll}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#2a2a35] text-[#e5e5e5] text-[10px] hover:bg-[#2a2a35]/80"
          >
            <Plus className="w-3 h-3" />
            Stage All
          </button>
        </div>
      </div>

      {/* File lists */}
      <div className="flex-1 overflow-auto">
        {/* Staged changes */}
        <div className="px-3 py-1 border-b border-[#2a2a35]/50">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b75]">
            Staged ({staged.length})
          </span>
        </div>
        {staged.length > 0 ? (
          staged.map((f) => <FileRow key={`s-${f.path}`} file={f} />)
        ) : (
          <div className="px-3 py-1.5 text-[10px] text-[#6b6b75] italic">No staged changes</div>
        )}

        {/* Unstaged / working changes */}
        <div className="px-3 py-1 border-b border-[#2a2a35]/50 mt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6b6b75]">
            Changes ({unstaged.length})
          </span>
        </div>
        {unstaged.length > 0 ? (
          unstaged.map((f) => <FileRow key={`u-${f.path}`} file={f} />)
        ) : (
          <div className="px-3 py-1.5 text-[10px] text-[#6b6b75] italic">Working tree clean</div>
        )}
      </div>
    </div>
  );
}
