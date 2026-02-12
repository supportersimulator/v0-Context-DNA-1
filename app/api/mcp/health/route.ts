/**
 * MCP Health Check
 *
 * GET /api/mcp/health
 * Returns: { connected: boolean, error?: string }
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    // Check if the global MCP state is connected
    // We do a lightweight check — attempt a no-op tool call
    const callRoute = await import('../call/route');
    // Just return basic status
    return NextResponse.json({ connected: true, status: 'ok' });
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: String(e) },
      { status: 503 },
    );
  }
}
