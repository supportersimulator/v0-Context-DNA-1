'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronDown,
  FileText,
  Filter,
  RefreshCw,
  CircleX,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Severity = 'error' | 'warning' | 'info';

interface Diagnostic {
  severity: Severity;
  message: string;
  source: string;
  file: string;
  line: number;
  column: number;
  code?: string;
}

interface FileGroup {
  path: string;
  diagnostics: Diagnostic[];
  expanded: boolean;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------
function severityIcon(severity: Severity) {
  switch (severity) {
    case 'error':
      return <CircleX className="w-3.5 h-3.5 text-[#ef4444] flex-shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-3.5 h-3.5 text-[#e5c07b] flex-shrink-0" />;
    case 'info':
      return <Info className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0" />;
  }
}

function severityColor(severity: Severity): string {
  switch (severity) {
    case 'error': return 'text-[#ef4444]';
    case 'warning': return 'text-[#e5c07b]';
    case 'info': return 'text-[#3b82f6]';
  }
}

// ---------------------------------------------------------------------------
// ProblemsPanel — main export
// ---------------------------------------------------------------------------
export function ProblemsPanel() {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [filter, setFilter] = useState<Severity | 'all'>('all');
  const [groups, setGroups] = useState<FileGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch diagnostics from backend
  const fetchDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:3456/api/diagnostics', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiagnostics(data.diagnostics ?? []);
    } catch {
      // Fallback to mock data
      setDiagnostics(getMockDiagnostics());
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for diagnostics
  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 30_000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  // Filter + group diagnostics by file
  useEffect(() => {
    const filtered = filter === 'all'
      ? diagnostics
      : diagnostics.filter((d) => d.severity === filter);

    const groupMap = new Map<string, Diagnostic[]>();
    for (const d of filtered) {
      const existing = groupMap.get(d.file) ?? [];
      existing.push(d);
      groupMap.set(d.file, existing);
    }

    setGroups(
      Array.from(groupMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, diags]) => ({
          path,
          diagnostics: diags.sort((a, b) => a.line - b.line),
          expanded: true,
        })),
    );
  }, [diagnostics, filter]);

  // Counts by severity
  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const d of diagnostics) {
      c[d.severity]++;
    }
    return c;
  }, [diagnostics]);

  // Toggle file group
  const toggleGroup = useCallback((path: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.path === path ? { ...g, expanded: !g.expanded } : g,
      ),
    );
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <AlertCircle className="w-3.5 h-3.5 text-[#ef4444]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Problems</span>

        <div className="flex-1" />

        {/* Severity filter pills */}
        <div className="flex items-center gap-1">
          <FilterPill
            label="All"
            count={diagnostics.length}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterPill
            label="E"
            count={counts.error}
            active={filter === 'error'}
            onClick={() => setFilter('error')}
            variant="error"
          />
          <FilterPill
            label="W"
            count={counts.warning}
            active={filter === 'warning'}
            onClick={() => setFilter('warning')}
            variant="warning"
          />
          <FilterPill
            label="I"
            count={counts.info}
            active={filter === 'info'}
            onClick={() => setFilter('info')}
            variant="info"
          />
        </div>

        <button
          onClick={fetchDiagnostics}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-[#2a2a35]/50 flex-shrink-0">
        <span className="flex items-center gap-1 text-[10px]">
          <CircleX className="w-3 h-3 text-[#ef4444]" />
          <span className="text-[#ef4444]">{counts.error}</span>
        </span>
        <span className="flex items-center gap-1 text-[10px]">
          <AlertTriangle className="w-3 h-3 text-[#e5c07b]" />
          <span className="text-[#e5c07b]">{counts.warning}</span>
        </span>
        <span className="flex items-center gap-1 text-[10px]">
          <Info className="w-3 h-3 text-[#3b82f6]" />
          <span className="text-[#3b82f6]">{counts.info}</span>
        </span>
      </div>

      {/* Diagnostics list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
            <AlertCircle className="w-8 h-8 opacity-50" />
            <span className="text-sm">No problems detected</span>
            <span className="text-xs">Your workspace is clean</span>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.path}>
            {/* File header */}
            <button
              onClick={() => toggleGroup(group.path)}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 hover:bg-[#1a1a24] text-xs"
            >
              {group.expanded ? (
                <ChevronDown className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
              )}
              <FileText className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
              <span className="text-[#e5e5e5] truncate flex-1">{group.path}</span>
              <span className="text-[10px] text-[#6b6b75] bg-[#1a1a24] px-1.5 rounded-full flex-shrink-0">
                {group.diagnostics.length}
              </span>
            </button>

            {/* Diagnostic items */}
            {group.expanded && group.diagnostics.map((diag, idx) => (
              <button
                key={`${group.path}-${idx}`}
                className="flex items-start gap-2 w-full text-left pl-7 pr-2 py-1 hover:bg-[#1a1a24]/50 text-[11px] group"
                title={`${diag.file}:${diag.line}:${diag.column}`}
              >
                {severityIcon(diag.severity)}
                <span className={`flex-1 ${severityColor(diag.severity)}`}>
                  {diag.message}
                </span>
                {diag.code && (
                  <span className="text-[10px] text-[#6b6b75] flex-shrink-0">
                    {diag.source}({diag.code})
                  </span>
                )}
                <span className="text-[10px] text-[#6b6b75] font-mono flex-shrink-0 opacity-0 group-hover:opacity-100">
                  [{diag.line}:{diag.column}]
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterPill
// ---------------------------------------------------------------------------
function FilterPill({
  label,
  count,
  active,
  onClick,
  variant,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  variant?: 'error' | 'warning' | 'info';
}) {
  const colorMap = {
    error: 'text-[#ef4444]',
    warning: 'text-[#e5c07b]',
    info: 'text-[#3b82f6]',
  };
  const activeColorMap = {
    error: 'bg-[#ef4444]/20 text-[#ef4444]',
    warning: 'bg-[#e5c07b]/20 text-[#e5c07b]',
    info: 'bg-[#3b82f6]/20 text-[#3b82f6]',
  };

  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
        active
          ? variant ? activeColorMap[variant] : 'bg-[#22c55e]/20 text-[#22c55e]'
          : variant ? colorMap[variant] : 'text-[#6b6b75] hover:text-[#e5e5e5]'
      }`}
    >
      {label}{count > 0 ? ` ${count}` : ''}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Mock diagnostics
// ---------------------------------------------------------------------------
function getMockDiagnostics(): Diagnostic[] {
  return [
    {
      severity: 'error',
      message: "Type 'string' is not assignable to type 'number'.",
      source: 'ts',
      file: 'src/lib/api/swarm.ts',
      line: 45,
      column: 12,
      code: '2322',
    },
    {
      severity: 'error',
      message: "Cannot find module '@/lib/missing-module'.",
      source: 'ts',
      file: 'src/components/panels/swarm-view.tsx',
      line: 3,
      column: 1,
      code: '2307',
    },
    {
      severity: 'warning',
      message: "'unusedVar' is declared but its value is never read.",
      source: 'ts',
      file: 'src/lib/api/swarm.ts',
      line: 12,
      column: 7,
      code: '6133',
    },
    {
      severity: 'warning',
      message: "Unexpected any. Specify a different type.",
      source: 'eslint',
      file: 'src/lib/hooks/use-swarm.ts',
      line: 34,
      column: 18,
      code: '@typescript-eslint/no-explicit-any',
    },
    {
      severity: 'info',
      message: 'This function could be simplified using optional chaining.',
      source: 'eslint',
      file: 'src/lib/hooks/use-mode.ts',
      line: 22,
      column: 5,
      code: 'prefer-optional-chain',
    },
    {
      severity: 'warning',
      message: "Missing return type on function.",
      source: 'ts',
      file: 'src/components/dashboard/DashboardShell.tsx',
      line: 67,
      column: 1,
      code: '7010',
    },
    {
      severity: 'info',
      message: 'Consider using a more specific type instead of object.',
      source: 'eslint',
      file: 'src/components/dashboard/DashboardShell.tsx',
      line: 15,
      column: 23,
      code: '@typescript-eslint/ban-types',
    },
  ];
}
