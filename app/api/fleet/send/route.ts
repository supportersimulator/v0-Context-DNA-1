/**
 * Fleet Message Send Proxy
 *
 * POST /api/fleet/send
 * Body: { type: string, to: string, payload: object }
 * Forwards to local Multi-Fleet daemon at http://127.0.0.1:8855/message.
 * Validates body shape (400 on invalid input).
 * 5s timeout — daemon's send_with_fallback can chain channels.
 */

import { NextRequest, NextResponse } from 'next/server';

const FLEET_DAEMON_URL = 'http://127.0.0.1:8855/message';
const TIMEOUT_MS = 5000;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON body' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'body must be a JSON object' },
      { status: 400 }
    );
  }

  const { type, to, payload } = body as Record<string, unknown>;

  if (typeof type !== 'string' || !type) {
    return NextResponse.json(
      { error: "missing or invalid 'type' field" },
      { status: 400 }
    );
  }
  if (typeof to !== 'string' || !to) {
    return NextResponse.json(
      { error: "missing or invalid 'to' field" },
      { status: 400 }
    );
  }
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json(
      { error: "missing or invalid 'payload' object" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(FLEET_DAEMON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, to, payload }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    clearTimeout(timer);
    return NextResponse.json(
      {
        delivered: false,
        error: 'fleet daemon unreachable',
        details: String(error),
      },
      { status: 502 }
    );
  }
}
