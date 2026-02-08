'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useResponsive } from '@/lib/contexts/responsive-context';

interface MobileLayoutProps {
  children: ReactNode;
  className?: string;
}

/**
 * MobileLayout - Automatically adapts UI for mobile/tablet views
 *
 * On screens < 768px:
 * - Hides some UI elements
 * - Stacks panels vertically
 * - Fullscreen modals for panels
 * - Bottom navigation instead of top
 * - Larger touch targets
 * - Single-column layout
 */
export function MobileLayout({ children, className }: MobileLayoutProps) {
  const { state } = useResponsive();

  return (
    <div
      className={cn(
        'w-full h-full flex flex-col',
        state.isMobile && 'bg-background', // Match background on mobile
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * MobileToolbar - Bottom navigation for mobile views
 */
interface MobileToolbarProps {
  items: Array<{
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
  }>;
  className?: string;
}

export function MobileToolbar({ items, className }: MobileToolbarProps) {
  const { state } = useResponsive();

  if (!state.isMobile) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border/50 p-1 flex justify-around',
        className
      )}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={item.onClick}
          className={cn(
            'flex flex-col items-center gap-1 py-2 px-3 rounded-lg text-xs transition-colors',
            item.active
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div className='w-6 h-6 flex items-center justify-center'>{item.icon}</div>
          <span className='text-[10px]'>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * MobileTabPanel - Tab interface for mobile
 * Shows one panel at a time with smooth transitions
 */
interface MobileTabPanelProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: ReactNode;
    content: ReactNode;
  }>;
  activeTabId: string;
  onTabChange: (id: string) => void;
  className?: string;
}

export function MobileTabPanel({
  tabs,
  activeTabId,
  onTabChange,
  className,
}: MobileTabPanelProps) {
  const { state } = useResponsive();

  if (!state.isMobile) {
    return <div className={className}>{tabs.find((t) => t.id === activeTabId)?.content}</div>;
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tab headers */}
      <div className='flex gap-1 p-2 border-b border-border/50 bg-background/50 overflow-x-auto'>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0',
              activeTabId === tab.id
                ? 'bg-primary/20 text-primary font-medium'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.icon && <div className='w-4 h-4 flex items-center justify-center'>{tab.icon}</div>}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className='flex-1 overflow-hidden'>
        {activeTab && (
          <div key={activeTab.id} className='w-full h-full overflow-auto'>
            {activeTab.content}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MobileFullscreenPanel - Fullscreen modal for mobile panels
 */
interface MobileFullscreenPanelProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MobileFullscreenPanel({
  title,
  isOpen,
  onClose,
  children,
}: MobileFullscreenPanelProps) {
  const { state } = useResponsive();

  if (!state.isMobile || !isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 bg-background flex flex-col'>
      {/* Header */}
      <div className='flex items-center justify-between p-4 border-b border-border/50 bg-background/95'>
        <h2 className='font-semibold text-foreground'>{title}</h2>
        <button
          onClick={onClose}
          className='text-muted-foreground hover:text-foreground transition-colors'
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-auto'>{children}</div>
    </div>
  );
}
