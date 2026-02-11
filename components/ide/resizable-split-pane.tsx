'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// ResizableSplitPane
//
// Two-pane layout with a draggable divider. Supports horizontal (left|right)
// and vertical (top|bottom) directions. Responsive: stacks vertically when
// container width < 600px in horizontal mode.
// ---------------------------------------------------------------------------

export interface ResizableSplitPaneProps {
  /** First child pane (left or top depending on direction) */
  children: [ReactNode, ReactNode];
  /** Initial split ratio 0-1 (default 0.5) */
  defaultSplit?: number;
  /** Minimum first-pane size in px (default 200) */
  minLeftWidth?: number;
  /** Minimum second-pane size in px (default 200) */
  minRightWidth?: number;
  /** Split direction: horizontal = left|right, vertical = top|bottom */
  direction?: 'horizontal' | 'vertical';
  /** Additional className on the outer container */
  className?: string;
}

export function ResizableSplitPane({
  children,
  defaultSplit = 0.5,
  minLeftWidth = 200,
  minRightWidth = 200,
  direction = 'horizontal',
  className = '',
}: ResizableSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(defaultSplit);
  const [isDragging, setIsDragging] = useState(false);
  const [containerSize, setContainerSize] = useState(0);
  const [isNarrow, setIsNarrow] = useState(false);

  // ---- Measure container via ResizeObserver ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const size = direction === 'horizontal' ? width : height;
      setContainerSize(size);
      setIsNarrow(direction === 'horizontal' && width < 600);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [direction]);

  // ---- Drag handlers ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      let pos: number;
      let total: number;

      if (direction === 'horizontal') {
        pos = e.clientX - rect.left;
        total = rect.width;
      } else {
        pos = e.clientY - rect.top;
        total = rect.height;
      }

      // Clamp to min sizes
      const minFirst = minLeftWidth;
      const minSecond = minRightWidth;
      const clampedPos = Math.max(minFirst, Math.min(total - minSecond, pos));
      const newSplit = total > 0 ? clampedPos / total : 0.5;

      setSplit(newSplit);
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
  }, [isDragging, direction, minLeftWidth, minRightWidth]);

  // ---- Prevent text selection while dragging ----
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, direction]);

  const [first, second] = children;

  // ---- Responsive stacking for narrow containers ----
  if (isNarrow && direction === 'horizontal') {
    return (
      <div
        ref={containerRef}
        className={`flex flex-col h-full w-full ${className}`}
      >
        <div className="flex-1 min-h-0 overflow-hidden">{first}</div>
        <div className="flex-1 min-h-0 overflow-hidden">{second}</div>
      </div>
    );
  }

  // ---- Normal split layout ----
  const isHorizontal = direction === 'horizontal';
  const firstSize = `${split * 100}%`;
  const secondSize = `${(1 - split) * 100}%`;

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full overflow-hidden ${className}`}
    >
      {/* First pane */}
      <div
        className="overflow-hidden"
        style={{
          [isHorizontal ? 'width' : 'height']: firstSize,
          flexShrink: 0,
          minWidth: isHorizontal ? `${minLeftWidth}px` : undefined,
          minHeight: !isHorizontal ? `${minLeftWidth}px` : undefined,
        }}
      >
        {first}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        className={`
          flex-shrink-0 select-none transition-colors duration-150
          ${isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
          ${isDragging
            ? 'bg-[#22c55e]'
            : 'bg-[#2a2a35] hover:bg-[#22c55e]/50'
          }
        `}
        role="separator"
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      />

      {/* Second pane */}
      <div
        className="overflow-hidden flex-1"
        style={{
          minWidth: isHorizontal ? `${minRightWidth}px` : undefined,
          minHeight: !isHorizontal ? `${minRightWidth}px` : undefined,
        }}
      >
        {second}
      </div>
    </div>
  );
}
