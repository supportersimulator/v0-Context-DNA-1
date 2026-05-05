'use client';

// =============================================================================
// VitalSignsBar — dockview header LIVE strip (Round-4 D3, 2026-05-04)
//
// First stranger-demo beat: at a glance, anyone landing on the IDE sees the
// fleet is alive — events_recorded counter ticking, Redis/NATS pills lit,
// uptime climbing. Pulses the EventBridge SSE on each fleet/surgeon event so
// the bar feels live between 5s vital pulls.
//
// Polls /api/vitals every 5s (which proxies the multi-fleet daemon at
// 127.0.0.1:8855/health) and listens to the IDE event bus for SSE-driven
// pulses (fleet:event, surgeon:event, fleet:bridge-connected/disconnected).
// Renders inline-friendly so it slots into the DashboardShell header bar.
// =============================================================================

import { useEffect, useState } from 'react';
import { Activity, Database, Radio, Clock, Wifi, WifiOff } from 'lucide-react';
import useSWR from 'swr';
import { useIDEEvent } from '@/lib/ide/event-bus';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types — keep parallel to /api/vitals/route.ts
// ---------------------------------------------------------------------------
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

const fetcher = async (url: string): Promise<VitalSigns> => {
  const r = await fetch(url, { cache: 'no-store' });
  return r.json();
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtUptime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function statusDot(status: 'ok' | 'connected' | 'degraded' | 'disconnected' | 'down' | 'unknown') {
  switch (status) {
    case 'ok':
    case 'connected':
      return 'bg-emerald-500';
    case 'degraded':
      return 'bg-amber-500';
    case 'down':
    case 'disconnected':
      return 'bg-red-500';
    default:
      return 'bg-zinc-500';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function VitalSignsBar({ className }: { className?: string }) {
  // Poll the aggregator every 5s. SWR dedupes across mounts.
  const { data } = useSWR<VitalSigns>('/api/vitals', fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: true,
    dedupingInterval: 2_500,
  });

  // SSE-driven pulse: every fleet event flips a class for ~600ms so the bar
  // visibly throbs when the EventBridge is alive. This is the primary signal
  // that consumes Round-3 C2's EventBridge wiring.
  const [pulse, setPulse] = useState(false);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [livePulses, setLivePulses] = useState(0);

  useIDEEvent('fleet:event', () => {
    setPulse(true);
    setLivePulses((n) => n + 1);
  });
  useIDEEvent('surgeon:event', () => {
    setPulse(true);
    setLivePulses((n) => n + 1);
  });
  useIDEEvent('fleet:bridge-connected', () => {
    setBridgeOnline(true);
  });
  useIDEEvent('fleet:bridge-disconnected', () => {
    setBridgeOnline(false);
  });

  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 600);
    return () => clearTimeout(t);
  }, [pulse]);

  const ok = !!data?.ok;
  const events = data?.events_recorded ?? 0;
  const uptime = fmtUptime(data?.uptime_seconds ?? null);
  const redis = data?.redis_status ?? 'unknown';
  const nats = data?.nats_status ?? 'unknown';
  const node = data?.node_id ?? '—';
  const peers = data?.peer_count ?? 0;
  const mode = data?.cascade_mode ?? 'unknown';

  return (
    <div
      data-testid="vital-signs-bar"
      className={cn(
        'flex items-center gap-3 px-3 py-1 rounded-md text-[11px] font-mono',
        'bg-background/40 border border-border/60 transition-shadow',
        pulse && 'shadow-[0_0_8px_rgba(34,197,94,0.55)]',
        !ok && 'opacity-70',
        className,
      )}
      title={`fleet daemon ${ok ? 'online' : 'offline'} · ${node} · pulses ${livePulses}`}
    >
      {/* Events recorded — the headline counter */}
      <span className="flex items-center gap-1 text-foreground/90">
        <Activity className={cn('w-3 h-3', pulse && 'text-emerald-400 animate-pulse')} />
        <span className="text-muted-foreground">events</span>
        <span className="tabular-nums font-semibold">{events.toLocaleString()}</span>
      </span>

      {/* Redis pill */}
      <span className="flex items-center gap-1 text-muted-foreground">
        <Database className="w-3 h-3" />
        <span>redis</span>
        <span className={cn('w-1.5 h-1.5 rounded-full', statusDot(redis))} />
      </span>

      {/* NATS pill */}
      <span className="flex items-center gap-1 text-muted-foreground">
        <Radio className="w-3 h-3" />
        <span>nats</span>
        <span className={cn('w-1.5 h-1.5 rounded-full', statusDot(nats))} />
      </span>

      {/* Bridge (SSE) status */}
      <span className="flex items-center gap-1 text-muted-foreground" title="EventBridge SSE">
        {bridgeOnline ? (
          <Wifi className="w-3 h-3 text-emerald-400" />
        ) : (
          <WifiOff className="w-3 h-3 text-zinc-500" />
        )}
        <span className="tabular-nums">{livePulses}</span>
      </span>

      {/* Uptime */}
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span className="tabular-nums">{uptime}</span>
      </span>

      {/* Self-node + peer count + cascade mode */}
      <span className="flex items-center gap-1 text-muted-foreground/80">
        <span className="text-foreground/80">{node}</span>
        <span>·</span>
        <span>{peers} peers</span>
        <span>·</span>
        <span className="uppercase">{mode}</span>
      </span>
    </div>
  );
}

export default VitalSignsBar;
