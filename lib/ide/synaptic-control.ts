// =============================================================================
// synaptic-control.ts — Synaptic (Local LLM) → MCP Tool Routing
//
// Parses tool_call output from local LLM (Qwen3-14B, etc.) and routes
// through CapabilityBus with sourcePanel='synaptic'. The PermissionGuard
// automatically applies the 'security.synapticTier' tier, which is always
// <= the user's own tier.
//
// Flow:
//   LLM output → parseSynapticToolCalls() → executeSynapticToolCall()
//   → CapabilityBus.dispatchAction({ sourcePanel: 'synaptic' })
//   → PermissionGuard checks synapticTier
//   → MCPClientBridge → /api/mcp/call → DesktopCommanderMCP
// =============================================================================

import { getCapabilityBus, type ActionResult } from './capability-bus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SynapticToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  reasoning?: string;  // optional thinking chain from LLM
}

export interface SynapticToolResult {
  toolCall: SynapticToolCall;
  result: ActionResult;
  formattedResponse: string;  // human-readable for chat display
}

// ---------------------------------------------------------------------------
// Parse tool calls from LLM output
// ---------------------------------------------------------------------------

/**
 * Extracts tool_call blocks from local LLM output.
 *
 * Supports multiple formats:
 *   1. JSON code blocks:  ```json\n{"tool":"read_file","arguments":{...}}\n```
 *   2. tool_call tags:    <tool_call>{"tool":"read_file","arguments":{...}}</tool_call>
 *   3. function_call:     {"function_call":{"name":"read_file","arguments":{...}}}
 */
export function parseSynapticToolCalls(llmOutput: string): SynapticToolCall[] {
  const calls: SynapticToolCall[] = [];

  // Pattern 1: JSON code blocks containing tool calls
  const codeBlockRegex = /```(?:json)?\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(llmOutput)) !== null) {
    const parsed = tryParseToolCall(match[1]);
    if (parsed) calls.push(parsed);
  }

  // Pattern 2: <tool_call> tags
  const tagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  while ((match = tagRegex.exec(llmOutput)) !== null) {
    const parsed = tryParseToolCall(match[1]);
    if (parsed) calls.push(parsed);
  }

  // Pattern 3: function_call wrapper
  const fnCallRegex = /\{"function_call"\s*:\s*(\{[\s\S]*?\})\}/g;
  while ((match = fnCallRegex.exec(llmOutput)) !== null) {
    try {
      const fc = JSON.parse(match[1]);
      if (fc.name && typeof fc.name === 'string') {
        const args = typeof fc.arguments === 'string'
          ? JSON.parse(fc.arguments)
          : fc.arguments ?? {};
        calls.push({ tool: fc.name, arguments: args });
      }
    } catch { /* skip malformed */ }
  }

  // Deduplicate (same tool + same args = duplicate)
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.tool}:${JSON.stringify(c.arguments)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function tryParseToolCall(raw: string): SynapticToolCall | null {
  try {
    const obj = JSON.parse(raw);
    // Must have 'tool' or 'name' field
    const tool = obj.tool || obj.name;
    if (!tool || typeof tool !== 'string') return null;
    const args = obj.arguments || obj.params || {};
    return {
      tool,
      arguments: typeof args === 'object' ? args : {},
      reasoning: obj.reasoning || obj.thinking,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extract thinking chains from LLM output (Qwen3 <think> tags)
// ---------------------------------------------------------------------------

export function extractThinking(llmOutput: string): { response: string; thinking: string | null } {
  const thinkMatch = llmOutput.match(/<think>([\s\S]*?)<\/think>/);
  if (!thinkMatch) return { response: llmOutput, thinking: null };

  const thinking = thinkMatch[1].trim();
  const response = llmOutput.replace(/<think>[\s\S]*?<\/think>/, '').trim();
  return { response, thinking };
}

// ---------------------------------------------------------------------------
// Execute a single Synaptic tool call through CapabilityBus
// ---------------------------------------------------------------------------

export async function executeSynapticToolCall(
  toolCall: SynapticToolCall,
  conversationId?: string,
): Promise<SynapticToolResult> {
  const bus = getCapabilityBus();

  const result = await bus.dispatchAction({
    sourcePanel: conversationId ? `synaptic-${conversationId}` : 'synaptic',
    targetProvider: 'desktop-commander',
    actionId: toolCall.tool,
    params: toolCall.arguments,
  });

  // Format for chat display
  let formattedResponse: string;
  if (result.ok) {
    const text = typeof result.result === 'string'
      ? result.result
      : JSON.stringify(result.result, null, 2);
    // Truncate very long results for chat
    formattedResponse = text.length > 2000
      ? text.slice(0, 2000) + '\n... (truncated)'
      : text;
  } else {
    formattedResponse = `Error: ${result.error || 'Action failed'}`;
  }

  return {
    toolCall,
    result,
    formattedResponse,
  };
}

// ---------------------------------------------------------------------------
// Execute all tool calls from an LLM response (sequential)
// ---------------------------------------------------------------------------

export async function executeSynapticToolCalls(
  llmOutput: string,
  conversationId?: string,
): Promise<SynapticToolResult[]> {
  const calls = parseSynapticToolCalls(llmOutput);
  const results: SynapticToolResult[] = [];

  for (const call of calls) {
    const result = await executeSynapticToolCall(call, conversationId);
    results.push(result);
  }

  return results;
}
