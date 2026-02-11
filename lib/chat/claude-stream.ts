/**
 * Claude SSE Stream Parser
 *
 * Handles Server-Sent Events from the Anthropic Messages API streaming endpoint.
 * Extracts text chunks from content_block_delta events for real-time UI updates.
 *
 * Event types handled:
 *   - message_start      (ignored — metadata)
 *   - content_block_start (ignored — block init)
 *   - content_block_delta (yields delta.text when delta.type === 'text_delta')
 *   - content_block_stop  (ignored — block complete)
 *   - message_delta       (ignored — usage stats)
 *   - message_stop        (terminates stream)
 *   - ping               (ignored — keepalive)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnthropicContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta';
    text: string;
  };
}

interface AnthropicEvent {
  type: string;
  delta?: { type?: string; text?: string };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Core Parser
// ---------------------------------------------------------------------------

/**
 * Parse an Anthropic SSE stream and yield text chunks as they arrive.
 *
 * Usage:
 *   const reader = response.body!.getReader();
 *   for await (const chunk of parseAnthropicSSE(reader)) {
 *     accumulated += chunk;
 *     updateUI(accumulated);
 *   }
 */
export async function* parseAnthropicSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE protocol: events separated by double newlines, data lines prefixed with "data: "
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete last line in buffer

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines, comments, and event type markers
      if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) {
        continue;
      }

      if (!trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6); // Remove 'data: ' prefix

      // End-of-stream markers
      if (data === '[DONE]') return;

      try {
        const event = JSON.parse(data) as AnthropicEvent;

        // Extract text from content_block_delta events
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta' &&
          event.delta.text
        ) {
          yield event.delta.text;
        }

        // message_stop signals end of message
        if (event.type === 'message_stop') {
          return;
        }

        // Check for API errors in the stream
        if (event.type === 'error') {
          const errMsg = (event as Record<string, unknown>).error;
          throw new Error(
            `Anthropic stream error: ${typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg)}`
          );
        }
      } catch (err) {
        // Re-throw Anthropic errors, skip parse failures
        if (err instanceof Error && err.message.startsWith('Anthropic stream error')) {
          throw err;
        }
        // Silently skip unparseable lines (partial JSON, metadata)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Message Sanitizer (client-side, for building API requests)
// ---------------------------------------------------------------------------

/**
 * Sanitize messages for the Anthropic Messages API.
 *
 * Enforces:
 *  1. Only 'user' and 'assistant' roles (never 'system')
 *  2. No empty content strings
 *  3. First message must be 'user'
 *  4. Strict user/assistant alternation (merges consecutive same-role)
 */
export function sanitizeMessagesForClaude(
  raw: { role: string; content: unknown }[],
): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(raw)) return [];

  // Step 1: Keep only valid roles with non-empty string content
  const filtered: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content =
      typeof m.content === 'string'
        ? m.content
        : m.content != null
          ? String(m.content)
          : '';
    if (content.trim() === '') continue;
    filtered.push({ role: m.role as 'user' | 'assistant', content: content.trim() });
  }

  // Step 2: Drop leading assistant messages
  let start = 0;
  while (start < filtered.length && filtered[start].role !== 'user') {
    start++;
  }
  const trimmed = filtered.slice(start);

  // Step 3: Merge consecutive same-role messages
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of trimmed) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += '\n\n' + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }

  return merged;
}
