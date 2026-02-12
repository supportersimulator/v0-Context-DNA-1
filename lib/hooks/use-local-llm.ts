'use client';

// =============================================================================
// useLocalLLM — React hook for streaming local Qwen3-14B via vllm-mlx
// OpenAI-compatible API at http://127.0.0.1:5044/v1/chat/completions
// Supports streaming, thinking mode (<think> tags), cancellation, and batched
// re-renders for performance.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMStreamOptions {
  messages: LLMMessage[];
  /** Model to use. Default: auto-detect from /v1/models */
  model?: string;
  /** Temperature (0-1). Default: 0.3 for code, 0.6 for reasoning */
  temperature?: number;
  /** Max tokens to generate. Default: 1024 */
  maxTokens?: number;
  /** Enable thinking mode (Qwen3 <think> tags). Default: false */
  thinking?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Called on each token chunk */
  onToken?: (token: string) => void;
  /** Called when thinking section detected (Qwen3) */
  onThinking?: (thought: string) => void;
  /** Priority: aaron=1, atlas=2, external=3, background=4 */
  priority?: 1 | 2 | 3 | 4;
}

export interface LLMResult {
  text: string;
  thinking?: string;
  tokenCount: number;
  durationMs: number;
}

export interface LLMStatus {
  available: boolean;
  model: string | null;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LLM_URL = getServiceUrl('local_llm') || 'http://127.0.0.1:5044';
const HEALTH_POLL_MS = 30_000;
const RENDER_THROTTLE_MS = 50;

// ---------------------------------------------------------------------------
// Helpers (pure, no React dependency)
// ---------------------------------------------------------------------------

function getLLMBaseURL(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('contextdna_llm_url');
    if (stored) return stored.replace(/\/+$/, '');
  }
  return DEFAULT_LLM_URL;
}

/** Detect the first available model name from /v1/models */
async function detectModel(base: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${base}/v1/models`, { signal });
    if (!res.ok) return null;
    const json = await res.json() as { data?: Array<{ id: string }> };
    return json.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse Qwen3 thinking tags from completed text.
 * Returns { answer, thinking } where thinking is the content inside <think>...</think>.
 */
function parseThinking(raw: string): { answer: string; thinking: string | undefined } {
  const match = raw.match(/<think>([\s\S]*?)<\/think>/);
  if (!match) return { answer: raw, thinking: undefined };
  const thinking = match[1].trim();
  const answer = raw.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  return { answer, thinking };
}

/**
 * Inject " /think" into the last user message to enable Qwen3 thinking mode.
 * Returns a new messages array (does not mutate input).
 */
function injectThinkingFlag(messages: LLMMessage[]): LLMMessage[] {
  const out = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user') {
      out[i] = { ...out[i], content: out[i].content + ' /think' };
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// System prompts for quick helpers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS = {
  explain:
    'You are a senior engineer. Explain the following code concisely. Focus on what it does and why. Use plain language.',
  refactor:
    'You are a senior engineer. Refactor the following code following the instruction. Return ONLY the refactored code inside a fenced code block. No commentary.',
  findBugs:
    'You are a senior security-aware engineer. Analyze the following code for bugs, security issues, and edge cases. Be specific — cite line-level issues.',
  document:
    'You are a senior engineer. Add clear, concise documentation comments to the following code. Preserve the code structure. Return the fully documented code.',
} as const;

// ---------------------------------------------------------------------------
// Standalone streaming function (no React dependency)
// ---------------------------------------------------------------------------

export async function queryLocalLLM(opts: LLMStreamOptions): Promise<LLMResult> {
  const base = getLLMBaseURL();
  const startMs = performance.now();
  let tokenCount = 0;
  let fullText = '';

  // Resolve model
  const model = opts.model ?? (await detectModel(base, opts.signal)) ?? 'default';

  // Prepare messages — inject /think if thinking mode
  const messages = opts.thinking ? injectThinkingFlag(opts.messages) : opts.messages;

  const body = JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1024,
    stream: true,
  });

  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: opts.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LLM fetch failed';
    return { text: `[Error: ${msg}]`, tokenCount: 0, durationMs: performance.now() - startMs };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => 'unknown');
    return {
      text: `[Error ${res.status}: ${errBody}]`,
      tokenCount: 0,
      durationMs: performance.now() - startMs,
    };
  }

  // Stream SSE
  const reader = res.body?.getReader();
  if (!reader) {
    return { text: '[Error: No response body]', tokenCount: 0, durationMs: performance.now() - startMs };
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep incomplete last line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6)) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = json.choices?.[0]?.delta?.content;
          if (token) {
            fullText += token;
            tokenCount++;
            opts.onToken?.(token);
          }
        } catch {
          // Malformed chunk — skip
        }
      }
    }
  } catch (err) {
    // AbortError is expected on cancel
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Treat partial result as valid
    } else {
      const msg = err instanceof Error ? err.message : 'Stream read error';
      fullText += `\n[Stream error: ${msg}]`;
    }
  } finally {
    reader.releaseLock();
  }

  const durationMs = performance.now() - startMs;

  // Parse thinking if enabled
  if (opts.thinking) {
    const { answer, thinking } = parseThinking(fullText);
    if (thinking) opts.onThinking?.(thinking);
    return { text: answer, thinking, tokenCount, durationMs };
  }

  return { text: fullText, tokenCount, durationMs };
}

// ---------------------------------------------------------------------------
// React Hook
// ---------------------------------------------------------------------------

export function useLocalLLM() {
  // ---- State ----
  const [status, setStatus] = useState<LLMStatus>({ available: false, model: null, loading: true });
  const [isGenerating, setIsGenerating] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [partialThinking, setPartialThinking] = useState('');

  // ---- Refs (stable across renders) ----
  const abortRef = useRef<AbortController | null>(null);
  const modelRef = useRef<string | null>(null);
  const partialTextRef = useRef('');
  const partialThinkingRef = useRef('');
  const rafRef = useRef<number>(0);
  const lastFlushRef = useRef(0);
  const mountedRef = useRef(true);

  // ---- Batched state flush (throttled to RENDER_THROTTLE_MS) ----
  const scheduleFlush = useCallback(() => {
    const now = performance.now();
    if (now - lastFlushRef.current < RENDER_THROTTLE_MS) {
      // Already scheduled or too soon
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          if (!mountedRef.current) return;
          lastFlushRef.current = performance.now();
          setPartialText(partialTextRef.current);
          setPartialThinking(partialThinkingRef.current);
        });
      }
      return;
    }
    lastFlushRef.current = now;
    if (!mountedRef.current) return;
    setPartialText(partialTextRef.current);
    setPartialThinking(partialThinkingRef.current);
  }, []);

  // ---- Health check: detect model on mount + poll ----
  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval>;
    let aborted = false;

    const check = async () => {
      const base = getLLMBaseURL();
      const model = await detectModel(base);
      if (aborted) return;
      modelRef.current = model;
      setStatus({ available: model !== null, model, loading: false });
    };

    check();
    timer = setInterval(check, HEALTH_POLL_MS);

    return () => {
      aborted = true;
      mountedRef.current = false;
      clearInterval(timer);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  // ---- cancel() ----
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  }, []);

  // ---- generate() ----
  const generate = useCallback(
    async (opts: LLMStreamOptions): Promise<LLMResult> => {
      // Cancel any in-flight request
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      // Combine signals: user-provided + our controller
      const signal = opts.signal
        ? combineAbortSignals(opts.signal, controller.signal)
        : controller.signal;

      // Reset partial state
      partialTextRef.current = '';
      partialThinkingRef.current = '';
      setPartialText('');
      setPartialThinking('');
      setIsGenerating(true);

      const result = await queryLocalLLM({
        ...opts,
        model: opts.model ?? modelRef.current ?? undefined,
        signal,
        onToken: (token) => {
          partialTextRef.current += token;
          scheduleFlush();
          opts.onToken?.(token);
        },
        onThinking: (thought) => {
          partialThinkingRef.current = thought;
          scheduleFlush();
          opts.onThinking?.(thought);
        },
      });

      // Final sync flush
      if (mountedRef.current) {
        setPartialText(result.text);
        if (result.thinking) setPartialThinking(result.thinking);
        setIsGenerating(false);

        // Update availability based on result
        if (result.text.startsWith('[Error:') && !status.available) {
          setStatus((s) => ({ ...s, available: false }));
        }
      }

      abortRef.current = null;
      return result;
    },
    [scheduleFlush, status.available],
  );

  // ---- Quick helpers ----

  const explain = useCallback(
    (code: string, language: string): Promise<LLMResult> =>
      generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.explain },
          { role: 'user', content: `\`\`\`${language}\n${code}\n\`\`\`` },
        ],
        temperature: 0.3,
      }),
    [generate],
  );

  const refactor = useCallback(
    (code: string, language: string, instruction: string): Promise<LLMResult> =>
      generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.refactor },
          {
            role: 'user',
            content: `Instruction: ${instruction}\n\n\`\`\`${language}\n${code}\n\`\`\``,
          },
        ],
        temperature: 0.3,
      }),
    [generate],
  );

  const findBugs = useCallback(
    (code: string, language: string): Promise<LLMResult> =>
      generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.findBugs },
          { role: 'user', content: `\`\`\`${language}\n${code}\n\`\`\`` },
        ],
        temperature: 0.3,
        thinking: true,
      }),
    [generate],
  );

  const document = useCallback(
    (code: string, language: string): Promise<LLMResult> =>
      generate({
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.document },
          { role: 'user', content: `\`\`\`${language}\n${code}\n\`\`\`` },
        ],
        temperature: 0.2,
      }),
    [generate],
  );

  return {
    status,
    generate,
    cancel,
    isGenerating,
    partialText,
    partialThinking,
    explain,
    refactor,
    findBugs,
    document,
  };
}

// ---------------------------------------------------------------------------
// Utility: combine two AbortSignals into one
// ---------------------------------------------------------------------------

function combineAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  // If AbortSignal.any is available (modern browsers), use it
  if ('any' in AbortSignal && typeof (AbortSignal as unknown as { any: unknown }).any === 'function') {
    return (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([a, b]);
  }

  // Fallback: proxy with a new controller
  const controller = new AbortController();

  const onAbort = () => controller.abort();

  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }

  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });

  return controller.signal;
}
