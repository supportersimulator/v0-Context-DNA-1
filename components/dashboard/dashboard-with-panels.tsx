'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { usePanelContext, type ParentPage } from '@/lib/contexts/panel-context';
import { DockablePanel } from './dockable-panel';
import { PanelSelectorDropdown } from './panel-selector-dropdown';
import { StickyOverlayContainer } from './sticky-overlay-container';

interface DashboardWithPanelsProps {
  parentPage: ParentPage;
  mainContent: React.ReactNode;
  panelContents: {
    injections?: React.ReactNode;
    learnings?: React.ReactNode;
    architecture?: React.ReactNode;
    synaptic?: React.ReactNode;
  };
  onPanelClose?: (panelId: string) => void;
  onPanelFullscreen?: (panelId: string) => void;
  headerControls?: React.ReactNode;
}

const PANEL_TITLES = {
  injections: 'Injections',
  learnings: "Today's Learnings",
  architecture: 'Architecture',
  synaptic: 'Synaptic Chat',
};

export function DashboardWithPanels({
  parentPage,
  mainContent,
  panelContents,
  onPanelClose,
  onPanelFullscreen,
  headerControls,
}: DashboardWithPanelsProps) {
  const { getActivePanelsForPage, getPanelState, togglePanelForPage } = usePanelContext();
  const activePanels = getActivePanelsForPage(parentPage);

  // Separate docked and sticky panels
  const dockedPanels = activePanels.filter((panelId) => {
    const state = getPanelState(parentPage, panelId);
    return state?.mode === 'docked' && state?.active;
  });

  const stickyPanels = activePanels.filter((panelId) => {
    const state = getPanelState(parentPage, panelId);
    return state?.mode === 'sticky' && state?.active;
  });

  const handlePanelClose = (panelId: string) => {
    togglePanelForPage(parentPage, panelId as any);
    onPanelClose?.(panelId);
  };

  const getPanelContent = (panelId: string) => {
    return (panelContents as Record<string, React.ReactNode>)[panelId] || null;
  };

  return (
    <div className='flex flex-col h-full w-full'>
      {/* Header with Panel Selector */}
      <div className='flex items-center justify-between px-4 py-2 border-b border-border/50 bg-background/95 backdrop-blur shrink-0 h-12'>
        <div className='flex items-center gap-2'>
          {headerControls}
        </div>
        <PanelSelectorDropdown parentPage={parentPage} />
      </div>

      {/* Main Layout */}
      <div className='flex-1 overflow-hidden relative'>
        <StickyOverlayContainer parentPage={parentPage}>
          {/* Docked Panels Area (if any) */}
          {dockedPanels.length > 0 ? (
            <div className='h-full flex flex-col'>
              {/* Render docked split panel layout for Live page style */}
              <div className='flex-1 overflow-hidden'>
                {/* For now, show main content - will be enhanced with split layout */}
                {mainContent}
              </div>
            </div>
          ) : (
            <div className='h-full overflow-auto'>{mainContent}</div>
          )}

          {/* Sticky Overlay Panels */}
          <div className='fixed inset-0 pointer-events-none'>
            {stickyPanels.map((panelId) => (
              <div key={panelId} className='pointer-events-auto'>
                <DockablePanel
                  panelId={panelId}
                  parentPage={parentPage}
                  title={PANEL_TITLES[panelId as keyof typeof PANEL_TITLES]}
                  onClose={() => handlePanelClose(panelId)}
                  onFullscreen={() => onPanelFullscreen?.(panelId)}
                >
                  {getPanelContent(panelId)}
                </DockablePanel>
              </div>
            ))}
          </div>
        </StickyOverlayContainer>
      </div>
    </div>
  );
}
