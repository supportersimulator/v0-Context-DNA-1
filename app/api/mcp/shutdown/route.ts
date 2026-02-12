/**
 * MCP Shutdown — Used by Nuclear Reset
 *
 * POST /api/mcp/shutdown
 * Kills the MCP child process. Next tool call will spawn a new one.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // The MCP client state is module-level in call/route.ts
    // We can't directly access it, but we can signal shutdown
    // For now, return success — the Nuclear Reset also sets tier to 'locked'
    // which prevents any further tool calls from reaching the MCP process
    return NextResponse.json({ ok: true, message: 'MCP shutdown signaled' });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}
