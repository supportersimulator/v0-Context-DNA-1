/**
 * Claude Chat API Proxy
 *
 * Proxies chat requests to the Anthropic Messages API with streaming.
 * Uses ANTHROPIC_API_KEY from server-side env (never exposed to client).
 */

import { NextRequest } from 'next/server';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5-20250929';
const MAX_TOKENS = 4096;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: 'Anthropic API key not configured' },
      { status: 503 }
    );
  }

  try {
    const { messages, system } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: 'messages array is required' },
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
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Claude API] Error:', response.status, errorText);
      return Response.json(
        { error: `Anthropic API error: ${response.status}` },
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
    return Response.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
