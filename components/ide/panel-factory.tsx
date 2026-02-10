'use client';

import type { IDockviewPanelProps } from 'dockview-react';
import { ResponsivePanelWrapper } from './responsive-panel';

// View components
import { HomeView } from '@/components/dashboard/views/home-view';
import { ActivityView } from '@/components/dashboard/views/activity-view';
import { ProfessorView } from '@/components/dashboard/views/professor-view';
import { SearchView } from '@/components/dashboard/views/search-view';
import { HealthView } from '@/components/dashboard/views/health-view';
import { ModelsView } from '@/components/dashboard/views/models-view';
import { InstallWizardView } from '@/components/dashboard/views/install-wizard-view';
import { SynapticChatView } from '@/components/dashboard/views/synaptic-chat-view';
import { InjectionFocusView } from '@/components/dashboard/views/injection-focus-view';
import { LearningPanel } from '@/components/dashboard/views/learning-panel';
import { ArchitecturalAwarenessPanel } from '@/components/dashboard/views/architectural-awareness';
import { VoiceChatView } from '@/components/dashboard/views/voice-chat-view';

// ---------------------------------------------------------------------------
// Panel metadata: labels, descriptions, page availability, responsive config
// ---------------------------------------------------------------------------

export type ParentPage = 'dashboard' | 'synaptic' | 'live';

export interface PanelMeta {
  label: string;
  description: string;
  pages: ParentPage[];
  /** Minimum width (px) before panel collapses to placeholder. Default: 150 */
  minWidth?: number;
  /** Minimum height (px) before panel collapses to placeholder. Default: 80 */
  minHeight?: number;
}

export const PANEL_METADATA: Record<string, PanelMeta> = {
  home: {
    label: 'Home',
    description: 'Stats overview and quick actions',
    pages: ['dashboard'],
    minWidth: 180,
    minHeight: 100,
  },
  activity: {
    label: 'Activity',
    description: 'Learning activity feed with filters',
    pages: ['dashboard'],
    minWidth: 200,
    minHeight: 100,
  },
  professor: {
    label: 'Professor',
    description: 'Query accumulated wisdom',
    pages: ['dashboard'],
    minWidth: 200,
    minHeight: 120,
  },
  search: {
    label: 'Search',
    description: 'Semantic search across learnings',
    pages: ['dashboard'],
    minWidth: 200,
    minHeight: 100,
  },
  health: {
    label: 'Health',
    description: 'Service status and system health',
    pages: ['dashboard'],
    minWidth: 180,
    minHeight: 100,
  },
  models: {
    label: 'Models',
    description: 'Local LLM model management',
    pages: ['dashboard'],
    minWidth: 200,
    minHeight: 100,
  },
  install: {
    label: 'Install Wizard',
    description: 'Guided Context DNA installation',
    pages: ['dashboard'],
    minWidth: 220,
    minHeight: 120,
  },
  synaptic: {
    label: 'Synaptic',
    description: 'Voice and text chat with Synaptic',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
  },
  injection: {
    label: 'Injection',
    description: 'Real-time Context DNA injection viewer',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 100,
  },
  learnings: {
    label: 'Learnings',
    description: "Today's captured learnings",
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 180,
    minHeight: 100,
  },
  architecture: {
    label: 'Architecture',
    description: 'Codebase architecture mind map',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
  },
  voicechat: {
    label: 'Voice Chat',
    description: 'Voice conversation with Synaptic',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 180,
    minHeight: 100,
  },
};

// ---------------------------------------------------------------------------
// PanelWrapper: responsive container wrapping every view
//
// - Uses ResponsivePanelWrapper (ResizeObserver-based)
// - Exposes CSS custom properties --panel-width, --panel-height
// - Adds .panel-compact (width < 300) and .panel-tiny (width < 200)
// - Collapses to placeholder when below configured min size
// - Provides ContainerSizeContext for children via useContainerSize()
// ---------------------------------------------------------------------------

function PanelWrapper({
  panelId,
  children,
}: {
  panelId: string;
  children: React.ReactNode;
}) {
  const meta = PANEL_METADATA[panelId];
  return (
    <ResponsivePanelWrapper
      label={meta?.label ?? panelId}
      minWidth={meta?.minWidth}
      minHeight={meta?.minHeight}
    >
      {children}
    </ResponsivePanelWrapper>
  );
}

// ---------------------------------------------------------------------------
// Individual panel components (receive IDockviewPanelProps from dockview)
// ---------------------------------------------------------------------------

function HomePanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="home">
      <HomeView />
    </PanelWrapper>
  );
}

function ActivityPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="activity">
      <ActivityView />
    </PanelWrapper>
  );
}

function ProfessorPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="professor">
      <ProfessorView />
    </PanelWrapper>
  );
}

function SearchPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="search">
      <SearchView />
    </PanelWrapper>
  );
}

function HealthPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="health">
      <HealthView />
    </PanelWrapper>
  );
}

function ModelsPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="models">
      <ModelsView />
    </PanelWrapper>
  );
}

function InstallPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="install">
      <InstallWizardView />
    </PanelWrapper>
  );
}

function SynapticPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="synaptic">
      <SynapticChatView />
    </PanelWrapper>
  );
}

function InjectionPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="injection">
      <InjectionFocusView />
    </PanelWrapper>
  );
}

function LearningsPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="learnings">
      <LearningPanel currentInjection={null} />
    </PanelWrapper>
  );
}

function ArchitecturePanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="architecture">
      <ArchitecturalAwarenessPanel />
    </PanelWrapper>
  );
}

function VoiceChatPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="voicechat">
      <VoiceChatView />
    </PanelWrapper>
  );
}

// ---------------------------------------------------------------------------
// Panel component registry
// Maps panel IDs to their React components for DockviewReact `components` prop
// ---------------------------------------------------------------------------

export const panelComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  home: HomePanel,
  activity: ActivityPanel,
  professor: ProfessorPanel,
  search: SearchPanel,
  health: HealthPanel,
  models: ModelsPanel,
  install: InstallPanel,
  synaptic: SynapticPanel,
  injection: InjectionPanel,
  learnings: LearningsPanel,
  architecture: ArchitecturePanel,
  voicechat: VoiceChatPanel,
};

/**
 * Returns panel IDs available for a given page.
 */
export function getPanelsForPage(page: ParentPage): string[] {
  return Object.entries(PANEL_METADATA)
    .filter(([, meta]) => meta.pages.includes(page))
    .map(([id]) => id);
}
