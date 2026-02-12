'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Map,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Circle,
  ArrowRight,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MinimapNode {
  id: string;
  label: string;
  type: 'file' | 'function' | 'class' | 'component' | 'hook' | 'api' | 'service';
  x: number;
  y: number;
  connections: string[]; // IDs of connected nodes
  status: 'healthy' | 'warning' | 'error' | 'inactive';
  weight: number; // relative importance 1-10
}

// ---------------------------------------------------------------------------
// Mock data — Context DNA architecture minimap
// ---------------------------------------------------------------------------
function getMockNodes(): MinimapNode[] {
  return [
    // Core services
    { id: 'agent-svc', label: 'agent_service', type: 'service', x: 50, y: 20, connections: ['injection', 'scheduler', 'redis'], status: 'healthy', weight: 9 },
    { id: 'injection', label: 'injection/builder', type: 'service', x: 30, y: 40, connections: ['professor', 'evidence', 'sections'], status: 'healthy', weight: 10 },
    { id: 'scheduler', label: 'lite_scheduler', type: 'service', x: 70, y: 40, connections: ['historian', 'hindsight', 'meta'], status: 'healthy', weight: 8 },
    // Components
    { id: 'professor', label: 'professor.py', type: 'component', x: 15, y: 60, connections: ['qwen3'], status: 'healthy', weight: 7 },
    { id: 'evidence', label: 'evidence_pipeline', type: 'component', x: 45, y: 60, connections: ['observability'], status: 'healthy', weight: 8 },
    { id: 'sections', label: 'section_builder', type: 'component', x: 25, y: 55, connections: [], status: 'healthy', weight: 6 },
    { id: 'historian', label: 'session_historian', type: 'component', x: 60, y: 60, connections: ['evidence'], status: 'healthy', weight: 7 },
    { id: 'hindsight', label: 'hindsight_validator', type: 'component', x: 80, y: 60, connections: ['evidence', 'qwen3'], status: 'warning', weight: 6 },
    { id: 'meta', label: 'meta_analysis', type: 'component', x: 75, y: 55, connections: ['qwen3'], status: 'healthy', weight: 5 },
    // Infrastructure
    { id: 'redis', label: 'Redis (6379)', type: 'api', x: 85, y: 25, connections: [], status: 'healthy', weight: 7 },
    { id: 'qwen3', label: 'Qwen3-14B (5044)', type: 'api', x: 50, y: 80, connections: [], status: 'healthy', weight: 9 },
    { id: 'observability', label: 'observability_store', type: 'file', x: 40, y: 75, connections: [], status: 'healthy', weight: 5 },
    // Frontend
    { id: 'dockview', label: 'DockviewShell', type: 'component', x: 10, y: 15, connections: ['panel-factory'], status: 'healthy', weight: 8 },
    { id: 'panel-factory', label: 'panel-factory', type: 'file', x: 10, y: 35, connections: [], status: 'healthy', weight: 6 },
  ];
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
function nodeColor(type: MinimapNode['type']): string {
  switch (type) {
    case 'service': return '#22c55e';
    case 'component': return '#3b82f6';
    case 'api': return '#c678dd';
    case 'file': return '#e5c07b';
    case 'function': return '#ef4444';
    case 'class': return '#f97316';
    case 'hook': return '#06b6d4';
  }
}

function statusRing(status: MinimapNode['status']): string {
  switch (status) {
    case 'healthy': return '#22c55e';
    case 'warning': return '#e5c07b';
    case 'error': return '#ef4444';
    case 'inactive': return '#6b6b75';
  }
}

// ---------------------------------------------------------------------------
// MinimapPanel — main export
// ---------------------------------------------------------------------------
export function MinimapPanel() {
  const [nodes, setNodes] = useState<MinimapNode[]>([]);
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch from backend or use mock
    const fetchNodes = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/codebase/graph', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.nodes) setNodes(data.nodes);
          return;
        }
      } catch {
        // Fall through to mock
      }
      setNodes(getMockNodes());
    };
    fetchNodes();
  }, []);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1))), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(1))), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  // Connected nodes for highlighting
  const connectedIds = useMemo(() => {
    if (!hoveredNode && !selectedNode) return new Set<string>();
    const target = selectedNode ?? hoveredNode;
    const node = nodes.find((n) => n.id === target);
    if (!node) return new Set<string>();
    const ids = new Set(node.connections);
    ids.add(node.id);
    // Also include nodes that connect TO this node
    for (const n of nodes) {
      if (n.connections.includes(node.id)) ids.add(n.id);
    }
    return ids;
  }, [nodes, hoveredNode, selectedNode]);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedNode), [nodes, selectedNode]);

  // Legend entries
  const typeLabels: [MinimapNode['type'], string][] = [
    ['service', 'Services'],
    ['component', 'Components'],
    ['api', 'APIs'],
    ['file', 'Files'],
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Map className="w-3.5 h-3.5 text-[#e5c07b]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Minimap</span>
        <span className="text-[10px] text-[#6b6b75] ml-auto">{nodes.length} nodes</span>

        <button onClick={zoomOut} className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] text-[#6b6b75] w-8 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button onClick={resetZoom} className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]" title="Fit to View">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
        onClick={() => setSelectedNode(null)}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.2s' }}
        >
          {/* Connection lines (SVG) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
            {nodes.flatMap((node) =>
              node.connections.map((targetId) => {
                const target = nodes.find((n) => n.id === targetId);
                if (!target) return null;
                const highlighted =
                  connectedIds.size > 0 && connectedIds.has(node.id) && connectedIds.has(target.id);
                return (
                  <line
                    key={`${node.id}-${targetId}`}
                    x1={`${node.x}%`}
                    y1={`${node.y}%`}
                    x2={`${target.x}%`}
                    y2={`${target.y}%`}
                    stroke={highlighted ? '#22c55e' : '#2a2a35'}
                    strokeWidth={highlighted ? 1.5 : 0.5}
                    strokeDasharray={highlighted ? undefined : '4 2'}
                    opacity={connectedIds.size > 0 && !highlighted ? 0.15 : 0.6}
                  />
                );
              }),
            )}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const isHighlighted = connectedIds.size === 0 || connectedIds.has(node.id);
            const isSelected = selectedNode === node.id;
            const size = 6 + node.weight * 1.5;

            return (
              <div
                key={node.id}
                className="absolute flex flex-col items-center cursor-pointer transition-opacity"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: isHighlighted ? 1 : 0.2,
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={(e) => { e.stopPropagation(); setSelectedNode(node.id); }}
              >
                {/* Node circle */}
                <div
                  className="rounded-full border-2 transition-all"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: nodeColor(node.type),
                    borderColor: isSelected ? '#fff' : statusRing(node.status),
                    boxShadow: isSelected ? `0 0 8px ${nodeColor(node.type)}` : 'none',
                  }}
                />
                {/* Label */}
                <span
                  className="text-[8px] mt-0.5 whitespace-nowrap"
                  style={{ color: isHighlighted ? '#e5e5e5' : '#6b6b75' }}
                >
                  {node.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info bar / legend */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0">
        {selected ? (
          <div className="flex items-center gap-2 text-[10px]">
            <Circle className="w-3 h-3 flex-shrink-0" style={{ color: nodeColor(selected.type), fill: nodeColor(selected.type) }} />
            <span className="text-[#e5e5e5] font-medium">{selected.label}</span>
            <span className="text-[#6b6b75]">{selected.type}</span>
            <span className={`ml-auto ${selected.status === 'healthy' ? 'text-[#22c55e]' : selected.status === 'warning' ? 'text-[#e5c07b]' : 'text-[#ef4444]'}`}>
              {selected.status}
            </span>
            <span className="text-[#6b6b75]">{selected.connections.length} links</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[9px] text-[#6b6b75]">
            {typeLabels.map(([type, label]) => (
              <span key={type} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: nodeColor(type) }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
