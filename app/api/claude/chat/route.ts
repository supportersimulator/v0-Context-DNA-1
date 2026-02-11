/**
 * Claude Chat API Proxy
 *
 * Proxies chat requests to the Anthropic Messages API with streaming.
 * Uses ANTHROPIC_API_KEY from server-side env (never exposed to client).
 */

import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 503 }
    );
  }

  try {
    const { messages, system } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages array is required' },
        { status: 400 }
      );
    }

    // Sanitize messages for Anthropic API requirements:
    //  - Drop empty content, non-user/assistant roles
    //  - Ensure first message is 'user'
    //  - Merge consecutive same-role messages
    const validRoles = new Set(['user', 'assistant']);
    const filtered = messages.filter(
      (m: unknown): m is { role: string; content: string } => {
        if (!m || typeof m !== 'object') return false;
        const msg = m as Record<string, unknown>;
        return (
          typeof msg.content === 'string' &&
          msg.content.trim() !== '' &&
          typeof msg.role === 'string' &&
          validRoles.has(msg.role)
        );
      }
    );

    // Drop leading assistant messages
    let start = 0;
    while (start < filtered.length && filtered[start].role !== 'user') {
      start++;
    }
    const trimmed = filtered.slice(start);

    // Merge consecutive same-role messages (API requires strict alternation)
    const sanitized: { role: string; content: string }[] = [];
    for (const msg of trimmed) {
      const last = sanitized[sanitized.length - 1];
      if (last && last.role === msg.role) {
        last.content += '\n\n' + msg.content;
      } else {
        sanitized.push({ role: msg.role, content: msg.content.trim() });
      }
    }

    if (sanitized.length === 0) {
      return NextResponse.json(
        { error: 'No valid messages after sanitization' },
        { status: 400 }
      );
    }

    // Stream response from Anthropic
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: system || 'You are Claude, an AI assistant by Anthropic. You are helpful, harmless, and honest. You are embedded inside the Context DNA IDE — a VS Code-style admin dashboard for managing AI memory systems. Be concise and technical.',
        messages: sanitized,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Claude API] Error:', response.status, errorText);
      // Parse Anthropic error detail for client debugging
      let detail = `Anthropic API error: ${response.status}`;
      try {
        const errJson = JSON.parse(errorText);
        if (errJson?.error?.message) {
          detail = errJson.error.message;
        }
      } catch {
        if (errorText) detail = errorText;
      }
      return NextResponse.json(
        { error: detail },
        { status: response.status }
      );
    }

    // Forward the SSE stream directly to client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[Claude API] Proxy error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
