// =============================================================================
// agent-manager.ts — Agent Lifecycle Management (Singleton)
//
// Manages registration, foreground/background switching, status tracking,
// and context handoff for all agents (Claude, Synaptic, OpenHands, DeepSeek).
//
// Spec: Dashboard-Workspace-Live-Plans.md Section 5
// =============================================================================

import { getProjectDialogue } from './project-dialogue';
import type { ProjectDialogueEvent } from './project-dialogue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'idle' | 'working' | 'error' | 'offline';
export type AgentRole = 'foreground' | 'background';

export interface AgentDefinition {
  id: string;
  name: string;
  type: 'cloud' | 'local' | 'autonomous';
  accent: string;       // Tab accent color
  icon: string;         // Lucide icon name
  description: string;
}

export interface AgentState {
  definition: AgentDefinition;
  role: AgentRole;
  status: AgentStatus;
  lastActivity: number;
}

export type AgentManagerListener = (agents: ReadonlyMap<string, AgentState>) => void;

// ---------------------------------------------------------------------------
// Built-in agent definitions (from spec Section 5.2)
// ---------------------------------------------------------------------------

export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    type: 'cloud',
    accent: '#22c55e',
    icon: 'Bot',
    description: 'Complex reasoning, code generation, multi-file edits',
  },
  {
    id: 'synaptic',
    name: 'Synaptic',
    type: 'local',
    accent: '#a78bfa',
    icon: 'Brain',
    description: 'Fast queries, voice, routine tasks, reviews',
  },
  {
    id: 'openhands',
    name: 'OpenHands',
    type: 'autonomous',
    accent: '#f59e0b',
    icon: 'Users',
    description: 'Multi-step coding tasks, autonomous execution',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'cloud',
    accent: '#38bdf8',
    icon: 'Cpu',
    description: 'Alternative reasoning, cost-effective',
  },
];

// ---------------------------------------------------------------------------
// AgentManager — singleton
// ---------------------------------------------------------------------------

class AgentManager {
  private agents: Map<string, AgentState> = new Map();
  private listeners: Set<AgentManagerListener> = new Set();
  private foregroundId: string | null = null;

  constructor() {
    // Register built-in agents
    for (const def of BUILTIN_AGENTS) {
      this.agents.set(def.id, {
        definition: def,
        role: def.id === 'claude' ? 'foreground' : 'background',
        status: 'idle',
        lastActivity: Date.now(),
      });
    }
    this.foregroundId = 'claude';
  }

  // ---- Queries ----

  getAll(): ReadonlyMap<string, AgentState> {
    return this.agents;
  }

  get(id: string): AgentState | undefined {
    return this.agents.get(id);
  }

  getForeground(): AgentState | undefined {
    return this.foregroundId ? this.agents.get(this.foregroundId) : undefined;
  }

  getForegroundId(): string | null {
    return this.foregroundId;
  }

  getBackground(): AgentState[] {
    return [...this.agents.values()].filter((a) => a.role === 'background');
  }

  // ---- Mutations ----

  /** Switch an agent to foreground. Previous foreground moves to background. */
  switchTo(agentId: string): void {
    const target = this.agents.get(agentId);
    if (!target) return;

    // Move current foreground to background
    if (this.foregroundId && this.foregroundId !== agentId) {
      const prev = this.agents.get(this.foregroundId);
      if (prev) {
        this.agents.set(this.foregroundId, { ...prev, role: 'background' });
      }
      // Emit context handoff event
      const dialogue = getProjectDialogue();
      dialogue.emit({
        type: 'context_handoff',
        agent_id: agentId,
        timestamp: Date.now(),
        payload: {
          from: this.foregroundId,
          to: agentId,
          recentContext: dialogue.getRecent(10),
        },
      });
    }

    // Move target to foreground
    this.agents.set(agentId, { ...target, role: 'foreground' });
    this.foregroundId = agentId;
    this.notify();
  }

  /** Update an agent's status (idle, working, error, offline). */
  setStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.set(agentId, { ...agent, status, lastActivity: Date.now() });

    // Emit status event
    getProjectDialogue().emit({
      type: 'agent_status',
      agent_id: agentId,
      timestamp: Date.now(),
      payload: { status },
    });

    this.notify();
  }

  /** Register a custom agent (beyond the 4 built-in). */
  register(definition: AgentDefinition): void {
    if (this.agents.has(definition.id)) return;
    this.agents.set(definition.id, {
      definition,
      role: 'background',
      status: 'idle',
      lastActivity: Date.now(),
    });
    this.notify();
  }

  /** Unregister an agent. Cannot unregister the foreground agent. */
  unregister(agentId: string): void {
    if (agentId === this.foregroundId) return;
    this.agents.delete(agentId);
    this.notify();
  }

  // ---- Subscriptions ----

  subscribe(listener: AgentManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.agents);
      } catch {
        // Listener errors don't break the manager
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!instance) {
    instance = new AgentManager();
  }
  return instance;
}

export type { AgentManager };
