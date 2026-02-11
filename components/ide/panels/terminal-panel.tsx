'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { PanelTabBar, type PanelTab } from '../panel-tabs';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// ---------------------------------------------------------------------------
// Electron Shell bridge
// ---------------------------------------------------------------------------
function getElectronShell() {
  if (typeof window !== 'undefined' && (window as any).electron?.shell) {
    return (window as any).electron.shell as {
      create: (opts?: { cwd?: string; shell?: string }) => Promise<{ id: string }>;
      write: (id: string, data: string) => Promise<void>;
      resize: (id: string, cols: number, rows: number) => Promise<void>;
      kill: (id: string) => Promise<void>;
      onData: (id: string, callback: (data: string) => void) => () => void;
      onExit: (id: string, callback: (code: number) => void) => () => void;
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Check if running in Electron
// ---------------------------------------------------------------------------
function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electron?.isElectron;
}

// ---------------------------------------------------------------------------
// xterm.js theme matching IDE dark theme
// ---------------------------------------------------------------------------
const TERMINAL_THEME = {
  background: '#0a0a0f',
  foreground: '#e5e5e5',
  cursor: '#22c55e',
  cursorAccent: '#0a0a0f',
  selectionBackground: '#22c55e33',
  selectionForeground: '#e5e5e5',
  black: '#0a0a0f',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e5e5e5',
  brightBlack: '#6b6b75',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
};

// ---------------------------------------------------------------------------
// Session tracking
// ---------------------------------------------------------------------------
interface TermSession {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// XTermSession — manages one xterm Terminal instance bound to a PTY
// ---------------------------------------------------------------------------
interface XTermSessionHandle {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

function createXTermSession(
  container: HTMLDivElement,
  shell: NonNullable<ReturnType<typeof getElectronShell>>,
  ptyId: string,
): XTermSessionHandle {
  const terminal = new Terminal({
    theme: TERMINAL_THEME,
    fontFamily: 'var(--font-jetbrains), "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 5000,
    allowProposedApi: true,
    convertEol: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);

  // Initial fit
  try {
    fitAddon.fit();
  } catch {
    // Container may not be visible yet
  }

  // Forward user keystrokes to PTY
  const onDataDisposable = terminal.onData((data) => {
    shell.write(ptyId, data);
  });

  // Receive PTY output into xterm
  const unsubData = shell.onData(ptyId, (data: string) => {
    terminal.write(data);
  });

  // Notify PTY of resize
  const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
    shell.resize(ptyId, cols, rows);
  });

  // Send initial size
  try {
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      shell.resize(ptyId, dims.cols, dims.rows);
    }
  } catch {
    // Ignore if container not ready
  }

  const dispose = () => {
    onDataDisposable.dispose();
    onResizeDisposable.dispose();
    unsubData();
    terminal.dispose();
  };

  return { terminal, fitAddon, dispose };
}

// ---------------------------------------------------------------------------
// Web mode: command input that posts to backend API
// ---------------------------------------------------------------------------
const HELPER_API = process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080';

interface WebTermLine {
  type: 'input' | 'output' | 'error';
  text: string;
}

function WebTerminalFallback() {
  const [lines, setLines] = useState<WebTermLine[]>([
    { type: 'output', text: '# Context DNA Web Terminal (limited mode)' },
    { type: 'output', text: '# For full PTY support, use the Electron desktop app.' },
    { type: 'output', text: '# Commands are sent to the backend API.\n' },
  ]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    setInput('');
    setLines((prev) => [...prev, { type: 'input', text: `$ ${cmd}` }]);
    setRunning(true);

    try {
      const res = await fetch(`${HELPER_API}/api/shell/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setLines((prev) => [...prev, { type: 'error', text: errText }]);
      } else {
        const data = await res.json();
        if (data.stdout) {
          setLines((prev) => [...prev, { type: 'output', text: data.stdout }]);
        }
        if (data.stderr) {
          setLines((prev) => [...prev, { type: 'error', text: data.stderr }]);
        }
        if (data.error) {
          setLines((prev) => [...prev, { type: 'error', text: data.error }]);
        }
        if (!data.stdout && !data.stderr && !data.error) {
          setLines((prev) => [...prev, { type: 'output', text: '(no output)' }]);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command failed';
      setLines((prev) => [...prev, { type: 'error', text: msg }]);
    } finally {
      setRunning(false);
    }
  }, [input]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <TerminalIcon className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Terminal (Web)</span>
        <span className="ml-auto text-[10px] text-[#6b6b75]">Limited mode</span>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed"
        style={{ fontFamily: 'var(--font-jetbrains), "JetBrains Mono", Menlo, monospace' }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'input'
                ? 'text-[#22c55e] mt-1'
                : line.type === 'error'
                ? 'text-red-400'
                : 'text-[#e5e5e5] whitespace-pre-wrap'
            }
          >
            {line.text}
          </div>
        ))}
        {running && (
          <div className="text-[#6b6b75] animate-pulse">Running...</div>
        )}
      </div>

      {/* Command input */}
      <form onSubmit={handleSubmit} className="flex border-t border-[#2a2a35] flex-shrink-0">
        <span className="px-2 py-1.5 text-xs text-[#22c55e] font-mono select-none">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={running}
          className="flex-1 bg-transparent text-xs font-mono text-[#e5e5e5] py-1.5 pr-2 outline-none placeholder:text-[#4a4a55] disabled:opacity-50"
          style={{ fontFamily: 'var(--font-jetbrains), "JetBrains Mono", Menlo, monospace' }}
          placeholder="Type command..."
          autoFocus
        />
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TerminalPanel — main export
// ---------------------------------------------------------------------------
export function TerminalPanel() {
  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const shellRef = useRef(getElectronShell());
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermHandlesRef = useRef<Map<string, XTermSessionHandle>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionCounterRef = useRef(0);

  // -------------------------------------------------------------------------
  // Create a new terminal session
  // -------------------------------------------------------------------------
  const createSession = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;

    try {
      const { id } = await shell.create();
      if (!id) return;

      sessionCounterRef.current += 1;
      const label = `Term ${sessionCounterRef.current}`;
      const session: TermSession = { id, label };

      setSessions((prev) => [...prev, session]);
      setActiveId(id);
    } catch {
      // Ignore create failures
    }
  }, []);

  // -------------------------------------------------------------------------
  // Kill a session
  // -------------------------------------------------------------------------
  const killSession = useCallback(async (id: string) => {
    const shell = shellRef.current;
    if (!shell) return;

    // Dispose xterm handle
    const handle = xtermHandlesRef.current.get(id);
    if (handle) {
      handle.dispose();
      xtermHandlesRef.current.delete(id);
    }

    // Kill PTY
    try {
      await shell.kill(id);
    } catch {
      // Already exited
    }

    setSessions((prev) => prev.filter((s) => s.id !== id));
    setActiveId((prev) => {
      if (prev !== id) return prev;
      // Pick next available session
      const remaining = sessions.filter((s) => s.id !== id);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [sessions]);

  // -------------------------------------------------------------------------
  // Attach xterm to the active session
  // -------------------------------------------------------------------------
  useEffect(() => {
    const shell = shellRef.current;
    const container = containerRef.current;
    if (!shell || !container || !activeId) return;

    // Clear container
    container.innerHTML = '';

    // Reuse existing handle or create new one
    let handle = xtermHandlesRef.current.get(activeId);
    if (handle) {
      // Re-attach existing terminal to container
      handle.terminal.open(container);
      try {
        handle.fitAddon.fit();
      } catch {
        // Ignore if not visible
      }
    } else {
      // Create new xterm session for this PTY
      handle = createXTermSession(container, shell, activeId);
      xtermHandlesRef.current.set(activeId, handle);

      // Listen for PTY exit
      const unsubExit = shell.onExit(activeId, () => {
        // Dispose handle
        const h = xtermHandlesRef.current.get(activeId);
        if (h) {
          h.dispose();
          xtermHandlesRef.current.delete(activeId);
        }
        setSessions((prev) => prev.filter((s) => s.id !== activeId));
        setActiveId((prev) => {
          if (prev !== activeId) return prev;
          return null;
        });
      });

      // Store exit unsubscribe in a cleanup-safe way
      const existingHandle = xtermHandlesRef.current.get(activeId);
      if (existingHandle) {
        const originalDispose = existingHandle.dispose;
        existingHandle.dispose = () => {
          unsubExit();
          originalDispose();
        };
      }
    }

    // Focus the terminal
    handle.terminal.focus();

    return () => {
      // Do NOT dispose on switch - we keep sessions alive
      // Just detach from DOM by clearing container
    };
  }, [activeId]);

  // -------------------------------------------------------------------------
  // ResizeObserver for auto-fit
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (!activeId) return;
      const handle = xtermHandlesRef.current.get(activeId);
      if (handle) {
        try {
          handle.fitAddon.fit();
        } catch {
          // Container might have zero dimensions
        }
      }
    });

    observer.observe(container);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [activeId]);

  // -------------------------------------------------------------------------
  // Create initial session on mount (Electron only)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (shellRef.current && sessions.length === 0) {
      createSession();
    }
  }, [createSession, sessions.length]);

  // -------------------------------------------------------------------------
  // Cleanup all sessions on unmount
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      xtermHandlesRef.current.forEach((handle) => handle.dispose());
      xtermHandlesRef.current.clear();
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Web fallback — no Electron shell available
  // -------------------------------------------------------------------------
  if (!shellRef.current) {
    return <WebTerminalFallback />;
  }

  // -------------------------------------------------------------------------
  // Electron mode — full xterm.js terminal
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Tab bar */}
      <PanelTabBar
        tabs={sessions.map((s): PanelTab => ({
          id: s.id,
          label: s.label,
          icon: <TerminalIcon className="w-3 h-3" />,
          closable: true,
        }))}
        activeId={activeId ?? ''}
        onSelect={setActiveId}
        onClose={killSession}
        onAdd={createSession}
        variant="pills"
        size="xs"
      />

      {/* xterm container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
