/**
 * Fleet Status Aggregator
 *
 * GET /api/fleet/status
 * Calls /health on local Multi-Fleet daemon and reshapes for UI consumption:
 *   { nodes: [{ id, healthy, score, broken_channels }], cascade_mode, total_active }
 * Returns { ok: false, error, details } on daemon-down (HTTP 200, UI graceful).
 */

import { NextResponse } from 'next/server';

const FLEET_DAEMON_URL = 'http://127.0.0.1:8855/health';
const TIMEOUT_MS = 3000;

interface ChannelHealthEntry {
  score?: string;
  broken?: string[];
}

export async function GET() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(FLEET_DAEMON_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: 'fleet daemon unreachable',
        details: `HTTP ${response.status}`,
      });
    }

    const health = await response.json();
    const channelHealth = (health?.channel_health ?? {}) as Record<string, ChannelHealthEntry>;

    const nodes = Object.entries(channelHealth).map(([id, entry]) => {
      const broken = Array.isArray(entry?.broken) ? entry.broken : [];
      return {
        id,
        healthy: broken.length === 0,
        score: entry?.score ?? 'unknown',
        broken_channels: broken,
      };
    });

    return NextResponse.json({
      ok: true,
      self: health?.nodeId ?? null,
      nodes,
      cascade_mode: health?.cascade?.mode ?? 'unknown',
      total_active: health?.activeSessions ?? 0,
    });
  } catch (error) {
    clearTimeout(timer);
    return NextResponse.json({
      ok: false,
      error: 'fleet daemon unreachable',
      details: String(error),
    });
  }
}
