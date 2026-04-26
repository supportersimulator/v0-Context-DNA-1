'use client';

// =============================================================================
// FleetPanel — Multi-fleet node grid with status dots, NATS indicator,
// channel health, and last-seen timestamps.
// =============================================================================

import { cn } from '@/lib/utils';
import { useFleetHealth } from '@/lib/hooks/use-fleet-health';
import { Loader2, Radio, Wifi, WifiOff, Server, Crown } from 'lucide-react';
import type { FleetNode, FleetChannel, NodeStatus, ChannelStatus } from '@/lib/api/fleet';

// ---------------------------------------------------------------------------
// Status color helpers
// ---------------------------------------------------------------------------

function nodeStatusColor(status: NodeStatus): string {
  switch (status) {
    case 'online':
      return 'bg-emerald-500';
    case 'degraded':
      return 'bg-amber-500';
    case 'offline':
      return 'bg-red-500';
    default:
      return 'bg-zinc-500';
  }
}

function channelStatusColor(status: ChannelStatus): string {
  switch (status) {
    case 'connected':
      return 'text-emerald-500';
    case 'degraded':
      return 'text-amber-500';
    case 'disconnected':
      return 'text-red-500';
    default:
      return 'text-zinc-500';
  }
}

function formatLastSeen(ts: string | null): string {
  if (!ts) return 'never';
  try {
    const d = new Date(ts);
    const now = Date.now();
    const diffS = Math.floor((now - d.getTime()) / 1000);
    if (diffS < 60) return `${diffS}s ago`;
    if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
    if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeCard({ node, isSelf }: { node: FleetNode; isSelf: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2',
        'bg-card text-card-foreground',
        isSelf && 'ring-1 ring-primary/40',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full shrink-0',
              nodeStatusColor(node.status),
            )}
          />
          <span className="text-sm font-medium">
            {node.node_id}
            {isSelf && (
              <span className="ml-1 text-[10px] text-muted-foreground">(you)</span>
            )}
          </span>
        </div>
        <Server className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div className="text-[11px] text-muted-foreground">
        Last seen: {formatLastSeen(node.last_seen)}
      </div>

      {node.channels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.channels.map((ch) => (
            <span
              key={ch.name}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono',
                'bg-muted/50',
                channelStatusColor(ch.status),
              )}
              title={`P${ch.priority} ${ch.name}: ${ch.status}`}
            >
              P{ch.priority} {ch.name}
            </span>
          ))}
        </div>
      )}

      {node.latency_ms != null && (
        <div className="text-[10px] text-muted-foreground">
          Latency: {node.latency_ms}ms
        </div>
      )}
    </div>
  );
}

function ChannelList({ channels }: { channels: FleetChannel[] }) {
  const sorted = [...channels].sort((a, b) => a.priority - b.priority);
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground mb-1">Channels</div>
      {sorted.map((ch) => (
        <div
          key={ch.name}
          className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/30"
        >
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full shrink-0',
                ch.status === 'connected'
                  ? 'bg-emerald-500'
                  : ch.status === 'degraded'
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
            />
            <span className="font-mono">P{ch.priority}</span>
            <span>{ch.name}</span>
          </span>
          <span className="text-muted-foreground">{ch.status}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function FleetPanel() {
  const {
    nodes,
    channels,
    chief,
    natsConnected,
    selfNodeId,
    selfStatus,
    peers,
    isLoading,
    error,
  } = useFleetHealth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Connecting to fleet daemon...</span>
      </div>
    );
  }

  const hasNodes = nodes.length > 0;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground">Multi-Fleet</h2>
          <p className="text-[11px] text-muted-foreground">
            {selfNodeId !== 'unknown' ? selfNodeId : 'Daemon unreachable'}
            {peers.length > 0 && ` + ${peers.length} peer${peers.length > 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* NATS indicator */}
          <div
            className={cn(
              'flex items-center gap-1 text-[11px] font-medium',
              natsConnected ? 'text-emerald-500' : 'text-red-500',
            )}
            title={natsConnected ? 'NATS connected' : 'NATS disconnected'}
          >
            {natsConnected ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            NATS
          </div>

          {/* Chief indicator */}
          <div
            className={cn(
              'flex items-center gap-1 text-[11px] font-medium',
              chief.reachable ? 'text-emerald-500' : 'text-zinc-500',
            )}
            title={chief.reachable ? 'Chief reachable' : 'Chief unreachable'}
          >
            <Crown className="h-3.5 w-3.5" />
            Chief
          </div>

          {/* Self status dot */}
          <span
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              nodeStatusColor(selfStatus),
            )}
            title={`Self: ${selfStatus}`}
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-xs px-3 py-2">
          Fleet daemon error: {error}
        </div>
      )}

      {/* Node grid */}
      {hasNodes ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {nodes.map((node) => (
            <NodeCard
              key={node.node_id}
              node={node}
              isSelf={node.node_id === selfNodeId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Radio className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No fleet nodes discovered</p>
          <p className="text-[11px] mt-1">
            Ensure the fleet daemon is running on port 8855
          </p>
        </div>
      )}

      {/* Channel list */}
      {channels.length > 0 && <ChannelList channels={channels} />}
    </div>
  );
}
