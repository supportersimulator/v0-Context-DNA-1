'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type PanelId = 'injections' | 'learnings' | 'architecture' | 'synaptic';
export type ParentPage = 'dashboard' | 'synaptic' | 'live';
export type PanelMode = 'docked' | 'sticky' | 'minimized';
export type StickyCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface PanelState {
  id: PanelId;
  active: boolean;
  mode: PanelMode;
  width: number;
  height: number;
  stickyCorner: StickyCorner;
  minimized: boolean;
}

export interface ParentPagePanels {
  activePanels: PanelId[];
  panelStates: Record<PanelId, PanelState>;
}

interface PanelContextType {
  // Get all available panels
  availablePanels: PanelId[];

  // Get panels for a specific parent page
  getPanelsForPage: (page: ParentPage) => ParentPagePanels;

  // Activate/deactivate panel for a parent page
  togglePanelForPage: (page: ParentPage, panelId: PanelId) => void;

  // Update panel state
  updatePanelState: (page: ParentPage, panelId: PanelId, state: Partial<PanelState>) => void;

  // Get specific panel state
  getPanelState: (page: ParentPage, panelId: PanelId) => PanelState | null;

  // Reset to defaults
  resetPageLayout: (page: ParentPage) => void;

  // Get list of active panels sorted by usage (active first)
  getActivePanelsForPage: (page: ParentPage) => PanelId[];
}

const PanelContext = createContext<PanelContextType | undefined>(undefined);

// Default panel states for each parent page
const DEFAULT_PANEL_STATES: Record<ParentPage, ParentPagePanels> = {
  dashboard: {
    activePanels: ['learnings', 'synaptic'],
    panelStates: {
      injections: {
        id: 'injections',
        active: false,
        mode: 'sticky',
        width: 350,
        height: 300,
        stickyCorner: 'top-right',
        minimized: true,
      },
      learnings: {
        id: 'learnings',
        active: true,
        mode: 'sticky',
        width: 350,
        height: 250,
        stickyCorner: 'top-right',
        minimized: false,
      },
      architecture: {
        id: 'architecture',
        active: false,
        mode: 'sticky',
        width: 350,
        height: 300,
        stickyCorner: 'bottom-right',
        minimized: true,
      },
      synaptic: {
        id: 'synaptic',
        active: true,
        mode: 'sticky',
        width: 400,
        height: 350,
        stickyCorner: 'bottom-right',
        minimized: false,
      },
    },
  },
  synaptic: {
    activePanels: ['learnings', 'injections'],
    panelStates: {
      injections: {
        id: 'injections',
        active: true,
        mode: 'sticky',
        width: 350,
        height: 300,
        stickyCorner: 'top-left',
        minimized: false,
      },
      learnings: {
        id: 'learnings',
        active: true,
        mode: 'sticky',
        width: 350,
        height: 280,
        stickyCorner: 'top-right',
        minimized: false,
      },
      architecture: {
        id: 'architecture',
        active: false,
        mode: 'sticky',
        width: 350,
        height: 300,
        stickyCorner: 'bottom-right',
        minimized: true,
      },
      synaptic: {
        id: 'synaptic',
        active: false,
        mode: 'docked',
        width: 400,
        height: 300,
        stickyCorner: 'bottom-right',
        minimized: false,
      },
    },
  },
  live: {
    activePanels: ['injections', 'learnings', 'architecture'],
    panelStates: {
      injections: {
        id: 'injections',
        active: true,
        mode: 'docked',
        width: 400,
        height: 300,
        stickyCorner: 'top-left',
        minimized: false,
      },
      learnings: {
        id: 'learnings',
        active: true,
        mode: 'docked',
        width: 400,
        height: 280,
        stickyCorner: 'top-right',
        minimized: false,
      },
      architecture: {
        id: 'architecture',
        active: true,
        mode: 'docked',
        width: 400,
        height: 300,
        stickyCorner: 'bottom-right',
        minimized: false,
      },
      synaptic: {
        id: 'synaptic',
        active: false,
        mode: 'docked',
        width: 400,
        height: 350,
        stickyCorner: 'bottom-right',
        minimized: true,
      },
    },
  },
};

const AVAILABLE_PANELS: PanelId[] = ['injections', 'learnings', 'architecture', 'synaptic'];

export function PanelProvider({ children }: { children: ReactNode }) {
  const [pageLayouts, setPageLayouts] = useState<Record<ParentPage, ParentPagePanels>>(
    DEFAULT_PANEL_STATES
  );

  const getPanelsForPage = (page: ParentPage): ParentPagePanels => {
    return pageLayouts[page] || DEFAULT_PANEL_STATES[page];
  };

  const togglePanelForPage = (page: ParentPage, panelId: PanelId) => {
    setPageLayouts((prev) => {
      const current = prev[page];
      const isActive = current.activePanels.includes(panelId);

      return {
        ...prev,
        [page]: {
          ...current,
          activePanels: isActive
            ? current.activePanels.filter((id) => id !== panelId)
            : [...current.activePanels, panelId],
          panelStates: {
            ...current.panelStates,
            [panelId]: {
              ...current.panelStates[panelId],
              active: !isActive,
            },
          },
        },
      };
    });
  };

  const updatePanelState = (page: ParentPage, panelId: PanelId, state: Partial<PanelState>) => {
    setPageLayouts((prev) => {
      const current = prev[page];
      return {
        ...prev,
        [page]: {
          ...current,
          panelStates: {
            ...current.panelStates,
            [panelId]: {
              ...current.panelStates[panelId],
              ...state,
            },
          },
        },
      };
    });
  };

  const getPanelState = (page: ParentPage, panelId: PanelId): PanelState | null => {
    return pageLayouts[page]?.panelStates[panelId] || null;
  };

  const resetPageLayout = (page: ParentPage) => {
    setPageLayouts((prev) => ({
      ...prev,
      [page]: DEFAULT_PANEL_STATES[page],
    }));
  };

  const getActivePanelsForPage = (page: ParentPage): PanelId[] => {
    return pageLayouts[page]?.activePanels || DEFAULT_PANEL_STATES[page].activePanels;
  };

  const value: PanelContextType = {
    availablePanels: AVAILABLE_PANELS,
    getPanelsForPage,
    togglePanelForPage,
    updatePanelState,
    getPanelState,
    resetPageLayout,
    getActivePanelsForPage,
  };

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelContext() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelContext must be used within PanelProvider');
  }
  return context;
}
