'use client';

// =============================================================================
// useFleetHealth — SWR hook polling fleet daemon /health every 5s
// Returns node status, channel info, chief reachability, and loading state
// =============================================================================

import useSWR from 'swr';
import { fetchFleetHealth, fetchFleetDashboard } from '@/lib/api/fleet';
import type { FleetHealth, FleetDashboard, FleetNode, FleetChannel, FleetChief } from '@/lib/api/fleet';

export function useFleetHealth() {
  const { data: health, error: healthError } = useSWR<FleetHealth>(
    'fleet-health',
    fetchFleetHealth,
    {
      refreshInterval: 5_000,
      revalidateOnFocus: true,
      dedupingInterval: 3_000,
    },
  );

  const { data: dashboard, error: dashError } = useSWR<FleetDashboard>(
    'fleet-dashboard',
    fetchFleetDashboard,
    {
      refreshInterval: 5_000,
      revalidateOnFocus: true,
      dedupingInterval: 3_000,
    },
  );

  const nodes: FleetNode[] = dashboard?.nodes ?? [];
  const channels: FleetChannel[] = health?.channels ?? dashboard?.channels ?? [];
  const chief: FleetChief = dashboard?.chief ?? { reachable: false };
  const natsConnected: boolean = health?.nats_connected ?? false;
  const selfNodeId: string = health?.node_id ?? 'unknown';
  const selfStatus = health?.status ?? 'unknown';
  const peers: string[] = health?.peers ?? [];

  const isLoading = (!health && !healthError) || (!dashboard && !dashError);
  const error = healthError?.message ?? dashError?.message ?? null;

  return {
    /** All fleet nodes from dashboard */
    nodes,
    /** Communication channels with priority and status */
    channels,
    /** Chief relay reachability */
    chief,
    /** Whether local NATS is connected */
    natsConnected,
    /** This node's ID */
    selfNodeId,
    /** This node's overall status */
    selfStatus,
    /** Connected peer node IDs */
    peers,
    /** True while initial fetch is in-flight */
    isLoading,
    /** Error message if fetch failed */
    error,
  };
}
