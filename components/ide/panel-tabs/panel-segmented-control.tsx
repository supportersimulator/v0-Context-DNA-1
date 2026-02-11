'use client';

import { memo, useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// PanelSegmentedControl — radio-style toggle group for fixed filter sets
//
// Used for things like: Errors | Warnings | Info
// Each segment can optionally show a count badge.
//
// Keyboard navigation: Arrow keys cycle through options.
// ---------------------------------------------------------------------------

export interface Segment {
  id: string;
  label: string;
  count?: number;
}

export interface PanelSegmentedControlProps {
  segments: Segment[];
  activeId: string;
  onSelect: (id: string) => void;
  size?: 'xs' | 'sm';
  className?: string;
}

export const PanelSegmentedControl = memo(function PanelSegmentedControl({
  segments,
  activeId,
  onSelect,
  size = 'sm',
  className = '',
}: PanelSegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const total = segments.length;
      if (total === 0) return;

      let newIndex = focusIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = (focusIndex + 1) % total;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = (focusIndex - 1 + total) % total;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < total) {
            onSelect(segments[focusIndex].id);
          }
          return;
        default:
          return;
      }

      setFocusIndex(newIndex);
      onSelect(segments[newIndex].id);
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[newIndex]?.focus();
    },
    [focusIndex, segments, onSelect],
  );

  const heightClass = size === 'xs' ? 'h-5' : 'h-6';
  const textClass = size === 'xs' ? 'text-[10px]' : 'text-[11px]';

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      onKeyDown={handleKeyDown}
      className={`
        inline-flex items-center rounded-md bg-[#111118] border border-[#2a2a35]
        p-0.5 ${className}
      `}
    >
      {segments.map((seg, i) => {
        const isActive = seg.id === activeId;
        return (
          <button
            key={seg.id}
            role="radio"
            aria-checked={isActive}
            tabIndex={i === focusIndex || (focusIndex === -1 && isActive) ? 0 : -1}
            onClick={() => {
              onSelect(seg.id);
              setFocusIndex(i);
            }}
            onFocus={() => setFocusIndex(i)}
            className={`
              flex items-center gap-1 px-2 rounded transition-colors
              ${heightClass} ${textClass}
              ${
                isActive
                  ? 'bg-[#1a1a24] text-[#e5e5e5] shadow-sm'
                  : 'text-[#6b6b75] hover:text-[#e5e5e5]'
              }
            `}
          >
            <span>{seg.label}</span>
            {typeof seg.count === 'number' && (
              <span
                className={`
                  min-w-[14px] h-[14px] flex items-center justify-center
                  rounded-full text-[9px] font-bold leading-none px-0.5
                  ${isActive ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#2a2a35] text-[#6b6b75]'}
                `}
              >
                {seg.count > 99 ? '99+' : seg.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
