'use client';

// =============================================================================
// Harmonizer View — 7-gate code quality checker
// Paste code → run all gates → see ACCEPT/REVIEW/REJECT verdict
// =============================================================================

import { useState, useCallback } from 'react';
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Code2,
  Paintbrush,
  Shield,
  Brain,
  Package,
  TestTube2,
  Building2,
} from 'lucide-react';
import { useHarmonizerCheck } from '@/lib/hooks/use-harmonizer';
import type { GateResult, GateVerdict, OverallVerdict, HarmonizerCategory } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Gate display config
// ---------------------------------------------------------------------------

const GATE_CONFIG: Record<HarmonizerCategory, { label: string; icon: typeof Code2; desc: string }> = {
  syntax_valid: { label: 'Syntax', icon: Code2, desc: 'Parses without errors' },
  style_consistent: { label: 'Style', icon: Paintbrush, desc: 'Naming & import conventions' },
  security_safe: { label: 'Security', icon: Shield, desc: 'No security anti-patterns' },
  logic_sound: { label: 'Logic', icon: Brain, desc: 'Sound logical structure' },
  dependency_safe: { label: 'Dependencies', icon: Package, desc: 'All imports resolved' },
  test_aligned: { label: 'Tests', icon: TestTube2, desc: 'Test-compatible code' },
  architecture_aligned: { label: 'Architecture', icon: Building2, desc: 'Follows project patterns' },
};

const LANGUAGES = ['python', 'typescript', 'javascript', 'go', 'rust', 'java'];

function verdictIcon(verdict: GateVerdict) {
  switch (verdict) {
    case 'pass': return <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />;
    case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case 'fail': return <XCircle className="w-4 h-4 text-red-400" />;
  }
}

function overallVerdictDisplay(verdict: OverallVerdict) {
  switch (verdict) {
    case 'accept':
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#22c55e]/10 rounded border border-[#22c55e]/20">
          <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />
          <span className="text-sm font-medium text-[#22c55e]">ACCEPT</span>
          <span className="text-xs text-[#22c55e]/70">All gates passed</span>
        </div>
      );
    case 'review':
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-400/10 rounded border border-amber-400/20">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span className="text-sm font-medium text-amber-400">REVIEW</span>
          <span className="text-xs text-amber-400/70">Warnings found — manual review recommended</span>
        </div>
      );
    case 'reject':
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-400/10 rounded border border-red-400/20">
          <XCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium text-red-400">REJECT</span>
          <span className="text-xs text-red-400/70">Critical failures detected</span>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// GateRow — expandable gate result
// ---------------------------------------------------------------------------

function GateRow({ gate }: { gate: GateResult }) {
  const [expanded, setExpanded] = useState(false);
  const config = GATE_CONFIG[gate.category];
  const Icon = config?.icon ?? Code2;

  return (
    <div className="border-b border-[#2a2a35] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1a1a24] transition-colors"
      >
        {verdictIcon(gate.verdict)}
        <Icon className="w-3.5 h-3.5 text-[#6b6b75]" />
        <span className="text-xs text-[#e5e5e5] flex-1">{config?.label ?? gate.category}</span>
        <span className="text-[10px] text-[#6b6b75]">{(gate.confidence * 100).toFixed(0)}%</span>
        {expanded ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" /> : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />}
      </button>

      {expanded && (
        <div className="px-3 pb-2 pl-9">
          <p className="text-xs text-[#a0a0ab] whitespace-pre-wrap">{gate.explanation}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HarmonizerView — main export
// ---------------------------------------------------------------------------

export function HarmonizerView() {
  const { check, clear, result, loading, error } = useHarmonizerCheck();
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');

  const handleCheck = useCallback(() => {
    if (code.trim()) check(code, language);
  }, [code, language, check]);

  const handleClear = useCallback(() => {
    setCode('');
    clear();
  }, [clear]);

  // Sort gates: fails first, then warns, then passes
  const sortedGates = result?.gate_results
    ? [...result.gate_results].sort((a, b) => {
        const order: Record<GateVerdict, number> = { fail: 0, warn: 1, pass: 2 };
        return (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3);
      })
    : [];

  return (
    <div className="flex flex-col h-full bg-[#0f0f17]">
      {/* Input area */}
      <div className="p-3 border-b border-[#2a2a35]">
        <div className="flex items-center gap-2 mb-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-[#12121a] border border-[#2a2a35] rounded px-2 py-1 text-xs text-[#e5e5e5] focus:outline-none focus:border-[#22c55e]/50"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            onClick={handleClear}
            disabled={!code && !result}
            className="px-2 py-1 text-xs text-[#6b6b75] hover:text-[#e5e5e5] disabled:opacity-30 flex items-center gap-1 transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>

          <button
            onClick={handleCheck}
            disabled={loading || !code.trim()}
            className="px-3 py-1 rounded bg-[#3b82f6] text-white text-xs font-medium hover:bg-[#3b82f6]/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Check
          </button>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste code here to run through 7 quality gates..."
          className="w-full bg-[#12121a] border border-[#2a2a35] rounded px-3 py-2 text-xs text-[#e5e5e5] font-mono placeholder-[#6b6b75] resize-none focus:outline-none focus:border-[#3b82f6]/50 min-h-[120px]"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-400/10 border-b border-red-400/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400">{error}</span>
        </div>
      )}

      {/* Results */}
      {result ? (
        <div className="flex-1 overflow-y-auto">
          {/* Overall verdict */}
          <div className="p-3 border-b border-[#2a2a35]">
            {overallVerdictDisplay(result.overall_verdict)}
            {result.summary && (
              <p className="mt-2 text-xs text-[#a0a0ab]">{result.summary}</p>
            )}
          </div>

          {/* Gate results */}
          <div>
            <div className="px-3 py-1.5 text-[10px] text-[#6b6b75] uppercase tracking-wider">
              7 Gates ({sortedGates.filter((g) => g.verdict === 'pass').length} pass, {sortedGates.filter((g) => g.verdict === 'warn').length} warn, {sortedGates.filter((g) => g.verdict === 'fail').length} fail)
            </div>
            {sortedGates.map((gate) => (
              <GateRow key={gate.category} gate={gate} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
          <div className="w-12 h-12 rounded-full bg-[#3b82f6]/10 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-[#3b82f6]" />
          </div>
          <h3 className="text-sm font-medium text-[#e5e5e5] mb-1">Code Harmonizer</h3>
          <p className="text-xs text-[#6b6b75] max-w-[240px]">
            Paste code and run it through 7 quality gates: syntax, style, security, logic, dependencies, tests, and architecture alignment.
          </p>
        </div>
      )}
    </div>
  );
}
