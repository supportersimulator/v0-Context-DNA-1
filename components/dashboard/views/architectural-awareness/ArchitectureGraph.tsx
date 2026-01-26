'use client';

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { ArchitectureNode } from './ArchitectureNode';
import { useArchitectureGraph } from './hooks/useArchitectureGraph';
import { NODE_COLORS, type ArchNodeData } from './types';
import { cn } from '@/lib/utils';
import { Loader2, RefreshCw, Wifi, WifiOff, AlertCircle } from 'lucide-react';

// Node types for React Flow
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = {
  architectureNode: ArchitectureNode as any,
};

type ArchNode = Node<ArchNodeData>;

interface ArchitectureGraphProps {
  className?: string;
  onNodeClick?: (nodeId: string, data: ArchNodeData) => void;
}

export function ArchitectureGraph({ className, onNodeClick }: ArchitectureGraphProps) {
  const {
    nodes: fetchedNodes,
    edges: fetchedEdges,
    stats,
    loading,
    error,
    connected,
    changedNodes,
    refetch,
  } = useArchitectureGraph();

  const [nodes, setNodes, onNodesChange] = useNodesState<ArchNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Update nodes when fetched
  useEffect(() => {
    if (fetchedNodes.length > 0) {
      // Mark changed nodes for highlighting
      const processedNodes = fetchedNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          isHighlighted: changedNodes.includes(node.id),
        },
      }));
      setNodes(processedNodes);
    }
  }, [fetchedNodes, changedNodes, setNodes]);

  useEffect(() => {
    if (fetchedEdges.length > 0) {
      setEdges(fetchedEdges);
    }
  }, [fetchedEdges, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: ArchNode) => {
      if (onNodeClick && node.data) {
        onNodeClick(node.id, node.data);
      }
    },
    [onNodeClick]
  );

  // Category colors for minimap
  const nodeColor = useCallback((node: ArchNode) => {
    return node.data?.color || NODE_COLORS.General;
  }, []);

  if (loading && nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-background/50', className)}>
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm">Loading architecture graph...</span>
        </div>
      </div>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full bg-background/50', className)}>
        <div className="flex flex-col items-center gap-3 text-destructive">
          <AlertCircle className="w-8 h-8" />
          <span className="text-sm">{error}</span>
          <button
            onClick={() => refetch(true)}
            className="text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative h-full', className)}>
      {/* Status Bar */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium',
            connected
              ? 'bg-green-500/20 text-green-600 dark:text-green-400'
              : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
          )}
        >
          {connected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          {connected ? 'Live' : 'Offline'}
        </div>

        {stats && (
          <div className="bg-muted/80 px-2 py-1 rounded text-[10px] text-muted-foreground">
            {stats.total_nodes} nodes · {stats.total_edges} edges
          </div>
        )}

        <button
          onClick={() => refetch(false)}
          className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh graph"
          disabled={loading}
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
        />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          className="!bg-background !border-border !shadow-sm"
        />
        <MiniMap
          nodeColor={nodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-background/80 !border-border"
        />
      </ReactFlow>

      {/* Changed Nodes Indicator */}
      {changedNodes.length > 0 && (
        <div className="absolute bottom-2 left-2 z-10 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-1 rounded text-[10px]">
          {changedNodes.length} node{changedNodes.length > 1 ? 's' : ''} changed
        </div>
      )}
    </div>
  );
}
