// =============================================================================
// agent-mode-store.ts — Agent & System Mode State
//
// agentMode: 'swarm' (multiple agents) | 'single' (one agent only)
// systemMode: 'lite' (in-memory, no external deps) | 'heavy' (SQLite/Redis)
//
// Spec: Dashboard-Workspace-Live-Spec.md Sections 1, 5, 10
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentMode = 'swarm' | 'single';
export type SystemMode = 'lite' | 'heavy';

export interface ModeState {
  agentMode: AgentMode;
  systemMode: SystemMode;
}

export type ModeListener = (state: ModeState) => void;

// ---------------------------------------------------------------------------
// ModeStore — singleton
// ---------------------------------------------------------------------------

class ModeStore {
  private state: ModeState = {
    agentMode: 'swarm',
    systemMode: 'lite',
  };
  private listeners: Set<ModeListener> = new Set();

  getState(): Readonly<ModeState> {
    return this.state;
  }

  setAgentMode(mode: AgentMode): void {
    if (this.state.agentMode === mode) return;
    this.state = { ...this.state, agentMode: mode };
    this.notify();
  }

  setSystemMode(mode: SystemMode): void {
    if (this.state.systemMode === mode) return;
    this.state = { ...this.state, systemMode: mode };
    this.notify();
  }

  subscribe(listener: ModeListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try { listener(this.state); } catch { /* listener errors don't break store */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ModeStore | null = null;

export function getModeStore(): ModeStore {
  if (!instance) {
    instance = new ModeStore();
  }
  return instance;
}

export type { ModeStore };
