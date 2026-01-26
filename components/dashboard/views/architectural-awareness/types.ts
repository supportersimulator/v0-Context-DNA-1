/**
 * Types for Architectural Awareness System
 */

export type ArchNodeData = {
  label: string;
  nodeType: string;
  category: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  metadata: Record<string, unknown>;
  color: string;
  isHighlighted?: boolean;
  [key: string]: unknown;
};

export type ArchEdgeData = {
  edgeType: string;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
};

export interface ReactFlowNode {
  id: string;
  type: string;
  data: ArchNodeData;
  position: { x: number; y: number };
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  data: ArchEdgeData;
  animated: boolean;
}

export interface ArchitectureGraph {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

export interface ArchitectureStats {
  total_nodes: number;
  total_edges: number;
  node_types: Record<string, number>;
  edge_types: Record<string, number>;
  categories: Record<string, number>;
}

export interface ArchitectureResponse {
  success: boolean;
  graph: ArchitectureGraph;
  stats: ArchitectureStats;
  version: string;
  timestamp: string;
  changed_nodes: string[];
}

export interface ArchitectureSubgraphResponse {
  success: boolean;
  center_node: string;
  depth: number;
  graph: ArchitectureGraph;
  stats: ArchitectureStats;
}

export interface WSMessage {
  event: string;
  data?: unknown;
  message?: string;
  available?: boolean;
}

// Node type colors matching the backend
export const NODE_COLORS: Record<string, string> = {
  Infrastructure: '#3b82f6',  // Blue
  Voice_Pipeline: '#8b5cf6', // Purple
  Frontend: '#22c55e',       // Green
  Backend: '#f97316',        // Orange
  Memory_System: '#eab308',  // Yellow
  Protocols: '#ec4899',      // Pink
  Gotchas: '#ef4444',        // Red
  General: '#6b7280',        // Gray
};

// Node type icons
export const NODE_TYPE_ICONS: Record<string, string> = {
  file: '📄',
  class: '🏛️',
  function: '⚡',
  service: '🔧',
  component: '🧩',
  module: '📦',
  api_route: '🌐',
  helper: '🛠️',
  hook: '🪝',
  constant: '📌',
};
