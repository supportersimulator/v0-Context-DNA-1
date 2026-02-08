'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  X,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Pin,
  PinOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePanelContext, type PanelId, type ParentPage } from '@/lib/contexts/panel-context';

interface DockablePanelProps {
  panelId: PanelId;
  parentPage: ParentPage;
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  onFullscreen?: () => void;
}

export function DockablePanel({
  panelId,
  parentPage,
  title,
  children,
  onClose,
  onFullscreen,
}: DockablePanelProps) {
  const { getPanelState, updatePanelState } = usePanelContext();
  const panelState = getPanelState(parentPage, panelId);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  if (!panelState) return null;

  const { minimized, mode, width, height, stickyCorner } = panelState;

  // Handle minimize toggle
  const handleMinimize = () => {
    updatePanelState(parentPage, panelId, { minimized: !minimized });
  };

  // Handle fullscreen
  const handleFullscreen = () => {
    onFullscreen?.();
  };

  // Handle close
  const handleClose = () => {
    onClose?.();
  };

  // Handle drag for sticky panels
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'sticky' || !panelRef.current) return;
    setIsDragging(true);
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  useEffect(() => {
    if (!isDragging || !panelRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      panelRef.current.style.left = `${Math.max(0, x)}px`;
      panelRef.current.style.top = `${Math.max(0, y)}px`;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Minimized state - just the header
  if (minimized) {
    return (
      <div
        ref={panelRef}
        className={cn(
          'flex items-center h-8 bg-background/90 border border-border/50 rounded',
          mode === 'sticky' &&
            'absolute z-40 cursor-move hover:bg-background/95 transition-colors',
          mode === 'docked' && 'w-full'
        )}
        style={
          mode === 'sticky'
            ? {
                width: 'auto',
                minWidth: '200px',
                left: stickyCorner.includes('right') ? 'auto' : '10px',
                right: stickyCorner.includes('right') ? '10px' : 'auto',
                top: stickyCorner.includes('bottom') ? 'auto' : '60px',
                bottom: stickyCorner.includes('bottom') ? '10px' : 'auto',
              }
            : { width: '100%' }
        }
      >
        {/* Drag Handle */}
        <div
          ref={headerRef}
          onMouseDown={handleMouseDown}
          className='flex-1 flex items-center gap-2 px-2 cursor-grab active:cursor-grabbing'
        >
          <GripHorizontal className='w-3 h-3 text-muted-foreground/50' />
          <span className='text-xs font-medium text-muted-foreground uppercase whitespace-nowrap'>
            {title}
          </span>
        </div>

        {/* Controls */}
        <div className='flex items-center gap-1 pr-1'>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleMinimize}
            className='h-5 w-5 p-0'
            title='Expand'
          >
            <ChevronUp className='w-3 h-3' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleFullscreen}
            className='h-5 w-5 p-0'
            title='Fullscreen'
          >
            <Maximize2 className='w-3 h-3' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClose}
            className='h-5 w-5 p-0 text-destructive hover:text-destructive'
            title='Close'
          >
            <X className='w-3 h-3' />
          </Button>
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div
      ref={panelRef}
      className={cn(
        'flex flex-col bg-background border border-border/50 rounded overflow-hidden',
        mode === 'sticky' && 'absolute z-40 shadow-lg',
        mode === 'docked' && 'h-full flex-1'
      )}
      style={
        mode === 'sticky'
          ? {
              width: `${width}px`,
              height: `${height}px`,
              left: stickyCorner.includes('right') ? 'auto' : '10px',
              right: stickyCorner.includes('right') ? '10px' : 'auto',
              top: stickyCorner.includes('bottom') ? 'auto' : '60px',
              bottom: stickyCorner.includes('bottom') ? '10px' : 'auto',
            }
          : { width: '100%', height: '100%' }
      }
    >
      {/* Panel Header */}
      <div
        ref={headerRef}
        onMouseDown={handleMouseDown}
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b border-border/30 bg-background/80 shrink-0 h-8',
          mode === 'sticky' && 'cursor-grab active:cursor-grabbing'
        )}
      >
        <div className='flex items-center gap-2 flex-1 min-w-0'>
          {mode === 'sticky' && (
            <GripHorizontal className='w-3 h-3 text-muted-foreground/50 shrink-0' />
          )}
          <span className='text-xs font-medium text-muted-foreground uppercase truncate'>
            {title}
          </span>
          {mode === 'sticky' && (
            <span className='text-[10px] text-muted-foreground/60 ml-auto shrink-0'>
              Sticky
            </span>
          )}
        </div>

        {/* Controls */}
        <div className='flex items-center gap-1 ml-2 shrink-0'>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleMinimize}
            className='h-5 w-5 p-0'
            title='Minimize'
          >
            <ChevronDown className='w-3 h-3' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleFullscreen}
            className='h-5 w-5 p-0'
            title='Fullscreen'
          >
            <Maximize2 className='w-3 h-3' />
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleClose}
            className='h-5 w-5 p-0 text-destructive hover:text-destructive'
            title='Close'
          >
            <X className='w-3 h-3' />
          </Button>
        </div>
      </div>

      {/* Panel Content */}
      <div className='flex-1 overflow-hidden'>
        {children}
      </div>
    </div>
  );
}
