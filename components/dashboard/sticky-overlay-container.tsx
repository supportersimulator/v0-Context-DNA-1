'use client';

import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { usePanelContext, type ParentPage } from '@/lib/contexts/panel-context';

interface StickyOverlayContainerProps {
  parentPage: ParentPage;
  children: ReactNode;
}

export function StickyOverlayContainer({ parentPage, children }: StickyOverlayContainerProps) {
  const { getActivePanelsForPage, getPanelState } = usePanelContext();
  const activePanels = getActivePanelsForPage(parentPage);

  // Get sticky panels for this parent page
  const stickyPanels = activePanels.filter((panelId) => {
    const state = getPanelState(parentPage, panelId);
    return state?.mode === 'sticky' && state?.active;
  });

  return (
    <div className='relative w-full h-full overflow-hidden'>
      {/* Main content (scrollable) */}
      <div className='w-full h-full overflow-auto'>{children}</div>

      {/* Sticky overlay layer - all sticky panels render as overlays */}
      <div className='fixed inset-0 pointer-events-none'>
        {/* Sticky panels will render inside a portal here */}
        {/* This is managed by the parent component that renders each sticky panel */}
      </div>
    </div>
  );
}
