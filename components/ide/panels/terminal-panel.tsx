'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal as TerminalIcon, Plus, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Electron Shell bridge
// ---------------------------------------------------------------------------
function getElectronShell() {
  if (typeof window !== 'undefined' && (window as any).electron?.shell) {
    return (window as any).electron.shell;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Simple terminal with pre-based output (xterm.js can be added later)
//
// This is a lightweight placeholder. For full terminal emulation,
// install @xterm/xterm + @xterm/addon-fit and swap in XTerm rendering.
// ---------------------------------------------------------------------------
interface TermSession {
  id: string;
  buffer: string[];
}

export function TerminalPanel() {
  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const shellRef = useRef(getElectronShell());
  const outputRef = useRef<HTMLPreElement>(null);
  const cleanupRefs = useRef<Map<string, () => void>>(new Map());

  // Create a new terminal session
  const createSession = useCallback(async () => {
    if (!shellRef.current) return;
    try {
      const { id } = await shellRef.current.create();
      if (!id) return;

      const session: TermSession = { id, buffer: [] };
      setSessions((prev) => [...prev, session]);
      setActiveId(id);

      // Listen for data
      const unsubData = shellRef.current.onData(id, (data: string) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, buffer: [...s.buffer, data].slice(-500) } : s
          )
        );
      });

      // Listen for exit
      const unsubExit = shellRef.current.onExit(id, () => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        cleanupRefs.current.get(id)?.();
        cleanupRefs.current.delete(id);
      });

      cleanupRefs.current.set(id, () => {
        unsubData();
        unsubExit();
      });
    } catch { /* ignore */ }
  }, []);

  // Kill a session
  const killSession = useCallback(async (id: string) => {
    if (!shellRef.current) return;
    await shellRef.current.kill(id);
    cleanupRefs.current.get(id)?.();
    cleanupRefs.current.delete(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  // Send input
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!shellRef.current || !activeId || !input) return;
    shellRef.current.write(activeId, input + '\n');
    setInput('');
  }, [activeId, input]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [sessions, activeId]);

  // Create initial session on mount
  useEffect(() => {
    if (shellRef.current && sessions.length === 0) {
      createSession();
    }
  }, [createSession, sessions.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRefs.current.forEach((cleanup) => cleanup());
    };
  }, []);

  const activeSession = sessions.find((s) => s.id === activeId);

  if (!shellRef.current) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2 p-4">
        <TerminalIcon className="w-8 h-8 opacity-50" />
        <span>Terminal requires Electron</span>
        <span className="text-xs">Available in Electron desktop app</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[#2a2a35] flex-shrink-0 overflow-x-auto">
        {sessions.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              s.id === activeId
                ? 'bg-[#22c55e]/20 text-[#22c55e]'
                : 'text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24]'
            }`}
          >
            <TerminalIcon className="w-3 h-3" />
            <span>Term {i + 1}</span>
            <X
              className="w-3 h-3 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                killSession(s.id);
              }}
            />
          </button>
        ))}
        <button
          onClick={createSession}
          className="flex items-center p-0.5 text-[#6b6b75] hover:text-[#22c55e] transition-colors"
          title="New terminal"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Output */}
      <pre
        ref={outputRef}
        className="flex-1 overflow-auto p-2 text-xs font-mono text-[#e5e5e5] whitespace-pre-wrap"
      >
        {activeSession?.buffer.join('') || ''}
      </pre>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex border-t border-[#2a2a35] flex-shrink-0">
        <span className="px-2 py-1 text-xs text-[#22c55e] font-mono">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent text-xs font-mono text-[#e5e5e5] py-1 pr-2 outline-none"
          placeholder="Type command..."
          autoFocus
        />
      </form>
    </div>
  );
}
