'use client';

/**
 * Claude Chat View - Anthropic Claude integration for Context DNA IDE
 *
 * Streams responses from the Anthropic Messages API via /api/claude/chat proxy.
 * Shares warm-dark aesthetic with Synaptic but uses violet accent for brand differentiation.
 *
 * Design: Matches SynapticChatView layout (bubble chat, same spacing).
 * Claude = cloud powerhouse. Synaptic = local butler. Same panel, different tabs.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, MessageCircle, Loader2, Trash2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// =============================================================================
// Theme — Claude violet accent on shared dark background
// =============================================================================

const ACCENT = {
  primary: '#a78bfa',     // Violet-400
  hover: '#c4b5fd',       // Violet-300
  muted: 'rgba(167,139,250,0.15)',
  glow: 'rgba(167,139,250,0.3)',
};

const T = {
  bg: 'bg-[#0f0f12]',
  bgSecondary: 'bg-[#161619]',
  bgHover: 'hover:bg-[#1e1e22]',
  bgMuted: 'bg-[#1e1e22]',
  text: 'text-[#f5f5f5]',
  textMuted: 'text-[#a0a0a5]',
  border: 'border-[#2a2a2e]',
  userBubble: 'bg-[#a78bfa] text-white',
  claudeBubble: 'bg-[#1e1e22] text-[#f5f5f5]',
  inputBg: 'bg-[#1e1e22]/80',
};

// =============================================================================
// Types
// =============================================================================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// =============================================================================
// SSE Stream Parser
// =============================================================================

async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        // Anthropic streaming: content_block_delta events
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }
}

// =============================================================================
// Persistence
// =============================================================================

const STORAGE_KEY = 'contextdna_claude_chat_history';
const MAX_STORED = 50;

function loadMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED)));
  } catch {
    // quota exceeded — silently skip
  }
}

// =============================================================================
// Component
// =============================================================================

export function ClaudeChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load persisted messages on mount
  useEffect(() => {
    setMessages(loadMessages());
  }, []);

  // Persist whenever messages change (skip during streaming partial)
  useEffect(() => {
    if (!streaming) saveMessages(messages);
  }, [messages, streaming]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Check API availability once
  useEffect(() => {
    fetch('/api/claude/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    }).then(res => {
      setApiAvailable(res.status !== 503);
    }).catch(() => {
      setApiAvailable(false);
    });
  }, []);

  // ─── Send Message ──────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const assistantMsg: ChatMessage = {
      id: `asst-${Date.now()}`,
      role: 'assistant',
      content: '',
    };

    const updated = [...messages, userMsg];
    setMessages([...updated, assistantMsg]);
    setInput('');
    setStreaming(true);

    // Build API messages (last 20 for context window management)
    const apiMessages = updated.slice(-20).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortRef.current = new AbortController();

      const res = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${errText || res.statusText}` }
              : m
          )
        );
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      let accumulated = '';

      for await (const chunk of parseSSEStream(reader)) {
        accumulated += chunk;
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id ? { ...m, content: accumulated } : m
          )
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${String(err)}` }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = useCallback(() => {
    if (streaming) {
      abortRef.current?.abort();
    }
    setMessages([]);
    saveMessages([]);
  }, [streaming]);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col h-full transition-colors duration-300', T.bg)}>
      {/* Header */}
      <div className={cn('flex items-center gap-3 p-4 border-b', T.border, T.bgSecondary)}>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: ACCENT.muted }}
        >
          <Sparkles className="h-5 w-5" style={{ color: ACCENT.primary }} />
        </div>
        <div className="flex-1">
          <h2 className={cn('font-semibold', T.text)}>Claude</h2>
          <p className={cn('text-xs', T.textMuted)}>
            {streaming
              ? 'Responding...'
              : apiAvailable === false
              ? 'API key not configured'
              : 'Anthropic Claude \u2022 Cloud AI'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Clear chat */}
          <button
            onClick={clearChat}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
              T.bgMuted,
              T.bgHover
            )}
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" style={{ color: ACCENT.primary }} />
          </button>
          {/* Status dot */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                apiAvailable === true
                  ? 'bg-emerald-500'
                  : apiAvailable === false
                  ? 'bg-red-500'
                  : 'bg-yellow-500 animate-pulse'
              )}
            />
            <span className={cn('text-xs', T.textMuted)}>
              {apiAvailable === true
                ? 'Ready'
                : apiAvailable === false
                ? 'No API key'
                : 'Checking...'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className={cn('text-center py-12', T.textMuted)}>
              <div
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: ACCENT.muted }}
              >
                <MessageCircle
                  className="h-8 w-8"
                  style={{ color: ACCENT.primary, opacity: 0.7 }}
                />
              </div>
              <p className={cn('text-lg font-medium mb-2', T.text)}>
                Chat with Claude
              </p>
              <p className="text-sm opacity-70">
                Cloud-powered AI for complex tasks
              </p>
              {apiAvailable === false && (
                <div
                  className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    color: '#f87171',
                  }}
                >
                  <span>Add ANTHROPIC_API_KEY to enable</span>
                  <ArrowUpRight className="h-3 w-3" />
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 max-w-[85%]',
                    msg.role === 'user' ? T.userBubble : T.claudeBubble
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div
                      className={cn(
                        'flex items-center gap-2 mb-1 text-xs',
                        T.textMuted
                      )}
                    >
                      <Sparkles
                        className="h-3 w-3"
                        style={{ color: ACCENT.primary }}
                      />
                      <span>Claude</span>
                    </div>
                  )}
                  {msg.content ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        style={{ color: ACCENT.primary }}
                      />
                      <span className={cn('text-sm', T.textMuted)}>
                        Thinking...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className={cn('p-4 border-t backdrop-blur', T.border, T.bgSecondary)}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  apiAvailable === false
                    ? 'API key required...'
                    : 'Ask Claude anything...'
                }
                disabled={streaming || apiAvailable === false}
                className={cn(
                  'pr-12 h-12 rounded-full border transition-colors',
                  T.inputBg,
                  T.text,
                  T.border,
                  'focus:outline-none'
                )}
              />
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={streaming || !input.trim() || apiAvailable === false}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full p-0 border-0"
                style={{ backgroundColor: ACCENT.primary }}
              >
                {streaming ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Send className="h-4 w-4 text-white" />
                )}
              </Button>
            </div>
          </div>
          <p className={cn('text-xs text-center mt-3', T.textMuted)}>
            {streaming
              ? 'Claude is responding...'
              : 'Claude Sonnet 4.5 \u2022 Streaming responses'}
          </p>
        </div>
      </div>
    </div>
  );
}
