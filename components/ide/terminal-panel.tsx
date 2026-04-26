'use client';

// =============================================================================
// TerminalPanel — xterm.js renderer wired to /api/terminal/{exec,stream,kill}
//
// Layout:
//   [ cwd input ] [ command input ] [ Run ] [ Stop ]
//   [ ------------------ xterm canvas ------------------ ]
//
// SSR safety:
//   xterm + addon-fit are dynamically imported inside useEffect — they
//   touch `document` on construction and would crash Next.js server render.
//
// Resize:
//   ResizeObserver on the wrapper triggers FitAddon.fit() so the rows/cols
//   track the panel size as the user drags Dockview splitters.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTerminal, type ChunkEvent } from '@/lib/hooks/use-terminal';

// xterm types — `import type` is erased at runtime so it's SSR-safe.
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon as FitAddonType } from '@xterm/addon-fit';

interface TerminalPanelProps {
  /** Initial cwd, relative to superrepo root or absolute. */
  initialCwd?: string;
  /** Initial command shown in the input box. */
  initialCommand?: string;
}

/** ANSI: red on stderr so user can distinguish without parsing. */
const STDERR_PREFIX = '\x1b[31m';
const STDERR_SUFFIX = '\x1b[0m';

export function TerminalPanel({
  initialCwd = '',
  initialCommand = '',
}: TerminalPanelProps) {
  const [cwd, setCwd] = useState(initialCwd);
  const [command, setCommand] = useState(initialCommand);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddonType | null>(null);
  const readyRef = useRef(false);

  const onChunk = useCallback((evt: ChunkEvent) => {
    const term = termRef.current;
    if (!term) return;
    // xterm needs CR-LF; raw stdout often lacks the CR.
    const normalized = evt.chunk.replace(/\r?\n/g, '\r\n');
    if (evt.stream === 'stderr') {
      term.write(STDERR_PREFIX + normalized + STDERR_SUFFIX);
    } else {
      term.write(normalized);
    }
  }, []);

  const onClose = useCallback((code: number | null) => {
    const term = termRef.current;
    if (!term) return;
    term.write(`\r\n\x1b[90m[exit ${code ?? 'null'}]\x1b[0m\r\n`);
  }, []);

  const onError = useCallback((err: string) => {
    const term = termRef.current;
    if (!term) return;
    term.write(`\r\n\x1b[31m[error] ${err}\x1b[0m\r\n`);
  }, []);

  const { run, kill, state, error, lastExitCode, sessionId } = useTerminal({
    onChunk,
    onClose,
    onError,
  });

  // Mount xterm — dynamic import so this never runs on the server.
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        // Style sheet ships with the package; Next.js inlines it as a side
        // effect at bundle time. No .d.ts ships with the CSS file, hence
        // the ts-expect-error.
        // @ts-expect-error — CSS module has no type declaration.
        import('@xterm/xterm/css/xterm.css'),
      ]);

      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        convertEol: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        theme: { background: '#0b0b0b', foreground: '#e6e6e6' },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      try {
        fit.fit();
      } catch {
        /* container may not have layout yet */
      }
      termRef.current = term;
      fitRef.current = fit;
      readyRef.current = true;

      resizeObserver = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          /* noop — panel may be hidden */
        }
      });
      resizeObserver.observe(containerRef.current);

      term.write(
        '\x1b[90mContext DNA terminal — npm/npx/git/python3/expo/node/bash -c only.\x1b[0m\r\n',
      );
    })();

    return () => {
      disposed = true;
      readyRef.current = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch {
          /* ignore */
        }
        termRef.current = null;
      }
      fitRef.current = null;
    };
  }, []);

  const handleRun = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd) return;
    const term = termRef.current;
    if (term) {
      term.write(`\r\n\x1b[36m$ ${cmd}\x1b[0m\r\n`);
    }
    await run(cmd, cwd.trim() || undefined);
  }, [command, cwd, run]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && state !== 'starting' && state !== 'running') {
        e.preventDefault();
        void handleRun();
      }
    },
    [handleRun, state],
  );

  const running = state === 'starting' || state === 'running';

  return (
    <div className="flex h-full w-full flex-col bg-[#0b0b0b] text-zinc-200">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 p-2">
        <Input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="cwd (relative to superrepo root, blank = root)"
          className="h-8 w-72 font-mono text-xs"
          spellCheck={false}
        />
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. npm test  |  git status  |  bash -c date"
          className="h-8 flex-1 font-mono text-xs"
          spellCheck={false}
        />
        <Button
          onClick={handleRun}
          disabled={running || !command.trim()}
          size="sm"
          className="h-8"
        >
          {running ? 'Running' : 'Run'}
        </Button>
        <Button
          onClick={() => void kill()}
          disabled={!running || !sessionId}
          size="sm"
          variant="destructive"
          className="h-8"
        >
          Stop
        </Button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-1" />
      <div className="flex h-6 items-center gap-3 border-t border-zinc-800 bg-zinc-900/80 px-2 font-mono text-[11px] text-zinc-400">
        <span>state: {state}</span>
        {sessionId ? <span>session: {sessionId.slice(0, 8)}</span> : null}
        {lastExitCode !== null ? <span>exit: {lastExitCode}</span> : null}
        {error ? <span className="text-red-400">err: {error}</span> : null}
      </div>
    </div>
  );
}

export default TerminalPanel;
