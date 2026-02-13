'use client';

// =============================================================================
// agent-switcher.tsx — Agent Switcher UI Component
//
// Extends the SynapticSplitView keep-alive pattern to all registered agents.
// One foreground agent is visible; background agents stay mounted but hidden.
// Tab bar: [Claude] [Synaptic] [OpenHands] [DeepSeek]
//
// Spec: Dashboard-Workspace-Live-Plans.md Section 5.3
// =============================================================================

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Bot, Brain, Users, Cpu, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAgentManager, type AgentState, type AgentStatus } from './agent-manager';

// ---------------------------------------------------------------------------
// Icon resolver for agent definitions
// ---------------------------------------------------------------------------

const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Brain,
  Users,
  Cpu,
};

function resolveAgentIcon(name: string): LucideIcon {
  return AGENT_ICON_MAP[name] ?? Circle;
}

// ---------------------------------------------------------------------------
// Status indicator dot
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-gray-500',
  working: 'bg-green-400 animate-pulse',
  error: 'bg-red-500',
  offline: 'bg-gray-700',
};

function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span
      className={cn('inline-block w-1.5 h-1.5 rounded-full', STATUS_COLORS[status])}
      title={status}
    />
  );
}

// ---------------------------------------------------------------------------
// AgentSwitcher — main export
// ---------------------------------------------------------------------------

export interface AgentSwitcherProps {
  /** Map of agent ID → rendered content. Only mounted agents are provided. */
  children: Record<string, ReactNode>;
}

export function AgentSwitcher({ children }: AgentSwitcherProps) {
  const manager = useMemo(() => getAgentManager(), []);
  const [agents, setAgents] = useState<ReadonlyMap<string, AgentState>>(() => manager.getAll());
  const [mounted, setMounted] = useState<Set<string>>(() => {
    const fg = manager.getForegroundId();
    return new Set(fg ? [fg] : []);
  });

  // Subscribe to agent state changes
  useEffect(() => {
    return manager.subscribe((updated) => {
      setAgents(new Map(updated));
    });
  }, [manager]);

  const foregroundId = useMemo(() => {
    for (const [id, state] of agents) {
      if (state.role === 'foreground') return id;
    }
    return null;
  }, [agents]);

  const handleSwitch = useCallback(
    (agentId: string) => {
      // Mount on first visit (keep-alive)
      setMounted((prev) => {
        if (prev.has(agentId)) return prev;
        const next = new Set(prev);
        next.add(agentId);
        return next;
      });
      manager.switchTo(agentId);
    },
    [manager],
  );

  // Sorted agent list: foreground first, then alphabetical
  const agentList = useMemo(() => {
    return [...agents.entries()].sort(([aId, aState], [bId, bState]) => {
      if (aState.role === 'foreground') return -1;
      if (bState.role === 'foreground') return 1;
      return aId.localeCompare(bId);
    });
  }, [agents]);

  return (
    <div className="flex flex-col h-full">
      {/* ---- Tab bar ---- */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-[#0d0d14] border-b border-[#2a2a35] overflow-x-auto">
        {agentList.map(([id, state]) => {
          const Icon = resolveAgentIcon(state.definition.icon);
          const isActive = id === foregroundId;

          return (
            <button
              key={id}
              onClick={() => handleSwitch(id)}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-[#1a1a24] text-white'
                  : 'text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#12121a]',
              )}
              title={state.definition.description}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{state.definition.name}</span>
              <StatusDot status={state.status} />
              {/* Active accent underline */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                  style={{ backgroundColor: state.definition.accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ---- Content — keep-alive: mount once, toggle visibility ---- */}
      <div className="flex-1 min-h-0 relative">
        {agentList.map(([id]) => {
          if (!mounted.has(id)) return null;
          const content = children[id];
          if (!content) return null;

          return (
            <div
              key={id}
              className={cn(
                'absolute inset-0',
                id === foregroundId ? 'z-10 visible' : 'z-0 invisible',
              )}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
