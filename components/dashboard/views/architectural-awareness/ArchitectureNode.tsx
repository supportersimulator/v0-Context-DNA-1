'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { ArchNodeData } from './types';
import { NODE_TYPE_ICONS } from './types';

interface ArchitectureNodeProps {
  data: ArchNodeData;
  selected?: boolean;
}

function ArchitectureNodeComponent({ data, selected }: ArchitectureNodeProps) {
  const isHighlighted = data?.isHighlighted;
  const icon = NODE_TYPE_ICONS[data?.nodeType] || '📄';
  const categoryRoot = data?.category?.split('/')[0] || 'General';

  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border shadow-sm transition-all duration-300',
        'min-w-[140px] max-w-[200px]',
        selected && 'ring-2 ring-primary ring-offset-2',
        isHighlighted && 'ring-2 ring-yellow-400 animate-pulse'
      )}
      style={{
        backgroundColor: `${data?.color || '#6b7280'}15`,
        borderColor: data?.color || '#6b7280',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-border !w-2 !h-2"
      />

      {/* Node Content */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg" title={data?.nodeType}>
          {icon}
        </span>
        <span
          className="font-medium text-sm truncate flex-1"
          title={data?.label}
        >
          {data?.label}
        </span>
      </div>

      {/* Category Badge */}
      <div
        className="text-[10px] px-1.5 py-0.5 rounded inline-block font-medium"
        style={{
          backgroundColor: `${data?.color || '#6b7280'}30`,
          color: data?.color || '#6b7280',
        }}
      >
        {categoryRoot}
      </div>

      {/* File Path */}
      <div className="text-[10px] text-muted-foreground truncate mt-1" title={data?.filePath}>
        {data?.filePath?.split('/').slice(-2).join('/')}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-border !w-2 !h-2"
      />
    </div>
  );
}

export const ArchitectureNode = memo(ArchitectureNodeComponent);
