'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FolderOpen,
  Search,
  GitBranch,
  Bug,
  Brain,
  Syringe,
  Terminal,
  Settings,
  Bell,
  Workflow,
  Shield,
  FlaskConical,
  Code2,
  Diff,
  AlertCircle,
  BookOpen,
  Clock,
  Puzzle,
  Users,
  Map,
  Radio,
  ArrowLeftRight,
  Eye,
  Scale,
  Cpu,
  Bot,
  Library,
  GitCompare,
  Plug,
  Trophy,
  Package,
  Activity,
  CircleDot,
} from 'lucide-react';
import { ActivityBarBadge, type BadgeVariant } from './activity-bar-badge';
import { PANEL_METADATA, IDE_PANEL_METADATA, type PanelMeta, type ParentPage } from './panel-factory';
import { useCurrentPage } from '@/lib/contexts/page-context';
import { getAgentManager, type AgentState } from '@/lib/agents/agent-manager';

// ---------------------------------------------------------------------------
// Activity Bar — VS Code-style narrow icon strip
//
// Renders on the outermost left (or right) edge of the IDE.
// Each icon toggles a dockview panel or the explorer sidebar.
// Active state: green left-border accent + white icon.
// ---------------------------------------------------------------------------

export interface ActivityBadge {
  count: number;
  variant?: BadgeVariant;
  dot?: boolean;
}

export interface ActivityBarProps {
  /** Toggle the ExplorerShell file sidebar */
  onToggleExplorer: () => void;
  /** Whether the explorer sidebar is currently visible */
  explorerVisible: boolean;
  /** Toggle a dockview panel by its panel ID */
  onTogglePanel: (panelId: string) => void;
  /** Panel IDs currently open in dockview */
  activePanelIds: string[];
  /** Badge counts keyed by icon ID */
  badges?: Record<string, ActivityBadge>;
  /** Which side to render on (default: 'left') */
  side?: 'left' | 'right';
}

// ---------------------------------------------------------------------------
// Icon definitions — generated from PanelMeta (single source of truth)
// ---------------------------------------------------------------------------

interface ActivityIconDef {
  /** Unique identifier — matches dockview panel ID or special action */
  id: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tooltip text shown on hover */
  label: string;
  /** If true, this toggles the explorer sidebar instead of a dockview panel */
  isExplorerToggle?: boolean;
}

/** Map PanelMeta icon strings to Lucide components (tree-shake safe) */
const ICON_MAP: Record<string, LucideIcon> = {
  FolderOpen, Search, GitBranch, Bug, Brain, Syringe, Terminal,
  Settings, Bell, Workflow, Shield, FlaskConical, Code2, Diff,
  AlertCircle, BookOpen, Clock, Puzzle, Users, Map, Radio,
  ArrowLeftRight, Eye, Scale, Cpu, Bot, Library, GitCompare,
  Plug, Trophy, Package, Activity, CircleDot,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? CircleDot;
}

/** Build icon arrays from PanelMeta — always includes all panels (web + IDE) */
const ALL_META: Record<string, PanelMeta> = { ...PANEL_METADATA, ...IDE_PANEL_METADATA };

function buildIconDefs(position: 'top' | 'bottom', page: ParentPage): ActivityIconDef[] {
  return Object.entries(ALL_META)
    .filter(([, m]) => m.icon && m.pages.includes(page) && (position === 'bottom' ? m.position === 'bottom' : m.position !== 'bottom'))
    .map(([id, m]) => ({
      id,
      icon: resolveIcon(m.icon!),
      label: m.label,
      ...(m.isExplorerToggle ? { isExplorerToggle: true } : {}),
    }));
}

// ---------------------------------------------------------------------------
// Tooltip component — appears on hover next to icon
// ---------------------------------------------------------------------------

function ActivityTooltip({
  label,
  side,
  visible,
}: {
  label: string;
  side: 'left' | 'right';
  visible: boolean;
}) {
  if (!visible) return null;

  const positionClass =
    side === 'left'
      ? 'left-full ml-2'
      : 'right-full mr-2';

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 ${positionClass}
        px-2 py-1 rounded bg-[#1a1a24] border border-[#2a2a35]
        text-xs text-[#e5e5e5] whitespace-nowrap z-50
        pointer-events-none shadow-lg`}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual icon button
// ---------------------------------------------------------------------------

function ActivityIconButton({
  def,
  isActive,
  side,
  onClick,
  badge,
}: {
  def: ActivityIconDef;
  isActive: boolean;
  side: 'left' | 'right';
  onClick: () => void;
  badge?: ActivityBadge;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = def.icon;

  // Active indicator: 2px green border on the bar-facing edge
  const activeBorderSide = side === 'left' ? 'border-l-2' : 'border-r-2';
  const inactiveBorderSide = side === 'left' ? 'border-l-2' : 'border-r-2';

  return (
    <div className="relative">
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`
          flex items-center justify-center w-12 h-12 transition-colors
          focus:outline-none focus-visible:ring-1 focus-visible:ring-[#22c55e] focus-visible:ring-inset
          ${
            isActive
              ? `${activeBorderSide} border-[#22c55e] text-white`
              : `${inactiveBorderSide} border-transparent text-[#6b6b75] hover:text-[#e5e5e5]`
          }
        `}
        title={def.label}
        aria-label={def.label}
        aria-pressed={isActive}
        role="button"
        tabIndex={0}
      >
        <div className="relative">
          <Icon className="w-[22px] h-[22px]" />
          {badge && (
            <ActivityBarBadge
              count={badge.count}
              variant={badge.variant}
              dot={badge.dot}
            />
          )}
        </div>
      </button>
      <ActivityTooltip label={def.label} side={side} visible={hovered} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityBar — main export
// ---------------------------------------------------------------------------

export function ActivityBar({
  onToggleExplorer,
  explorerVisible,
  onTogglePanel,
  activePanelIds,
  badges = {},
  side = 'left',
}: ActivityBarProps) {
  const page = useCurrentPage();
  const topIcons = useMemo(() => buildIconDefs('top', page), [page]);
  const bottomIcons = useMemo(() => buildIconDefs('bottom', page), [page]);

  // -- Agent status badges (subscribe to AgentManager) --
  const [agentBadges, setAgentBadges] = useState<Record<string, ActivityBadge>>({});

  useEffect(() => {
    const manager = getAgentManager();
    const update = (agents: ReadonlyMap<string, AgentState>) => {
      const newBadges: Record<string, ActivityBadge> = {};
      let errorCount = 0;
      let hasWorking = false;
      for (const [, state] of agents) {
        if (state.status === 'error') errorCount++;
        if (state.status === 'working') hasWorking = true;
      }
      if (errorCount > 0) {
        newBadges['code-editor'] = { count: errorCount, variant: 'error' };
      } else if (hasWorking) {
        newBadges['code-editor'] = { count: 0, dot: true, variant: 'success' };
      }
      setAgentBadges(newBadges);
    };
    update(manager.getAll());
    return manager.subscribe(update);
  }, []);

  // Merge agent-derived badges with prop badges (prop takes priority)
  const mergedBadges = useMemo(() => ({ ...agentBadges, ...badges }), [agentBadges, badges]);

  const handleClick = useCallback(
    (def: ActivityIconDef) => {
      if (def.isExplorerToggle) {
        onToggleExplorer();
      } else {
        onTogglePanel(def.id);
      }
    },
    [onToggleExplorer, onTogglePanel],
  );

  const isActive = useCallback(
    (def: ActivityIconDef): boolean => {
      if (def.isExplorerToggle) return explorerVisible;
      if (def.id === 'notifications') return false;
      return activePanelIds.includes(def.id);
    },
    [explorerVisible, activePanelIds],
  );

  // Border on the dockview-facing edge (inner edge of the bar)
  const borderEdge = side === 'left' ? 'border-r' : 'border-l';

  return (
    <div
      className={`
        flex flex-col h-full w-12 flex-shrink-0 bg-[#0a0a0f]
        ${borderEdge} border-[#2a2a35]
        select-none
      `}
      role="toolbar"
      aria-label="Activity Bar"
      aria-orientation="vertical"
    >
      {/* ---- Top section: panel toggle icons ---- */}
      <div className="flex flex-col items-center pt-1">
        {topIcons.map((def) => (
          <ActivityIconButton
            key={def.id}
            def={def}
            isActive={isActive(def)}
            side={side}
            onClick={() => handleClick(def)}
            badge={mergedBadges[def.id]}
          />
        ))}
      </div>

      {/* ---- Spacer ---- */}
      <div className="flex-1" />

      {/* ---- Separator line ---- */}
      <div className="mx-3 h-px bg-[#2a2a35]" />

      {/* ---- Bottom section: settings & notifications ---- */}
      <div className="flex flex-col items-center pb-1">
        {bottomIcons.map((def) => (
          <ActivityIconButton
            key={def.id}
            def={def}
            isActive={isActive(def)}
            side={side}
            onClick={() => handleClick(def)}
            badge={mergedBadges[def.id]}
          />
        ))}
      </div>
    </div>
  );
}
