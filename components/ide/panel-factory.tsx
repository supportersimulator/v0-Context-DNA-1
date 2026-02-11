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

// IDE-only panels (Electron)
import { FileExplorer } from '@/components/ide/panels/file-explorer';
import { DockerPanel } from '@/components/ide/panels/docker-panel';
import { TerminalPanel } from '@/components/ide/panels/terminal-panel';
import { OpenHandsPanel } from '@/components/ide/panels/openhands-panel';

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
// IDE-only panel metadata (Electron-exclusive)
// These are merged into PANEL_METADATA when running inside Electron.
// ---------------------------------------------------------------------------
export const IDE_PANEL_METADATA: Record<string, PanelMeta> = {
  explorer: {
    label: 'Explorer',
    description: 'File tree browser',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
  },
  docker: {
    label: 'Docker',
    description: 'Container management and monitoring',
    pages: ['dashboard', 'live'],
    minWidth: 200,
    minHeight: 100,
  },
  terminal: {
    label: 'Terminal',
    description: 'Integrated terminal',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 100,
  },
  openhands: {
    label: 'OpenHands',
    description: 'AI coding agent interface',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
  },
};

/** Detect Electron environment (client-side only) */
function isElectronEnv(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).electron?.isElectron;
}

/**
 * Returns full panel metadata, including IDE panels when in Electron.
 */
export function getAllPanelMetadata(): Record<string, PanelMeta> {
  if (isElectronEnv()) {
    return { ...PANEL_METADATA, ...IDE_PANEL_METADATA };
  }
  return PANEL_METADATA;
}

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
      <InjectionFocusView standalone />
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
// IDE-only panel components (Electron)
// ---------------------------------------------------------------------------

function ExplorerPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="explorer">
      <FileExplorer />
    </PanelWrapper>
  );
}

function DockerPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="docker">
      <DockerPanel />
    </PanelWrapper>
  );
}

function TerminalPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="terminal">
      <TerminalPanel />
    </PanelWrapper>
  );
}

function OpenHandsPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="openhands">
      <OpenHandsPanel />
    </PanelWrapper>
  );
}

// ---------------------------------------------------------------------------
// Panel component registry
// Maps panel IDs to their React components for DockviewReact `components` prop
// ---------------------------------------------------------------------------

export const panelComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  // Core panels (always available)
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
  // IDE panels (Electron-only — gracefully degrade with placeholder in web)
  explorer: ExplorerPanel,
  docker: DockerPanelView,
  terminal: TerminalPanelView,
  openhands: OpenHandsPanelView,
};

/**
 * Returns panel IDs available for a given page.
 * Includes IDE panels when running in Electron.
 */
export function getPanelsForPage(page: ParentPage): string[] {
  const allMeta = getAllPanelMetadata();
  return Object.entries(allMeta)
    .filter(([, meta]) => meta.pages.includes(page))
    .map(([id]) => id);
}
