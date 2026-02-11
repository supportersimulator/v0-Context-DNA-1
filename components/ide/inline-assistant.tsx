'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Brain,
  X,
  Copy,
  Check,
  Zap,
  Loader2,
  ChevronDown,
  ChevronRight,
  Search,
  Bug,
  FileText,
  TestTube,
  Gauge,
  RefreshCw,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

export interface InlineAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  contextCode?: string;
  contextLanguage?: string;
  contextFile?: string;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

interface GenerationStats {
  tokenCount: number;
  elapsed: number;
}

// =============================================================================
// Constants
// =============================================================================

const LLM_ENDPOINT = 'http://127.0.0.1:5044/v1/chat/completions';
const LLM_MODEL = 'qwen3-14b';
const SYSTEM_PROMPT =
  'You are a code assistant integrated into Context DNA IDE. You have access to persistent memory about this codebase. Be concise, practical, and specific.';

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'explain',   label: 'Explain',    icon: <Search className="w-3 h-3" />,     prompt: 'Explain this code concisely' },
  { id: 'refactor',  label: 'Refactor',   icon: <RefreshCw className="w-3 h-3" />,  prompt: 'Suggest refactoring improvements' },
  { id: 'bugs',      label: 'Find Bugs',  icon: <Bug className="w-3 h-3" />,        prompt: 'Find bugs and security issues' },
  { id: 'document',  label: 'Document',   icon: <FileText className="w-3 h-3" />,   prompt: 'Generate documentation' },
  { id: 'test',      label: 'Test',       icon: <TestTube className="w-3 h-3" />,   prompt: 'Generate unit tests' },
  { id: 'optimize',  label: 'Optimize',   icon: <Gauge className="w-3 h-3" />,      prompt: 'Suggest performance optimizations' },
];

// =============================================================================
// Helpers
// =============================================================================

/** Platform-aware modifier key label */
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '')
    ? '\u2318'
    : 'Ctrl';
}

/** Lightweight markdown-ish rendering for response text. */
function renderResponseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let codeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fences
    if (line.trimStart().startsWith('```')) {
      if (codeBlock) {
        // Close code block
        nodes.push(
          <pre
            key={`code-${codeKey++}`}
            className="my-2 rounded bg-[#0d0d14] border border-[#2a2a35] p-3 text-xs font-mono text-[#c5c5d0] overflow-x-auto whitespace-pre"
          >
            {codeLines.join('\n')}
          </pre>,
        );
        codeLines = [];
        codeBlock = false;
      } else {
        codeBlock = true;
      }
      continue;
    }

    if (codeBlock) {
      codeLines.push(line);
      continue;
    }

    // Bold: **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={j} className="text-[#e5e5e5] font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      // Inline code: `text`
      const inlineParts = part.split(/(`[^`]+`)/g);
      return inlineParts.map((ip, k) => {
        if (ip.startsWith('`') && ip.endsWith('`')) {
          return (
            <code
              key={`${j}-${k}`}
              className="px-1 py-0.5 rounded bg-[#1a1a24] text-[#22c55e] text-xs font-mono"
            >
              {ip.slice(1, -1)}
            </code>
          );
        }
        return ip;
      });
    });

    // List items
    const trimmed = line.trimStart();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      nodes.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-[#6b6b75] select-none">&bull;</span>
          <span>{rendered}</span>
        </div>,
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)?.[1];
      nodes.push(
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-[#6b6b75] select-none min-w-[1.2em] text-right">{num}.</span>
          <span>{rendered}</span>
        </div>,
      );
    } else if (line.trim() === '') {
      nodes.push(<div key={i} className="h-2" />);
    } else {
      nodes.push(<div key={i}>{rendered}</div>);
    }
  }

  // Handle unclosed code block
  if (codeBlock && codeLines.length > 0) {
    nodes.push(
      <pre
        key={`code-${codeKey}`}
        className="my-2 rounded bg-[#0d0d14] border border-[#2a2a35] p-3 text-xs font-mono text-[#c5c5d0] overflow-x-auto whitespace-pre"
      >
        {codeLines.join('\n')}
      </pre>,
    );
  }

  return nodes;
}

/** Extract <think>...</think> blocks from Qwen3 output. */
function extractThinking(text: string): { thinking: string; response: string } {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    return {
      thinking: thinkMatch[1].trim(),
      response: text.replace(/<think>[\s\S]*?<\/think>/, '').trim(),
    };
  }
  // Handle unclosed thinking block (streaming)
  const openMatch = text.match(/<think>([\s\S]*)$/);
  if (openMatch && !text.includes('</think>')) {
    return {
      thinking: openMatch[1].trim(),
      response: '',
    };
  }
  return { thinking: '', response: text };
}

// =============================================================================
// Component
// =============================================================================

export function InlineAssistant({
  isOpen,
  onClose,
  contextCode,
  contextLanguage,
  contextFile,
}: InlineAssistantProps) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Focus + reset on open
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResponse('');
      setStats(null);
      setCopied(false);
      setThinkingOpen(false);
      cancelGeneration();

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Auto-scroll response area
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (responseRef.current && isGenerating) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response, isGenerating]);

  // ---------------------------------------------------------------------------
  // Global Escape to close
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen) return;

    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isGenerating) {
          cancelGeneration();
        } else {
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKey, true);
    return () => window.removeEventListener('keydown', handleGlobalKey, true);
  }, [isOpen, isGenerating, onClose]);

  // ---------------------------------------------------------------------------
  // Cleanup abort on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // LLM streaming
  // ---------------------------------------------------------------------------

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  }, []);

  const submitQuery = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || isGenerating) return;

      cancelGeneration();
      setResponse('');
      setStats(null);
      setCopied(false);
      setThinkingOpen(false);
      setIsGenerating(true);

      const startTime = performance.now();
      let tokenCount = 0;
      let fullText = '';

      // Build messages
      const messages: { role: string; content: string }[] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      // Include file context if available
      if (contextCode) {
        const lang = contextLanguage || 'text';
        const file = contextFile ? ` (${contextFile})` : '';
        messages.push({
          role: 'user',
          content: `Here is the current file context${file}:\n\`\`\`${lang}\n${contextCode}\n\`\`\``,
        });
      }

      messages.push({ role: 'user', content: prompt });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(LLM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LLM_MODEL,
            messages,
            stream: true,
            temperature: 0.6,
            max_tokens: 2048,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`LLM returned ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                tokenCount++;
                setResponse(fullText);
                setStats({
                  tokenCount,
                  elapsed: Math.round(performance.now() - startTime),
                });
              }
            } catch {
              // Malformed chunk — skip
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled — keep partial response
        } else {
          // Fallback message
          const fallback =
            'LLM unavailable \u2014 connect local model at localhost:5044';
          await new Promise((r) => setTimeout(r, 500));
          setResponse(fullText || fallback);
        }
      } finally {
        setIsGenerating(false);
        setStats((prev) => prev ?? {
          tokenCount,
          elapsed: Math.round(performance.now() - startTime),
        });
      }
    },
    [isGenerating, cancelGeneration, contextCode, contextLanguage, contextFile],
  );

  // ---------------------------------------------------------------------------
  // Input key handler
  // ---------------------------------------------------------------------------

  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitQuery(query);
      }
    },
    [query, submitQuery],
  );

  // ---------------------------------------------------------------------------
  // Quick action handler
  // ---------------------------------------------------------------------------

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      setQuery(action.prompt);
      submitQuery(action.prompt);
    },
    [submitQuery],
  );

  // ---------------------------------------------------------------------------
  // Copy response
  // ---------------------------------------------------------------------------

  const handleCopy = useCallback(() => {
    const { response: cleaned } = extractThinking(response);
    navigator.clipboard.writeText(cleaned || response).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [response]);

  // ---------------------------------------------------------------------------
  // Click outside to close
  // ---------------------------------------------------------------------------

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (isGenerating) {
          cancelGeneration();
        } else {
          onClose();
        }
      }
    },
    [isGenerating, cancelGeneration, onClose],
  );

  // ---------------------------------------------------------------------------
  // Parse thinking from response
  // ---------------------------------------------------------------------------

  const { thinking, response: cleanResponse } = extractThinking(response);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  const fileLabel = contextFile
    ? contextFile.split('/').pop() || contextFile
    : null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="mx-auto mt-[10vh] max-w-[700px] rounded-lg border border-[#2a2a35] bg-[#111118] shadow-2xl shadow-black/60 overflow-hidden animate-in slide-in-from-top-2 duration-200"
      >
        {/* ---- Header ---- */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#2a2a35]">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#22c55e]" />
            <span className="text-sm font-medium text-[#e5e5e5]">Ask Qwen3</span>
            {fileLabel && (
              <span className="text-xs text-[#6b6b75] bg-[#1a1a24] px-2 py-0.5 rounded">
                context: {fileLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded bg-[#1a1a24] border border-[#2a2a35] text-[10px] font-mono text-[#6b6b75]">
              {modKey()}I
            </kbd>
            <span className="text-[10px] text-[#6b6b75]">to close</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ---- Input ---- */}
        <div className="px-4 py-3 border-b border-[#2a2a35]">
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Ask anything about your code..."
            rows={1}
            className="w-full bg-[#0a0a0f] rounded-md px-3 py-2 text-sm text-[#e5e5e5] placeholder-[#4a4a55] outline-none border border-[#2a2a35] focus:border-[#22c55e]/50 focus:ring-1 focus:ring-[#22c55e]/30 resize-none transition-colors"
            style={{ minHeight: '38px', maxHeight: '120px' }}
            spellCheck={false}
            autoComplete="off"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-[#4a4a55]">
              Enter to send &middot; Shift+Enter for newline &middot; Esc to{' '}
              {isGenerating ? 'stop' : 'close'}
            </span>
            {isGenerating && (
              <button
                onClick={cancelGeneration}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Stop generating
              </button>
            )}
          </div>
        </div>

        {/* ---- Quick Actions ---- */}
        {!response && !isGenerating && (
          <div className="px-4 py-2.5 border-b border-[#2a2a35]">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1a1a24] text-xs text-[#c5c5d0] hover:bg-[#22c55e]/20 hover:text-[#22c55e] transition-colors cursor-pointer border border-transparent hover:border-[#22c55e]/30"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Response Area ---- */}
        {(response || isGenerating) && (
          <div className="relative">
            <div
              ref={responseRef}
              className="px-4 py-3 max-h-[400px] overflow-y-auto text-sm text-[#c5c5d0] leading-relaxed"
            >
              {/* Thinking chain (collapsible) */}
              {thinking && (
                <div className="mb-3">
                  <button
                    onClick={() => setThinkingOpen((v) => !v)}
                    className="flex items-center gap-1 text-xs text-[#6b6b75] hover:text-[#e5e5e5] transition-colors mb-1"
                  >
                    {thinkingOpen ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    <span className="italic">Thinking...</span>
                  </button>
                  {thinkingOpen && (
                    <div className="ml-4 pl-3 border-l-2 border-[#2a2a35] text-xs text-[#6b6b75] leading-relaxed">
                      {renderResponseMarkdown(thinking)}
                    </div>
                  )}
                </div>
              )}

              {/* Main response */}
              {cleanResponse && renderResponseMarkdown(cleanResponse)}

              {/* Generating indicator */}
              {isGenerating && !cleanResponse && !thinking && (
                <div className="flex items-center gap-2 text-[#6b6b75]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Generating...</span>
                </div>
              )}

              {/* Streaming cursor */}
              {isGenerating && (cleanResponse || thinking) && (
                <span className="inline-block w-1.5 h-4 bg-[#22c55e] animate-pulse ml-0.5 align-middle" />
              )}
            </div>

            {/* Copy button */}
            {response && !isGenerating && (
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 rounded bg-[#1a1a24] border border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:border-[#22c55e]/30 transition-colors"
                title="Copy response"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-[#22c55e]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        )}

        {/* ---- Footer ---- */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#2a2a35]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#4a4a55]">
            <Zap className="w-3 h-3 text-[#22c55e]" />
            <span>Local LLM</span>
            <span className="text-[#2a2a35]">&middot;</span>
            <span>127.0.0.1:5044</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[#4a4a55]">
            {stats && (
              <>
                <span>{stats.tokenCount} tokens</span>
                <span className="text-[#2a2a35]">&middot;</span>
                <span>{(stats.elapsed / 1000).toFixed(1)}s</span>
              </>
            )}
            {isGenerating && (
              <span className="flex items-center gap-1 text-[#22c55e]">
                <Loader2 className="w-3 h-3 animate-spin" />
                generating
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
