'use client';

import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePanelContext, type ParentPage, type PanelId } from '@/lib/contexts/panel-context';

const PANEL_LABELS: Record<PanelId, string> = {
  injections: 'Injection Focus',
  learnings: "Today's Learnings",
  architecture: 'Architecture Graph',
  synaptic: 'Synaptic Chat',
};

const PANEL_DESCRIPTIONS: Record<PanelId, string> = {
  injections: 'View current webhook injection',
  learnings: 'Recent learnings and wins',
  architecture: 'System architecture graph',
  synaptic: 'Chat interface',
};

interface PanelSelectorDropdownProps {
  parentPage: ParentPage;
}

export function PanelSelectorDropdown({ parentPage }: PanelSelectorDropdownProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { availablePanels, getActivePanelsForPage, togglePanelForPage } = usePanelContext();
  const activePanels = getActivePanelsForPage(parentPage);

  // Sort: active panels first, then inactive
  const sortedPanels = availablePanels.sort((a, b) => {
    const aActive = activePanels.includes(a);
    const bActive = activePanels.includes(b);
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });

  const handleToggle = (panelId: PanelId) => {
    togglePanelForPage(parentPage, panelId);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={menuRef} className='relative'>
      <Button
        variant='outline'
        size='sm'
        onClick={() => setOpen(!open)}
        className='h-8 w-8 p-0'
        title={`Manage panels for ${parentPage}`}
      >
        <MoreVertical className='w-4 h-4' />
      </Button>

      {open && (
        <div className='absolute right-0 top-full mt-1 z-50 min-w-[280px] rounded-md border border-border bg-background shadow-md'>
          <div className='px-3 py-2 border-b border-border/50'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-semibold'>Panels for {parentPage}</span>
              <span className='text-xs text-muted-foreground'>{activePanels.length} active</span>
            </div>
          </div>

          <div className='py-1'>
            {sortedPanels.map((panelId) => {
              const isActive = activePanels.includes(panelId);
              return (
                <button
                  key={panelId}
                  onClick={() => handleToggle(panelId)}
                  className='w-full px-3 py-2 text-left hover:bg-secondary/50 transition-colors flex items-start gap-2'
                >
                  <input
                    type='checkbox'
                    checked={isActive}
                    onChange={() => {}}
                    className='mt-1 w-4 h-4'
                    readOnly
                  />
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2'>
                      <span className='text-sm font-medium'>{PANEL_LABELS[panelId]}</span>
                      {isActive && <Check className='w-3 h-3 text-primary shrink-0' />}
                    </div>
                    <span className='text-xs text-muted-foreground block mt-0.5'>
                      {PANEL_DESCRIPTIONS[panelId]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
