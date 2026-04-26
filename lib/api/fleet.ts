// =============================================================================
// Fleet API client — bridges to fleet daemon on 127.0.0.1:8855
//
// Endpoints:
//   GET /health         — node health, channel status, peer connectivity
//   GET /dashboard/json — full dashboard with all nodes, channels, chief status
// =============================================================================

import { API_BASE } from './types';

const BASE = API_BASE.fleet;
const TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChannelStatus = 'connected' | 'degraded' | 'disconnected' | 'unknown';
export type NodeStatus = 'online' | 'degraded' | 'offline' | 'unknown';

export interface FleetChannel {
  name: string;
  priority: number;
  status: ChannelStatus;
  last_success?: string | null;
}

export interface FleetNode {
  node_id: string;
  status: NodeStatus;
  last_seen: string | null;
  channels: FleetChannel[];
  /** Latency to this node in ms (if available) */
  latency_ms?: number | null;
}

export interface FleetChief {
  reachable: boolean;
  url?: string;
  last_check?: string | null;
}

export interface FleetHealth {
  node_id: string;
  status: NodeStatus;
  uptime_seconds?: number;
  nats_connected: boolean;
  peers: string[];
  channels: FleetChannel[];
  timestamp: string;
}

export interface FleetDashboard {
  nodes: FleetNode[];
  channels: FleetChannel[];
  chief: FleetChief;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Fetch functions
// ---------------------------------------------------------------------------

export async function fetchFleetHealth(): Promise<FleetHealth> {
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const raw = await res.json();
    // Daemon returns camelCase — map to snake_case for frontend types
    return {
      node_id: raw.nodeId ?? raw.node_id ?? 'unknown',
      status: raw.status === 'ok' ? 'online' : raw.status ?? 'unknown',
      uptime_seconds: raw.uptime_s ?? raw.uptime_seconds,
      nats_connected: raw.cluster_state?.status === 'connected' || raw.transport === 'nats',
      peers: raw.peers ? Object.keys(raw.peers) : [],
      channels: Object.entries(raw.channel_reliability?.all ?? {}).map(
        ([name, data]: [string, any]) => ({
          name: name.replace(/^P\d_/, ''),
          priority: name.length > 1 && name[1] >= '0' && name[1] <= '9' ? parseInt(name[1]) : 1,
          status: (data.success_rate > 0.8 ? 'connected' : data.success_rate > 0 ? 'degraded' : 'disconnected') as ChannelStatus,
        }),
      ),
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      node_id: 'unknown',
      status: 'unknown',
      nats_connected: false,
      peers: [],
      channels: [],
      timestamp: new Date().toISOString(),
    };
  }
}

export async function fetchFleetDashboard(): Promise<FleetDashboard> {
  try {
    const res = await fetch(`${BASE}/dashboard/json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } catch {
    return {
      nodes: [],
      channels: [],
      chief: { reachable: false },
      timestamp: new Date().toISOString(),
    };
  }
}
