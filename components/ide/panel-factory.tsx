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
import { SynapticSplitView } from '@/components/dashboard/views/synaptic-split-view';
import { InjectionFocusView } from '@/components/dashboard/views/injection-focus-view';
import { LearningPanel } from '@/components/dashboard/views/learning-panel';
import { ArchitecturalAwarenessPanel } from '@/components/dashboard/views/architectural-awareness';
import { VoiceChatView } from '@/components/dashboard/views/voice-chat-view';
import { BenchmarkConsentModal } from '@/components/dashboard/views/benchmark-consent-modal';
import { IntegrationsModal } from '@/components/dashboard/views/integrations-modal';
import { LeaderboardView } from '@/components/dashboard/views/leaderboard-view';
import { ConfigPackBrowser } from '@/components/dashboard/views/config-pack-browser';
import { BottleneckCard } from '@/components/dashboard/views/bottleneck-card';
import { ConfigBenchmarkSummary } from '@/components/dashboard/views/config-benchmark-summary';
import { analyzeBottleneck } from '@/lib/benchmark/bottleneck-analyzer';
import type { BenchmarkInput } from '@/lib/benchmark/bottleneck-analyzer';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { SwarmView } from '@/components/panels/swarm-view';
import { HarmonizerView } from '@/components/panels/harmonizer-view';
import { EvidenceView } from '@/components/panels/evidence-view';

// IDE-only panels (Electron)
import { FileExplorer } from '@/components/ide/panels/file-explorer';
import { DockerPanel } from '@/components/ide/panels/docker-panel';
import { TerminalPanel } from '@/components/ide/panels/terminal-panel';
import { OpenHandsPanel } from '@/components/ide/panels/openhands-panel';
import { CodeEditorPanel } from '@/components/ide/panels/code-editor-panel';
import { GitPanel } from '@/components/ide/panels/git-panel';
import { DiffViewerPanel } from '@/components/ide/panels/diff-viewer-panel';
import { FindReplacePanel } from '@/components/ide/panels/find-replace-panel';
import { ProblemsPanel } from '@/components/ide/panels/problems-panel';
import { MemoryExplorerPanel } from '@/components/ide/panels/memory-explorer-panel';
import { SessionTimelinePanel } from '@/components/ide/panels/session-timeline-panel';
import { DebugPanel } from '@/components/ide/panels/debug-panel';
import { ExtensionsPanel } from '@/components/ide/panels/extensions-panel';
import { CollaborationPanel } from '@/components/ide/panels/collaboration-panel';
import { MinimapPanel } from '@/components/ide/panels/minimap-panel';
import { ContextBusPanel } from '@/components/ide/panels/context-bus-panel';
import { SyncPanel } from '@/components/ide/panels/sync-panel';
import { InjectionViewerPanel } from '@/components/ide/panels/injection-viewer-panel';
import { EpistemicPanel } from '@/components/ide/panels/epistemic-panel';
import { LLMOrchestrationPanel } from '@/components/ide/panels/llm-orchestration-panel';
import { AgentPanel } from '@/components/ide/panels/agent-panel';
import { LibrarianPanel } from '@/components/ide/panels/librarian-panel';
import { SwarmControllerPanel } from '@/components/ide/panels/swarm-controller-panel';
import { TodayLearningsPanel } from '@/components/ide/panels/today-learnings-panel';
import { SettingsPanel } from '@/components/ide/panels/settings-panel';
import { NotificationsPanel } from '@/components/ide/panels/notifications-panel';
import { FrontendPreviewPanel } from '@/components/ide/panels/frontend-preview-panel';
import { NodeRedPanel } from '@/components/ide/panels/node-red-panel';

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
  /** Lucide icon name for Activity Bar (e.g. 'Brain', 'Syringe'). Omit to hide from bar. */
  icon?: string;
  /** Activity Bar section: 'top' (default) or 'bottom' */
  position?: 'top' | 'bottom';
  /** If true, toggles explorer sidebar instead of a dockview panel */
  isExplorerToggle?: boolean;
}

export const PANEL_METADATA: Record<string, PanelMeta> = {
  'dashboard-shell': {
    label: 'Context DNA',
    description: 'Main application shell (Dashboard / Synaptic / Live View)',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 300,
    minHeight: 200,
  },
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
    icon: 'Search',
  },
  health: {
    label: 'Health',
    description: 'Service status and system health',
    pages: ['dashboard'],
    minWidth: 180,
    minHeight: 100,
    icon: 'Bug',
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
    icon: 'Brain',
  },
  injection: {
    label: 'Injection',
    description: 'Real-time Context DNA injection viewer',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 100,
    icon: 'Syringe',
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
  swarm: {
    label: 'Swarm',
    description: 'Multi-agent swarm orchestration',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
    icon: 'Workflow',
  },
  harmonizer: {
    label: 'Harmonizer',
    description: '7-gate code quality checker',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'Shield',
  },
  evidence: {
    label: 'Evidence',
    description: 'Evidence pipeline claims and promotions',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'FlaskConical',
  },
  memory: {
    label: 'Memory',
    description: 'Persistent memory explorer (learnings, SOPs, patterns)',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'BookOpen',
  },
  timeline: {
    label: 'Timeline',
    description: 'Session history and crash recovery',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'Clock',
  },
  'benchmark-consent': {
    label: 'Compare Configs',
    description: 'Benchmark consent and config comparison',
    pages: ['dashboard'],
    minWidth: 200,
    minHeight: 150,
    icon: 'GitCompare',
  },
  integrations: {
    label: 'Integrations',
    description: 'Discover local runtimes, services, and tools',
    pages: ['dashboard'],
    minWidth: 220,
    minHeight: 150,
    icon: 'Plug',
  },
  leaderboard: {
    label: 'Leaderboard',
    description: 'Community benchmark leaderboard -- compare local LLM performance',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 300,
    minHeight: 200,
    icon: 'Trophy',
  },
  'config-packs': {
    label: 'Config Packs',
    description: 'Browse and install community config packs',
    pages: ['dashboard'],
    minWidth: 250,
    minHeight: 150,
    icon: 'Package',
  },
  bottleneck: {
    label: 'Bottleneck',
    description: 'Performance bottleneck analysis and suggestions',
    pages: ['dashboard'],
    minWidth: 220,
    minHeight: 120,
    icon: 'Activity',
  },
  'config-summary': {
    label: 'Config Summary',
    description: 'LLM performance, config sync status, and community stats',
    pages: ['dashboard'],
    minWidth: 300,
    minHeight: 120,
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
    icon: 'FolderOpen',
    isExplorerToggle: true,
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
    icon: 'Terminal',
  },
  openhands: {
    label: 'OpenHands',
    description: 'AI coding agent interface',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
  },
  editor: {
    label: 'Editor',
    description: 'Monaco code editor with tabs',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 300,
    minHeight: 150,
    icon: 'Code2',
  },
  git: {
    label: 'Source Control',
    description: 'Git status, staging, and commits',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'GitBranch',
  },
  diff: {
    label: 'Diff Viewer',
    description: 'Side-by-side file diff viewer',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 300,
    minHeight: 150,
    icon: 'Diff',
  },
  'find-replace': {
    label: 'Find & Replace',
    description: 'Search and replace across files',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
  },
  problems: {
    label: 'Problems',
    description: 'Errors, warnings, and diagnostics',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 100,
    icon: 'AlertCircle',
  },
  debug: {
    label: 'Debug',
    description: 'Breakpoints, call stack, and variables',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 150,
    icon: 'Bug',
  },
  extensions: {
    label: 'Extensions',
    description: 'Plugin marketplace and management',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'Puzzle',
  },
  collaboration: {
    label: 'Collaboration',
    description: 'Connected users, cursors, and team chat',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 150,
    icon: 'Users',
  },
  minimap: {
    label: 'Minimap',
    description: 'Bird\'s eye codebase architecture graph',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 200,
    icon: 'Map',
  },
  'context-bus': {
    label: 'ContextBus',
    description: 'Lite/Heavy mode toggle and bus status',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'Radio',
  },
  sync: {
    label: 'Sync',
    description: 'Bidirectional SQLite/PG/Redis sync dashboard',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'ArrowLeftRight',
  },
  'injection-viewer': {
    label: 'Injection Viewer',
    description: '9-section webhook injection live viewer',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
    icon: 'Eye',
  },
  epistemic: {
    label: 'Epistemic',
    description: 'Evidence pipeline and epistemic sustainability',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 150,
    icon: 'Scale',
  },
  'llm-orchestration': {
    label: 'LLM',
    description: 'Local LLM orchestration (vllm-mlx + Qwen3)',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'Cpu',
  },
  agents: {
    label: 'Agents',
    description: 'Claude Code-style agent task submission',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
    icon: 'Bot',
  },
  librarian: {
    label: 'Librarian',
    description: 'Repo librarian with 8-intent query system',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
    icon: 'Library',
  },
  'swarm-controller': {
    label: 'Swarm Controller',
    description: 'Cost tracking, harmonizer gate, and per-agent resource meters',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
  },
  'today-learnings': {
    label: 'Today\'s Learnings',
    description: 'Learnings feed with domain tags, evidence status, and confidence',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 200,
    minHeight: 120,
  },
  settings: {
    label: 'Settings',
    description: 'System configuration, service status, and install wizard',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 280,
    minHeight: 200,
    icon: 'Settings',
    position: 'bottom',
  },
  notifications: {
    label: 'Notifications',
    description: 'Alerts, event feed, and action items',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 250,
    minHeight: 150,
    icon: 'Bell',
    position: 'bottom',
  },
  'frontend-preview': {
    label: 'Preview',
    description: 'Device frame preview for web and mobile apps (iOS, Android, Desktop)',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 350,
    minHeight: 300,
    icon: 'Monitor',
  },
  'node-red': {
    label: 'Node-RED',
    description: 'Visual event-driven flow monitor (Node-RED + FastAPI + PostgreSQL)',
    pages: ['dashboard', 'synaptic', 'live'],
    minWidth: 300,
    minHeight: 200,
    icon: 'Workflow',
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
  const allMeta = getAllPanelMetadata();
  const meta = allMeta[panelId];
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
      <SynapticSplitView />
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

function SwarmPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="swarm">
      <SwarmView />
    </PanelWrapper>
  );
}

function HarmonizerPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="harmonizer">
      <HarmonizerView />
    </PanelWrapper>
  );
}

function EvidencePanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="evidence">
      <EvidenceView />
    </PanelWrapper>
  );
}

function BenchmarkConsentPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="benchmark-consent">
      <BenchmarkConsentModal
        isOpen={true}
        onClose={() => {}}
        onConsent={() => {}}
      />
    </PanelWrapper>
  );
}

function IntegrationsPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="integrations">
      <IntegrationsModal isOpen={true} onClose={() => {}} />
    </PanelWrapper>
  );
}

function LeaderboardPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="leaderboard">
      <LeaderboardView />
    </PanelWrapper>
  );
}

function ConfigPacksPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="config-packs">
      <ConfigPackBrowser />
    </PanelWrapper>
  );
}

// Placeholder benchmark input for standalone panel rendering
const BOTTLENECK_PLACEHOLDER_INPUT: BenchmarkInput = {
  mode: 'pipeline',
  phase_timings: {
    context_build: 120,
    retrieval: 85,
    llm_local: 450,
    tool_exec: 200,
    post_process: 45,
  },
  total_duration_ms: 900,
  system: {
    gpu_util_pct: 72,
    cpu_util_pct: 45,
    ram_used_pct: 68,
    swap_active: false,
    temperature_c: 78,
  },
  ttft: { p50_ms: 180, p95_ms: 420, p99_ms: 680 },
};

function BottleneckPanel(_props: IDockviewPanelProps) {
  const report = analyzeBottleneck(BOTTLENECK_PLACEHOLDER_INPUT);
  return (
    <PanelWrapper panelId="bottleneck">
      <BottleneckCard report={report} benchmarkInput={BOTTLENECK_PLACEHOLDER_INPUT} />
    </PanelWrapper>
  );
}

function ConfigSummaryPanel(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="config-summary">
      <ConfigBenchmarkSummary />
    </PanelWrapper>
  );
}

function DashboardShellPanel(_props: IDockviewPanelProps) {
  return <DashboardShell />;
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

function EditorPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="editor">
      <CodeEditorPanel />
    </PanelWrapper>
  );
}

function GitPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="git">
      <GitPanel />
    </PanelWrapper>
  );
}

function DiffViewerPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="diff">
      <DiffViewerPanel />
    </PanelWrapper>
  );
}

function FindReplacePanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="find-replace">
      <FindReplacePanel />
    </PanelWrapper>
  );
}

function ProblemsPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="problems">
      <ProblemsPanel />
    </PanelWrapper>
  );
}

function MemoryExplorerPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="memory">
      <MemoryExplorerPanel />
    </PanelWrapper>
  );
}

function SessionTimelinePanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="timeline">
      <SessionTimelinePanel />
    </PanelWrapper>
  );
}

function DebugPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="debug">
      <DebugPanel />
    </PanelWrapper>
  );
}

function ExtensionsPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="extensions">
      <ExtensionsPanel />
    </PanelWrapper>
  );
}

function CollaborationPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="collaboration">
      <CollaborationPanel />
    </PanelWrapper>
  );
}

function MinimapPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="minimap">
      <MinimapPanel />
    </PanelWrapper>
  );
}

function ContextBusPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="context-bus">
      <ContextBusPanel />
    </PanelWrapper>
  );
}

function SyncPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="sync">
      <SyncPanel />
    </PanelWrapper>
  );
}

function InjectionViewerPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="injection-viewer">
      <InjectionViewerPanel />
    </PanelWrapper>
  );
}

function EpistemicPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="epistemic">
      <EpistemicPanel />
    </PanelWrapper>
  );
}

function LLMOrchestrationPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="llm-orchestration">
      <LLMOrchestrationPanel />
    </PanelWrapper>
  );
}

function AgentPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="agents">
      <AgentPanel />
    </PanelWrapper>
  );
}

function LibrarianPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="librarian">
      <LibrarianPanel />
    </PanelWrapper>
  );
}

function SwarmControllerPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="swarm-controller">
      <SwarmControllerPanel />
    </PanelWrapper>
  );
}

function TodayLearningsPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="today-learnings">
      <TodayLearningsPanel />
    </PanelWrapper>
  );
}

function SettingsPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="settings">
      <SettingsPanel />
    </PanelWrapper>
  );
}

function NotificationsPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="notifications">
      <NotificationsPanel />
    </PanelWrapper>
  );
}

function FrontendPreviewPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="frontend-preview">
      <FrontendPreviewPanel />
    </PanelWrapper>
  );
}

function NodeRedPanelView(_props: IDockviewPanelProps) {
  return (
    <PanelWrapper panelId="node-red">
      <NodeRedPanel />
    </PanelWrapper>
  );
}

// ---------------------------------------------------------------------------
// Panel component registry
// Maps panel IDs to their React components for DockviewReact `components` prop
// ---------------------------------------------------------------------------

export const panelComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  // Primary shell (DashboardShell with its own nav — Dashboard/Synaptic/Live View)
  'dashboard-shell': DashboardShellPanel,
  // Core panels (always available — can dock around the shell)
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
  swarm: SwarmPanel,
  harmonizer: HarmonizerPanel,
  evidence: EvidencePanel,
  // Benchmark / Config / Community panels
  'benchmark-consent': BenchmarkConsentPanel,
  integrations: IntegrationsPanel,
  leaderboard: LeaderboardPanel,
  'config-packs': ConfigPacksPanel,
  bottleneck: BottleneckPanel,
  'config-summary': ConfigSummaryPanel,
  // IDE panels (Electron-only — gracefully degrade with placeholder in web)
  explorer: ExplorerPanel,
  docker: DockerPanelView,
  terminal: TerminalPanelView,
  openhands: OpenHandsPanelView,
  editor: EditorPanelView,
  git: GitPanelView,
  diff: DiffViewerPanelView,
  'find-replace': FindReplacePanelView,
  problems: ProblemsPanelView,
  memory: MemoryExplorerPanelView,
  timeline: SessionTimelinePanelView,
  debug: DebugPanelView,
  extensions: ExtensionsPanelView,
  collaboration: CollaborationPanelView,
  minimap: MinimapPanelView,
  // Context DNA deep panels (Phase 10)
  'context-bus': ContextBusPanelView,
  sync: SyncPanelView,
  'injection-viewer': InjectionViewerPanelView,
  epistemic: EpistemicPanelView,
  'llm-orchestration': LLMOrchestrationPanelView,
  agents: AgentPanelView,
  librarian: LibrarianPanelView,
  'swarm-controller': SwarmControllerPanelView,
  'today-learnings': TodayLearningsPanelView,
  settings: SettingsPanelView,
  notifications: NotificationsPanelView,
  'frontend-preview': FrontendPreviewPanelView,
  'node-red': NodeRedPanelView,
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
