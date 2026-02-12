/**
 * MCP Tool Call Proxy — stdio Bridge
 *
 * Spawns DesktopCommanderMCP as a child process and forwards tool calls
 * from the browser via HTTP → stdio MCP protocol.
 *
 * Singleton: one MCP process is shared across all requests.
 * Auto-reconnects on crash.
 *
 * POST /api/mcp/call
 * Body: { tool: string, arguments: Record<string, unknown> }
 * Returns: { ok: boolean, result?: unknown, error?: string }
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// MCP Client Singleton (lazy-initialized)
// ---------------------------------------------------------------------------

interface MCPClientState {
  client: any;
  transport: any;
  connected: boolean;
  connecting: boolean;
}

let _state: MCPClientState | null = null;

async function getMCPClient(): Promise<MCPClientState> {
  if (_state?.connected) return _state;
  if (_state?.connecting) {
    // Wait for in-progress connection
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (_state?.connected) return _state;
    throw new Error('MCP connection in progress, try again');
  }

  _state = { client: null, transport: null, connected: false, connecting: true };

  try {
    // Dynamic imports for MCP SDK (server-side only)
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@anthropic/desktop-commander-mcp'],
    });

    const client = new Client({
      name: 'contextdna-ide',
      version: '1.0.0',
    });

    await client.connect(transport);

    _state = { client, transport, connected: true, connecting: false };

    // Handle process exit — mark disconnected for auto-reconnect
    transport.onclose = () => {
      if (_state) {
        _state.connected = false;
        _state.connecting = false;
      }
    };

    return _state;
  } catch (e) {
    _state = null;
    throw new Error(`Failed to connect to DesktopCommanderMCP: ${String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// POST /api/mcp/call — Execute an MCP tool
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tool, arguments: args } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Missing required field: tool (string)' },
        { status: 400 },
      );
    }

    const { client } = await getMCPClient();

    const result = await client.callTool({
      name: tool,
      arguments: args ?? {},
    });

    // MCP tool results have { content: Array<{ type, text }>, isError? }
    const isError = result.isError === true;
    const text = result.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');

    return NextResponse.json({
      ok: !isError,
      result: isError ? undefined : text,
      error: isError ? text : undefined,
      raw: result.content,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
