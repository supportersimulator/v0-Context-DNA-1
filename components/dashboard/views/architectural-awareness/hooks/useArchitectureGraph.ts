'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { type Node, type Edge } from '@xyflow/react';
import type {
  ArchitectureGraph,
  ArchitectureStats,
  ArchNodeData,
  ReactFlowNode,
  ReactFlowEdge,
  WSMessage
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_HELPER_API_URL || 'http://127.0.0.1:8080';
const WS_BASE = API_BASE.replace('http', 'ws');

type ArchNode = Node<ArchNodeData>;
type ArchEdge = Edge;

interface UseArchitectureGraphResult {
  nodes: ArchNode[];
  edges: ArchEdge[];
  stats: ArchitectureStats | null;
  loading: boolean;
  error: string | null;
  connected: boolean;
  changedNodes: string[];
  refetch: (forceRebuild?: boolean) => Promise<void>;
  focusNode: (nodeId: string) => void;
}

// Helper to deduplicate edges by ID
function deduplicateEdges(edges: ArchEdge[]): ArchEdge[] {
  const seen = new Map<string, ArchEdge>();
  edges.forEach((edge, index) => {
    // Ensure each edge has a unique ID
    const id = edge.id || `edge_${edge.source}_${edge.target}_${index}`;
    if (!seen.has(id)) {
      seen.set(id, { ...edge, id });
    }
  });
  return Array.from(seen.values());
}

export function useArchitectureGraph(): UseArchitectureGraphResult {
  const [nodes, setNodes] = useState<ArchNode[]>([]);
  const [edges, setEdges] = useState<ArchEdge[]>([]);
  const [stats, setStats] = useState<ArchitectureStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [changedNodes, setChangedNodes] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3; // Stop trying after 3 failed attempts

  // Apply dagre layout to nodes
  const layoutNodes = useCallback((graphNodes: ReactFlowNode[], graphEdges: ReactFlowEdge[]): ArchNode[] => {
    // Simple vertical layout based on dependencies
    // TODO: Use dagre for better layout
    const nodeMap = new Map<string, ArchNode>();
    const inDegree = new Map<string, number>();

    // Initialize nodes
    graphNodes.forEach((node) => {
      inDegree.set(node.id, 0);
      nodeMap.set(node.id, {
        id: node.id,
        type: 'architectureNode',
        data: node.data as ArchNodeData,
        position: { x: 0, y: 0 },
      });
    });

    // Calculate in-degrees
    graphEdges.forEach(edge => {
      const current = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, current + 1);
    });

    // Sort by in-degree to create layers
    const sortedNodes = Array.from(nodeMap.values()).sort((a, b) => {
      const aIn = inDegree.get(a.id) || 0;
      const bIn = inDegree.get(b.id) || 0;
      return aIn - bIn;
    });

    // Apply positions
    const HORIZONTAL_SPACING = 280;
    const VERTICAL_SPACING = 100;
    const MAX_PER_ROW = 5;

    sortedNodes.forEach((node, index) => {
      const row = Math.floor(index / MAX_PER_ROW);
      const col = index % MAX_PER_ROW;
      node.position = {
        x: col * HORIZONTAL_SPACING + (row % 2) * (HORIZONTAL_SPACING / 2),
        y: row * VERTICAL_SPACING,
      };
    });

    return sortedNodes;
  }, []);

  // Fetch graph data
  const fetchGraph = useCallback(async (forceRebuild = false) => {
    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/api/architecture/graph?force_rebuild=${forceRebuild}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.graph) {
        const layoutedNodes = layoutNodes(data.graph.nodes, data.graph.edges);
        setNodes(layoutedNodes);
        const mappedEdges = data.graph.edges.map((edge: ReactFlowEdge, index: number) => ({
          ...edge,
          id: edge.id || `edge_${edge.source}_${edge.target}_${index}`,
          type: edge.animated ? 'smoothstep' : 'default',
        }));
        setEdges(deduplicateEdges(mappedEdges));
        setStats(data.stats);
        setChangedNodes(data.changed_nodes || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch architecture graph');
    } finally {
      setLoading(false);
    }
  }, [layoutNodes]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      // Stop trying after max attempts to avoid console spam
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.log('[Architecture WS] Max reconnection attempts reached, staying offline');
        return;
      }

      try {
        const ws = new WebSocket(`${WS_BASE}/ws/architecture`);

        ws.onopen = () => {
          console.log('[Architecture WS] Connected');
          setConnected(true);
          setError(null);
          reconnectAttemptsRef.current = 0; // Reset on successful connection
        };

        ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data);

            if (message.event === 'graph_update') {
              // Refetch on graph updates
              const updateData = message.data as { type: string; changed_nodes: string[] };
              if (updateData?.changed_nodes) {
                setChangedNodes(updateData.changed_nodes);
              }
              fetchGraph(false);
            } else if (message.event === 'graph_data') {
              // Direct graph data
              const graphData = message.data as ArchitectureGraph;
              if (graphData) {
                const layoutedNodes = layoutNodes(graphData.nodes as ReactFlowNode[], graphData.edges as ReactFlowEdge[]);
                setNodes(layoutedNodes);
                const mappedEdges = graphData.edges.map((edge: ReactFlowEdge, index: number) => ({
                  id: edge.id || `edge_${edge.source}_${edge.target}_${index}`,
                  source: edge.source,
                  target: edge.target,
                  type: edge.animated ? 'smoothstep' : 'default',
                  data: edge.data,
                  animated: edge.animated,
                }));
                setEdges(deduplicateEdges(mappedEdges));
              }
            }
          } catch (err) {
            console.error('[Architecture WS] Parse error:', err);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          reconnectAttemptsRef.current++;

          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            // Reconnect after delay with exponential backoff
            const delay = Math.min(5000 * reconnectAttemptsRef.current, 30000);
            reconnectTimeoutRef.current = setTimeout(connectWebSocket, delay);
          }
        };

        ws.onerror = () => {
          // Silently handle - onclose will be called after this
          ws.close();
        };

        wsRef.current = ws;
      } catch (err) {
        reconnectAttemptsRef.current++;
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
        }
      }
    };

    // Initial fetch
    fetchGraph();

    // Connect WebSocket
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchGraph, layoutNodes]);

  // Focus on a specific node
  const focusNode = useCallback((nodeId: string) => {
    setChangedNodes([nodeId]);
    // Node animation will be handled by the graph component
  }, []);

  return {
    nodes,
    edges,
    stats,
    loading,
    error,
    connected,
    changedNodes,
    refetch: fetchGraph,
    focusNode,
  };
}
