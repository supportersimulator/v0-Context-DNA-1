'use client';

import { memo, useCallback, useRef, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// PanelTabBar — compact tab bar for sub-tabs within IDE panels
//
// Two visual variants:
//   - 'pills': rounded pill with active bg highlight (like terminal tabs)
//   - 'underline': bottom-border indicator (like VS Code output tabs)
//
// Two sizes:
//   - 'xs': 20px height, 10px font (terminal, miniature panels)
//   - 'sm': 24px height, 11px font (standard sub-tabs)
//
// Features:
//   - Keyboard navigation (Arrow keys, Home, End)
//   - Overflow scroll with hidden scrollbar
//   - Close button per tab (optional)
//   - Add button (optional)
// ---------------------------------------------------------------------------

export interface PanelTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  closable?: boolean;
}

export interface PanelTabBarProps {
  tabs: PanelTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onAdd?: () => void;
  variant?: 'pills' | 'underline';
  size?: 'xs' | 'sm';
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'h-5 text-[10px]',
  sm: 'h-6 text-[11px]',
} as const;

export const PanelTabBar = memo(function PanelTabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
  variant = 'pills',
  size = 'sm',
  className = '',
}: PanelTabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  // Scroll active tab into view
  useEffect(() => {
    if (!containerRef.current) return;
    const activeEl = containerRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const total = tabs.length;
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
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = total - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < total) {
            onSelect(tabs[focusIndex].id);
          }
          return;
        default:
          return;
      }

      setFocusIndex(newIndex);
      // Focus the tab button
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[newIndex]?.focus();
    },
    [focusIndex, tabs, onSelect],
  );

  const sizeClass = SIZE_CLASSES[size];
  const isUnderline = variant === 'underline';

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={`
        flex items-center gap-0.5 px-2 py-0.5
        border-b border-[#2a2a35] flex-shrink-0
        overflow-x-auto scrollbar-none
        ${className}
      `}
    >
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeId;

        const activeClass = isUnderline
          ? isActive
            ? 'text-[#e5e5e5] border-b border-[#22c55e]'
            : 'text-[#6b6b75] border-b border-transparent hover:text-[#e5e5e5]'
          : isActive
            ? 'bg-[#22c55e]/20 text-[#22c55e]'
            : 'text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24]';

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            tabIndex={i === focusIndex || (focusIndex === -1 && isActive) ? 0 : -1}
            onClick={() => {
              onSelect(tab.id);
              setFocusIndex(i);
            }}
            onFocus={() => setFocusIndex(i)}
            className={`
              flex items-center gap-1 px-2 rounded transition-colors whitespace-nowrap
              ${sizeClass} ${activeClass}
            `}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.closable && onClose && (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Close ${tab.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="ml-0.5 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                &times;
              </span>
            )}
          </button>
        );
      })}

      {onAdd && (
        <button
          onClick={onAdd}
          className={`flex items-center justify-center px-1 text-[#6b6b75] hover:text-[#22c55e] transition-colors ${SIZE_CLASSES[size]}`}
          title="Add tab"
          aria-label="Add tab"
        >
          +
        </button>
      )}
    </div>
  );
});
