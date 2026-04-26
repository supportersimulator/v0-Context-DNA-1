'use client';

// =============================================================================
// useTerminal — React hook around /api/terminal/{exec,stream,kill}
//
// Exposes:
//   - run(command, cwd?)  — POST exec, attach EventSource, stream chunks
//   - kill()              — POST kill for the active session
//   - sessionId           — current active session (null when idle)
//   - state               — 'idle' | 'starting' | 'running' | 'closed' | 'error'
//   - error               — last error message, if any
//   - lastExitCode        — proc exit code from last run
//
// The hook does NOT own the xterm instance — TerminalPanel owns that and
// passes an `onChunk` callback so chunks land in the renderer.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export type TerminalState = 'idle' | 'starting' | 'running' | 'closed' | 'error';

export interface ChunkEvent {
  stream: 'stdout' | 'stderr';
  chunk: string;
}

export interface UseTerminalOptions {
  onChunk?: (evt: ChunkEvent) => void;
  onClose?: (code: number | null) => void;
  onError?: (err: string) => void;
}

export interface UseTerminalResult {
  run: (command: string, cwd?: string) => Promise<void>;
  kill: () => Promise<void>;
  sessionId: string | null;
  state: TerminalState;
  error: string | null;
  lastExitCode: number | null;
}

interface ExecResponse {
  ok: boolean;
  sessionId?: string;
  cwd?: string;
  command?: string[];
  error?: string;
}

export function useTerminal(opts: UseTerminalOptions = {}): UseTerminalResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<TerminalState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastExitCode, setLastExitCode] = useState<number | null>(null);

  // Stable refs for callbacks so EventSource handlers don't capture stale closures.
  const optsRef = useRef(opts);
  // React 19 disallows ref mutation during render — sync inside effect.
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const esRef = useRef<EventSource | null>(null);
  const aliveRef = useRef(true);

  const closeStream = useCallback(() => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch {
        /* ignore */
      }
      esRef.current = null;
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      closeStream();
    };
  }, [closeStream]);

  const run = useCallback(
    async (command: string, cwd?: string) => {
      // Tear down any prior stream — caller is starting a fresh command.
      closeStream();
      setError(null);
      setLastExitCode(null);
      setState('starting');

      let json: ExecResponse;
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, cwd }),
          cache: 'no-store',
        });
        json = (await res.json()) as ExecResponse;
        if (!res.ok || !json.ok || !json.sessionId) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'exec failed';
        if (!aliveRef.current) return;
        setError(msg);
        setState('error');
        optsRef.current.onError?.(msg);
        return;
      }

      const id = json.sessionId;
      if (!aliveRef.current) return;
      setSessionId(id);
      setState('running');

      // Open SSE. EventSource auto-reconnects on transient errors; we close
      // it explicitly on the close event or on hook unmount.
      const es = new EventSource(`/api/terminal/stream/${id}`);
      esRef.current = es;

      es.onmessage = (msg) => {
        if (!aliveRef.current) return;
        try {
          const data = JSON.parse(msg.data) as
            | ChunkEvent
            | { event: 'close'; code: number | null }
            | { event: 'not_found' };
          if ('event' in data) {
            if (data.event === 'close') {
              const code = data.code ?? null;
              setLastExitCode(code);
              setState('closed');
              optsRef.current.onClose?.(code);
              closeStream();
            } else {
              setError('session not found');
              setState('error');
              optsRef.current.onError?.('session not found');
              closeStream();
            }
          } else {
            optsRef.current.onChunk?.(data);
          }
        } catch {
          // Malformed SSE payload — surface as error but keep stream open.
          optsRef.current.onError?.('malformed sse payload');
        }
      };

      es.onerror = () => {
        // Browser triggers onerror on normal close too — only treat as
        // error if we haven't already received the close event.
        if (!aliveRef.current) return;
        if (esRef.current === es && es.readyState === EventSource.CLOSED) {
          // EventSource gave up. If state is still 'running', record it.
          setState((prev) => (prev === 'running' ? 'error' : prev));
        }
      };
    },
    [closeStream],
  );

  const kill = useCallback(async () => {
    const id = sessionId;
    if (!id) return;
    try {
      await fetch('/api/terminal/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
        cache: 'no-store',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'kill failed';
      if (aliveRef.current) {
        setError(msg);
        optsRef.current.onError?.(msg);
      }
    }
    // Don't close ES here — server will emit the close event which closes it.
  }, [sessionId]);

  return { run, kill, sessionId, state, error, lastExitCode };
}
