/**
 * VitalSigns aggregator (Round-4 D3, 2026-05-04)
 *
 * GET /api/vitals
 *
 * Single-shot reshape of the multi-fleet daemon /health envelope into a tight
 * "vital signs" payload for the dockview header strip. Frontend pulls this
 * every 5s while EventBridge pushes pulse heartbeats over SSE — together they
 * keep the bar visibly LIVE without each consumer parsing the 5KB daemon
 * payload itself.
 *
 * Daemon source: http://127.0.0.1:8855/health
 *
 * Response shape (always HTTP 200; ok=false when daemon is unreachable):
 *   {
 *     ok: boolean,
 *     events_recorded: number,        // total active sessions tracked
 *     redis_status: 'ok'|'degraded'|'down'|'unknown',
 *     nats_status: 'connected'|'disconnected'|'unknown',
 *     uptime_seconds: number | null,
 *     node_id: string,
 *     peer_count: number,
 *     cascade_mode: string,           // e.g. 'L1' | 'L2' | …
 *     timestamp: string (ISO),
 *     error?: string,
 *   }
 */
import { NextResponse } from 'next/server';

import { append as logAppend } from '@/lib/log/buffer';

const FLEET_DAEMON_URL = 'http://127.0.0.1:8855/health';
const TIMEOUT_MS = 2500;

type RedisStatus = 'ok' | 'degraded' | 'down' | 'unknown';
type NatsStatus = 'connected' | 'disconnected' | 'unknown';

interface VitalSigns {
  ok: boolean;
  events_recorded: number;
  redis_status: RedisStatus;
  nats_status: NatsStatus;
  uptime_seconds: number | null;
  node_id: string;
  peer_count: number;
  cascade_mode: string;
  timestamp: string;
  error?: string;
}

function offlinePayload(error: string): VitalSigns {
  return {
    ok: false,
    events_recorded: 0,
    redis_status: 'unknown',
    nats_status: 'unknown',
    uptime_seconds: null,
    node_id: 'unknown',
    peer_count: 0,
    cascade_mode: 'unknown',
    timestamp: new Date().toISOString(),
    error,
  };
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
      return NextResponse.json(offlinePayload(`HTTP ${response.status}`));
    }

    const h = (await response.json()) as Record<string, unknown>;
    const cluster = (h.cluster_state ?? {}) as Record<string, unknown>;
    const redis = (h.redis ?? cluster.redis ?? {}) as Record<string, unknown>;

    const nats: NatsStatus =
      cluster.status === 'connected' || h.transport === 'nats'
        ? 'connected'
        : cluster.status === 'disconnected'
          ? 'disconnected'
          : 'unknown';

    const redisStatus: RedisStatus = (() => {
      const raw = redis.status ?? h.redis_status;
      if (raw === 'ok' || raw === 'connected' || raw === 'healthy') return 'ok';
      if (raw === 'degraded') return 'degraded';
      if (raw === 'down' || raw === 'disconnected' || raw === 'error') return 'down';
      return 'unknown';
    })();

    const peers = h.peers as Record<string, unknown> | undefined;
    const peerCount = peers ? Object.keys(peers).length : 0;

    const cascade = (h.cascade ?? {}) as Record<string, unknown>;

    const payload: VitalSigns = {
      ok: true,
      events_recorded: typeof h.activeSessions === 'number' ? h.activeSessions : 0,
      redis_status: redisStatus,
      nats_status: nats,
      uptime_seconds:
        typeof h.uptime_s === 'number'
          ? h.uptime_s
          : typeof h.uptime_seconds === 'number'
            ? h.uptime_seconds
            : null,
      node_id: (h.nodeId as string) ?? (h.node_id as string) ?? 'unknown',
      peer_count: peerCount,
      cascade_mode: (cascade.mode as string) ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(payload);
  } catch (error) {
    clearTimeout(timer);
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: 'vitals',
        msg: 'fleet daemon unreachable',
        detail: ((error as Error)?.stack || String(error)).slice(0, 500),
      });
    } catch {
      /* noop */
    }
    return NextResponse.json(offlinePayload(String(error)));
  }
}
