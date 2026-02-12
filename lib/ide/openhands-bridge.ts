// =============================================================================
// openhands-bridge.ts — OpenHands Agent Integration Bridge
//
// Provides both iframe embedding (Phase 1) and native API integration (Phase 2)
// for OpenHands multi-agent coding swarm.
//
// Architecture (from electron-ide-context-dna.md):
//   OpenHands = hands + workers (swarm executor)
//   ContextDNA = brain (memory, Librarian, Harmonizer, routing)
//   OpenHands agents call ContextDNA tools, never "think globally"
//
// Phase 1: iframe embed + health monitoring (current)
// Phase 2: Native API — agent tasks, streaming, tool approval, swarm status
//
// OpenHands backend: port 3000 (REST + WebSocket)
// OpenHands frontend: port 3001 (Remix SPA, dev mode)
// =============================================================================

import { getServiceUrl } from './service-registry';
import {
  UNIFIED_TOOLS,
  formatToolsForPrompt,
  type ToolCategory,
  type ToolDefinition,
} from './unified-tool-language';
import {
  buildTemplate,
  generateAgentPrompts,
  type SwarmInjectionTemplate,
  type TemplateBuildOptions,
  type AgentTaskPrompt,
} from './swarm-injection-template';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentState =
  | 'init'
  | 'running'
  | 'awaiting_user_input'
  | 'paused'
  | 'stopped'
  | 'finished'
  | 'rejected'
  | 'error';

export interface OpenHandsConversation {
  conversation_id: string;
  title: string;
  created_at: string;
  last_updated_at: string;
  status: AgentState;
  selected_repository?: string;
}

export interface OpenHandsEvent {
  id: number;
  source: 'user' | 'agent';
  timestamp: string;
  action?: string;
  observation?: string;
  message?: string;
  args?: Record<string, unknown>;
  content?: string;
  extras?: Record<string, unknown>;
}

export interface OpenHandsModelConfig {
  model: string;
  api_key?: string;
  base_url?: string;
}

export interface SwarmStatus {
  connected: boolean;
  activeConversations: number;
  conversations: OpenHandsConversation[];
  models: string[];
}

// ---------------------------------------------------------------------------
// Tool language — all agents speak the same tool schemas
//
// Instead of each agent having bespoke tool definitions, they all reference
// UNIFIED_TOOLS from unified-tool-language.ts. This is the "Rosetta Stone."
//
// Agents get ONLY the tool categories relevant to their role:
//   - Search worker: ['search', 'file_read', 'context']
//   - Patch worker:  ['file_read', 'file_write', 'search', 'context']
//   - Test worker:   ['terminal', 'file_read', 'context']
//   - Full agent:    all categories
// ---------------------------------------------------------------------------

/** Pre-built role profiles — which tool categories each swarm role needs */
export const AGENT_ROLE_PROFILES: Record<string, ToolCategory[]> = {
  search:      ['search', 'file_read', 'context'],
  patch:       ['file_read', 'file_write', 'search', 'context'],
  test:        ['terminal', 'file_read', 'context'],
  review:      ['file_read', 'search', 'context'],
  ops:         ['terminal', 'process', 'ops', 'context'],
  full:        ['file_read', 'file_write', 'search', 'terminal', 'process', 'context', 'ops', 'task', 'web'],
};

/**
 * Get the tool prompt block for a specific agent role.
 * This is injected into the agent's system prompt — compact format
 * keeps token count low (~40 tokens per tool vs ~200 for full JSON).
 *
 * @example
 *   // DeepSeek search worker gets only search + read + context tools:
 *   const prompt = getToolPromptForRole('search');
 *   // → "- glob(pattern, path?): Fast file pattern matching..."
 *   // → "- grep(pattern, path?, include?): Search file contents..."
 *   // → "- context_query(query, max_results?): Query ContextDNA Librarian..."
 *
 *   // Full agent gets everything:
 *   const prompt = getToolPromptForRole('full');
 */
export function getToolPromptForRole(role: keyof typeof AGENT_ROLE_PROFILES): string {
  const categories = AGENT_ROLE_PROFILES[role];
  if (!categories) return formatToolsForPrompt();
  return formatToolsForPrompt(categories, 'compact');
}

/**
 * Get tool definitions as JSON Schema (for models that support native function calling).
 * OpenHands passes these as the `tools` parameter in the LLM API call.
 */
export function getToolSchemaForRole(role: keyof typeof AGENT_ROLE_PROFILES): string {
  const categories = AGENT_ROLE_PROFILES[role];
  if (!categories) return formatToolsForPrompt(undefined, 'full');
  return formatToolsForPrompt(categories, 'full');
}

// ---------------------------------------------------------------------------
// OpenHands API Bridge
// ---------------------------------------------------------------------------

class OpenHandsBridge {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getServiceUrl('openhands') || 'http://127.0.0.1:3000';
  }

  // -----------------------------------------------------------------------
  // Health & Connection
  // -----------------------------------------------------------------------

  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/options/models`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/options/models`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data?.models ?? [];
    } catch {
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Conversation Management (Phase 2)
  // -----------------------------------------------------------------------

  async listConversations(): Promise<OpenHandsConversation[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/conversations`);
      if (!res.ok) return [];
      const data = await res.json();
      return data?.results ?? data ?? [];
    } catch {
      return [];
    }
  }

  async createConversation(initialMessage: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_user_msg: initialMessage }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.conversation_id ?? null;
    } catch {
      return null;
    }
  }

  async getConversationEvents(
    conversationId: string,
    startId?: number,
  ): Promise<OpenHandsEvent[]> {
    try {
      const params = new URLSearchParams();
      if (startId !== undefined) params.set('start_id', String(startId));
      const res = await fetch(
        `${this.baseUrl}/api/conversations/${conversationId}/events?${params}`,
      );
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  async sendMessage(conversationId: string, message: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async stopConversation(conversationId: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/conversations/${conversationId}/stop`,
        { method: 'POST' },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Swarm Status (for activity bar + status bar)
  // -----------------------------------------------------------------------

  async getSwarmStatus(): Promise<SwarmStatus> {
    const [connected, conversations, models] = await Promise.all([
      this.checkHealth(),
      this.listConversations(),
      this.getAvailableModels(),
    ]);

    const active = conversations.filter(
      (c) => c.status === 'running' || c.status === 'awaiting_user_input',
    );

    return {
      connected,
      activeConversations: active.length,
      conversations,
      models,
    };
  }

  // -----------------------------------------------------------------------
  // Swarm Spawning — "spawn10" from injection template
  //
  // Generates agent prompts from a SwarmInjectionTemplate, then creates
  // one OpenHands conversation per agent. Each conversation gets:
  //   - The serialized context packet (2-4k tokens)
  //   - Role-specific tool list
  //   - Per-agent output contract (TOUCH, FINDINGS, DIFF, TESTS, RISKS)
  //   - Token budget limits
  // -----------------------------------------------------------------------

  /**
   * Build a swarm injection template and generate agent task prompts.
   * Does NOT create conversations — use spawnSwarm() for that.
   */
  prepareSwarm(opts: TemplateBuildOptions): AgentTaskPrompt[] {
    const template = buildTemplate(opts);
    return generateAgentPrompts(template);
  }

  /**
   * Spawn a full swarm: build template → generate prompts → create conversations.
   * Returns the conversation IDs for monitoring.
   *
   * @example
   *   const results = await bridge.spawnSwarm({
   *     goal: 'Add WebSocket real-time data to all IDE panels',
   *     invariants: ['Do not break panel-factory registration'],
   *     hotspots: [{ path: 'lib/ide/ws-manager.ts', why: 'WebSocket manager' }],
   *   });
   */
  async spawnSwarm(
    opts: TemplateBuildOptions,
  ): Promise<Array<{ agentId: string; role: string; conversationId: string | null }>> {
    const prompts = this.prepareSwarm(opts);
    const results: Array<{ agentId: string; role: string; conversationId: string | null }> = [];

    for (const prompt of prompts) {
      const conversationId = await this.createConversation(prompt.systemPrompt);
      results.push({
        agentId: prompt.agentId,
        role: prompt.role,
        conversationId,
      });
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // WebSocket event streaming (Phase 2)
  // -----------------------------------------------------------------------

  connectEventStream(conversationId: string): WebSocket | null {
    if (typeof window === 'undefined') return null;

    const wsBase = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    try {
      return new WebSocket(`${wsBase}/ws/${conversationId}`);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _bridge: OpenHandsBridge | null = null;

export function getOpenHandsBridge(): OpenHandsBridge {
  if (!_bridge) {
    _bridge = new OpenHandsBridge();
  }
  return _bridge;
}
