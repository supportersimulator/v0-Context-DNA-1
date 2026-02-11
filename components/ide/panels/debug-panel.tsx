'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Bug,
  Play,
  Pause,
  StepForward,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Square,
  Variable,
  Layers,
  Circle,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Breakpoint {
  id: string;
  file: string;
  line: number;
  enabled: boolean;
  condition?: string;
  hitCount: number;
}

interface StackFrame {
  id: string;
  name: string;
  file: string;
  line: number;
  column: number;
  isActive: boolean;
}

interface WatchVariable {
  name: string;
  value: string;
  type: string;
  children?: WatchVariable[];
}

type DebugState = 'stopped' | 'running' | 'paused' | 'stepping';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockBreakpoints(): Breakpoint[] {
  return [
    { id: 'bp-1', file: 'context-dna/injection/builder.py', line: 142, enabled: true, hitCount: 3 },
    { id: 'bp-2', file: 'context-dna/injection/builder.py', line: 198, enabled: true, hitCount: 1 },
    { id: 'bp-3', file: 'memory/professor.py', line: 67, enabled: false, hitCount: 0 },
    { id: 'bp-4', file: 'context-dna/agent_service.py', line: 312, enabled: true, condition: 'section_id == 8', hitCount: 7 },
  ];
}

function getMockCallStack(): StackFrame[] {
  return [
    { id: 'sf-1', name: 'build_section_8', file: 'injection/builder.py', line: 142, column: 5, isActive: true },
    { id: 'sf-2', name: 'inject_8th_intelligence', file: 'injection/sections.py', line: 89, column: 12, isActive: false },
    { id: 'sf-3', name: 'process_webhook', file: 'agent_service.py', line: 312, column: 3, isActive: false },
    { id: 'sf-4', name: 'handle_request', file: 'agent_service.py', line: 45, column: 1, isActive: false },
  ];
}

function getMockVariables(): WatchVariable[] {
  return [
    { name: 'section_id', value: '8', type: 'int' },
    { name: 'payload', value: '{"source": "llm_realtime", ...}', type: 'dict' },
    { name: 'freshness', value: '0.92', type: 'float' },
    { name: 'user_sentiment', value: '"focused"', type: 'str' },
    { name: 'injection_ms', value: '47', type: 'int' },
  ];
}

function getMockConsoleLines(): string[] {
  return [
    '[DEBUG] Section 0: SAFETY — 2 hard constraints loaded',
    '[DEBUG] Section 1: FOUNDATION — 4 SOPs, 12 chain patterns',
    '[DEBUG] Section 2: WISDOM — Qwen3 reasoning (0.6T, 700tok)',
    '[INFO]  Section 8: 8TH_INTELLIGENCE — llm_realtime (freshness=0.92)',
    '[DEBUG] Injection complete: 47ms, 9 sections, payload_hash=a3f2c1',
  ];
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
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
// DebugPanel — main export
// ---------------------------------------------------------------------------
export function DebugPanel() {
  const [debugState, setDebugState] = useState<DebugState>('stopped');
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [callStack, setCallStack] = useState<StackFrame[]>([]);
  const [variables, setVariables] = useState<WatchVariable[]>([]);
  const [consoleLines, setConsoleLines] = useState<string[]>([]);

  // Load mock data
  useEffect(() => {
    setBreakpoints(getMockBreakpoints());
    setCallStack(getMockCallStack());
    setVariables(getMockVariables());
    setConsoleLines(getMockConsoleLines());
  }, []);

  // Fetch from backend (future: wire to Context DNA debug API)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8029/api/debug/state', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.breakpoints) setBreakpoints(data.breakpoints);
        if (data.callStack) setCallStack(data.callStack);
        if (data.variables) setVariables(data.variables);
        if (data.console) setConsoleLines(data.console);
        if (data.state) setDebugState(data.state);
      }
    } catch {
      // Keep mock data
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleBreakpoint = useCallback((id: string) => {
    setBreakpoints((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, enabled: !bp.enabled } : bp)),
    );
  }, []);

  const removeBreakpoint = useCallback((id: string) => {
    setBreakpoints((prev) => prev.filter((bp) => bp.id !== id));
  }, []);

  const activeCount = useMemo(
    () => breakpoints.filter((bp) => bp.enabled).length,
    [breakpoints],
  );

  const stateColor = debugState === 'paused' ? 'text-[#e5c07b]' : debugState === 'running' ? 'text-[#22c55e]' : 'text-[#6b6b75]';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Bug className="w-3.5 h-3.5 text-[#ef4444]" />
        <span className="text-xs font-medium text-[#e5e5e5] mr-2">Debug</span>

        <span className={`text-[10px] ${stateColor} mr-auto`}>
          {debugState === 'stopped' && 'Not attached'}
          {debugState === 'running' && 'Running'}
          {debugState === 'paused' && 'Paused'}
          {debugState === 'stepping' && 'Stepping...'}
        </span>

        {/* Debug controls */}
        <button
          onClick={() => setDebugState((s) => (s === 'running' ? 'paused' : 'running'))}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#22c55e]"
          title={debugState === 'running' ? 'Pause' : 'Continue'}
        >
          {debugState === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Step Over">
          <StepForward className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Step Into">
          <ArrowDownToLine className="w-3.5 h-3.5" />
        </button>
        <button className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Step Out">
          <ArrowUpFromLine className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { setDebugState('stopped'); refresh(); }}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#ef4444]"
          title="Stop"
        >
          <Square className="w-3 h-3" />
        </button>
        <button onClick={refresh} className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Refresh">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Variables */}
        <Section title="Variables" count={variables.length}>
          {variables.map((v) => (
            <div key={v.name} className="flex items-center gap-2 px-4 py-0.5 text-[11px] hover:bg-[#1a1a24]/50">
              <Variable className="w-3 h-3 text-[#3b82f6] flex-shrink-0" />
              <span className="text-[#c678dd] font-mono">{v.name}</span>
              <span className="text-[#6b6b75]">=</span>
              <span className="text-[#e5c07b] font-mono truncate">{v.value}</span>
              <span className="text-[9px] text-[#6b6b75] ml-auto flex-shrink-0">{v.type}</span>
            </div>
          ))}
          {variables.length === 0 && (
            <div className="px-4 py-2 text-[10px] text-[#6b6b75] italic">No variables in scope</div>
          )}
        </Section>

        {/* Call Stack */}
        <Section title="Call Stack" count={callStack.length}>
          {callStack.map((frame) => (
            <button
              key={frame.id}
              className={`flex items-center gap-2 w-full text-left px-4 py-0.5 text-[11px] hover:bg-[#1a1a24]/50 ${
                frame.isActive ? 'bg-[#22c55e]/5' : ''
              }`}
            >
              <Layers className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
              <span className={`font-mono ${frame.isActive ? 'text-[#22c55e]' : 'text-[#e5e5e5]'}`}>
                {frame.name}
              </span>
              <span className="text-[9px] text-[#6b6b75] ml-auto truncate">
                {frame.file}:{frame.line}
              </span>
            </button>
          ))}
        </Section>

        {/* Breakpoints */}
        <Section title="Breakpoints" count={activeCount}>
          {breakpoints.map((bp) => (
            <div key={bp.id} className="flex items-center gap-1.5 px-4 py-0.5 text-[11px] hover:bg-[#1a1a24]/50 group">
              <button onClick={() => toggleBreakpoint(bp.id)} className="flex-shrink-0">
                {bp.enabled ? (
                  <CircleDot className="w-3 h-3 text-[#ef4444]" />
                ) : (
                  <Circle className="w-3 h-3 text-[#6b6b75]" />
                )}
              </button>
              <span className={`font-mono truncate flex-1 ${bp.enabled ? 'text-[#e5e5e5]' : 'text-[#6b6b75]'}`}>
                {bp.file}:{bp.line}
              </span>
              {bp.condition && (
                <span className="text-[9px] text-[#c678dd] flex-shrink-0">{bp.condition}</span>
              )}
              {bp.hitCount > 0 && (
                <span className="text-[9px] text-[#6b6b75] flex-shrink-0">×{bp.hitCount}</span>
              )}
              <button
                onClick={() => removeBreakpoint(bp.id)}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0"
              >
                <X className="w-3 h-3 text-[#6b6b75] hover:text-[#ef4444]" />
              </button>
            </div>
          ))}
          {breakpoints.length === 0 && (
            <div className="px-4 py-2 text-[10px] text-[#6b6b75] italic">No breakpoints set</div>
          )}
        </Section>

        {/* Debug Console */}
        <Section title="Debug Console" count={consoleLines.length} defaultOpen>
          <div className="px-2 py-1 font-mono text-[10px] space-y-0.5">
            {consoleLines.map((line, i) => {
              const isError = line.includes('[ERROR]');
              const isWarn = line.includes('[WARN]');
              const isInfo = line.includes('[INFO]');
              return (
                <div
                  key={i}
                  className={`px-2 py-0.5 rounded ${
                    isError ? 'text-[#ef4444] bg-[#ef4444]/5' :
                    isWarn ? 'text-[#e5c07b]' :
                    isInfo ? 'text-[#3b82f6]' :
                    'text-[#6b6b75]'
                  }`}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}
