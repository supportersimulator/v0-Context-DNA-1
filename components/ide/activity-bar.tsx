'use client';

import { useCallback, useState } from 'react';
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
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Activity Bar — VS Code-style narrow icon strip
//
// Renders on the outermost left (or right) edge of the IDE.
// Each icon toggles a dockview panel or the explorer sidebar.
// Active state: green left-border accent + white icon.
// ---------------------------------------------------------------------------

export interface ActivityBarProps {
  /** Toggle the ExplorerShell file sidebar */
  onToggleExplorer: () => void;
  /** Whether the explorer sidebar is currently visible */
  explorerVisible: boolean;
  /** Toggle a dockview panel by its panel ID */
  onTogglePanel: (panelId: string) => void;
  /** Panel IDs currently open in dockview */
  activePanelIds: string[];
  /** Which side to render on (default: 'left') */
  side?: 'left' | 'right';
}

// ---------------------------------------------------------------------------
// Icon definitions — top section (panels) and bottom section (utilities)
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

const TOP_ICONS: ActivityIconDef[] = [
  {
    id: 'explorer',
    icon: FolderOpen,
    label: 'Explorer',
    isExplorerToggle: true,
  },
  {
    id: 'search',
    icon: Search,
    label: 'Search',
  },
  {
    id: 'activity',
    icon: GitBranch,
    label: 'Activity',
  },
  {
    id: 'health',
    icon: Bug,
    label: 'Health & Debug',
  },
  {
    id: 'synaptic',
    icon: Brain,
    label: 'Synaptic Chat',
  },
  {
    id: 'injection',
    icon: Syringe,
    label: 'Injection / Live View',
  },
  {
    id: 'terminal',
    icon: Terminal,
    label: 'Terminal',
  },
];

const BOTTOM_ICONS: ActivityIconDef[] = [
  {
    id: 'install',
    icon: Settings,
    label: 'Settings / Install Wizard',
  },
  {
    id: 'notifications',
    icon: Bell,
    label: 'Notifications',
  },
];

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
}: {
  def: ActivityIconDef;
  isActive: boolean;
  side: 'left' | 'right';
  onClick: () => void;
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
        <Icon className="w-[22px] h-[22px]" />
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
  side = 'left',
}: ActivityBarProps) {
  const handleClick = useCallback(
    (def: ActivityIconDef) => {
      if (def.isExplorerToggle) {
        onToggleExplorer();
      } else if (def.id === 'notifications') {
        // Placeholder — will connect to notification system
        // For now, no-op (notifications panel not yet implemented)
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
        {TOP_ICONS.map((def) => (
          <ActivityIconButton
            key={def.id}
            def={def}
            isActive={isActive(def)}
            side={side}
            onClick={() => handleClick(def)}
          />
        ))}
      </div>

      {/* ---- Spacer ---- */}
      <div className="flex-1" />

      {/* ---- Separator line ---- */}
      <div className="mx-3 h-px bg-[#2a2a35]" />

      {/* ---- Bottom section: settings & notifications ---- */}
      <div className="flex flex-col items-center pb-1">
        {BOTTOM_ICONS.map((def) => (
          <ActivityIconButton
            key={def.id}
            def={def}
            isActive={isActive(def)}
            side={side}
            onClick={() => handleClick(def)}
          />
        ))}
      </div>
    </div>
  );
}
