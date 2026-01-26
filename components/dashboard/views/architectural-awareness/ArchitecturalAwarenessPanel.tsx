'use client';

import { useState, useCallback } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { ArchitectureGraph } from './ArchitectureGraph';
import { FullscreenModal } from './FullscreenModal';
import type { ArchNodeData } from './types';
import { cn } from '@/lib/utils';
import { Expand, MapPin, X } from 'lucide-react';

interface ArchitecturalAwarenessPanelProps {
  className?: string;
}

export function ArchitecturalAwarenessPanel({ className }: ArchitecturalAwarenessPanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ id: string; data: ArchNodeData } | null>(null);

  const handleNodeClick = useCallback((nodeId: string, data: ArchNodeData) => {
    setSelectedNode({ id: nodeId, data });
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <>
      <div className={cn('flex flex-col h-full bg-background', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">Architectural Awareness</h3>
          </div>
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Fullscreen (⛶)"
          >
            <Expand className="w-4 h-4" />
          </button>
        </div>

        {/* Graph Container */}
        <div className="flex-1 overflow-hidden relative">
          <ReactFlowProvider>
            <ArchitectureGraph
              className="h-full"
              onNodeClick={handleNodeClick}
            />
          </ReactFlowProvider>

          {/* Node Details Popover */}
          {selectedNode && (
            <div className="absolute bottom-2 right-2 z-20 w-64 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
                <span className="text-xs font-medium truncate">{selectedNode.data.label}</span>
                <button
                  onClick={handleCloseDetails}
                  className="p-0.5 rounded hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 text-xs space-y-2">
                <div>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  <span className="font-medium">{selectedNode.data.nodeType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Category:</span>{' '}
                  <span className="font-medium">{selectedNode.data.category || 'General'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">File:</span>{' '}
                  <span className="font-mono text-[10px]">{selectedNode.data.filePath}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lines:</span>{' '}
                  <span>{selectedNode.data.lineStart} - {selectedNode.data.lineEnd}</span>
                </div>
                {selectedNode.data.metadata?.docstring ? (
                  <div className="mt-2 p-2 bg-muted/50 rounded text-[10px] italic line-clamp-3">
                    {String(selectedNode.data.metadata.docstring)}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      <FullscreenModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title="Architectural Awareness"
      >
        <ReactFlowProvider>
          <ArchitectureGraph
            className="h-full"
            onNodeClick={handleNodeClick}
          />
        </ReactFlowProvider>
      </FullscreenModal>
    </>
  );
}
