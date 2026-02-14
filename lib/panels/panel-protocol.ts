// =============================================================================
// panel-protocol.ts — Panel Protocol v1 Runtime
//
// Any tool becomes a ContextDNA panel by implementing three primitives:
// Snapshot (current state), Events (changes), Commands (actions).
//
// Transport: File (Lite) | WebSocket (Heavy) | HTTP/SSE (Either)
// Spec: Dashboard-Workspace-Live-Spec.md Section 6
// =============================================================================

// ---------------------------------------------------------------------------
// Protocol message types
// ---------------------------------------------------------------------------

export interface PanelSnapshot {
  type: 'snapshot';
  panelId: string;
  ts: number;
  payload: Record<string, unknown>;
}

export interface PanelEvent {
  type: 'event';
  panelId: string;
  ts: number;
  event: string;
  payload: Record<string, unknown>;
}

export interface PanelCommand {
  type: 'command';
  id: string;
  panelId: string;
  name: string;
  args: Record<string, unknown>;
}

export type PanelMessage = PanelSnapshot | PanelEvent | PanelCommand;

// ---------------------------------------------------------------------------
// Panel manifest (contextdna.panel.json)
// ---------------------------------------------------------------------------

export type PanelTransport = 'file' | 'websocket' | 'http';
export type PanelCapability = 'snapshot' | 'events' | 'commands';

export interface PanelPermissions {
  readWorkspace: boolean;
  network: 'none' | 'local-only' | 'internet';
  exec: boolean;
}

export interface PanelManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entry: {
    transport: PanelTransport;
    path?: string;       // File transport: ~/.contextdna/panels/<id>/
    url?: string;        // WS/HTTP transport: ws://localhost:PORT
  };
  capabilities: PanelCapability[];
  permissions: PanelPermissions;
  ui: {
    icon: string;         // Lucide icon name
    defaultSize: 'sm' | 'md' | 'lg' | 'full';
    tags: string[];
  };
}

// ---------------------------------------------------------------------------
// Panel connection state
// ---------------------------------------------------------------------------

export type PanelConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PanelConnection {
  manifest: PanelManifest;
  status: PanelConnectionStatus;
  lastSnapshot: PanelSnapshot | null;
  lastEvent: PanelEvent | null;
  lastActivity: number;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Panel Registry — manages registered panels
// ---------------------------------------------------------------------------

export type PanelRegistryListener = (panels: ReadonlyMap<string, PanelConnection>) => void;

class PanelRegistry {
  private panels: Map<string, PanelConnection> = new Map();
  private listeners: Set<PanelRegistryListener> = new Set();

  /** Register a panel from its manifest. */
  register(manifest: PanelManifest): void {
    if (this.panels.has(manifest.id)) return;
    this.panels.set(manifest.id, {
      manifest,
      status: 'disconnected',
      lastSnapshot: null,
      lastEvent: null,
      lastActivity: Date.now(),
      error: null,
    });
    this.notify();
  }

  /** Unregister a panel. */
  unregister(panelId: string): void {
    this.panels.delete(panelId);
    this.notify();
  }

  /** Update connection status. */
  setStatus(panelId: string, status: PanelConnectionStatus, error?: string): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    this.panels.set(panelId, {
      ...panel,
      status,
      error: error ?? null,
      lastActivity: Date.now(),
    });
    this.notify();
  }

  /** Record a snapshot from a panel. */
  recordSnapshot(panelId: string, snapshot: PanelSnapshot): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    this.panels.set(panelId, {
      ...panel,
      lastSnapshot: snapshot,
      lastActivity: Date.now(),
    });
    this.notify();
  }

  /** Record an event from a panel. */
  recordEvent(panelId: string, event: PanelEvent): void {
    const panel = this.panels.get(panelId);
    if (!panel) return;
    this.panels.set(panelId, {
      ...panel,
      lastEvent: event,
      lastActivity: Date.now(),
    });
    this.notify();
  }

  /** Send a command to a panel (via transport layer). */
  sendCommand(command: PanelCommand): void {
    // In Lite mode, commands are written to the panel's command file
    // In Heavy mode, commands are sent via WebSocket
    // For now, emit via the event bus for consumers to handle
    const panel = this.panels.get(command.panelId);
    if (!panel) return;
    // Transport handling will be implemented per-transport
    console.debug(`[PanelProtocol] Command -> ${command.panelId}: ${command.name}`);
  }

  // ---- Queries ----

  get(panelId: string): PanelConnection | undefined {
    return this.panels.get(panelId);
  }

  getAll(): ReadonlyMap<string, PanelConnection> {
    return this.panels;
  }

  getByTag(tag: string): PanelConnection[] {
    return [...this.panels.values()].filter((p) =>
      p.manifest.ui.tags.includes(tag),
    );
  }

  getConnected(): PanelConnection[] {
    return [...this.panels.values()].filter((p) => p.status === 'connected');
  }

  // ---- Subscriptions ----

  subscribe(listener: PanelRegistryListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try { listener(this.panels); } catch { /* listener errors don't break registry */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: PanelRegistry | null = null;

export function getPanelRegistry(): PanelRegistry {
  if (!instance) {
    instance = new PanelRegistry();
  }
  return instance;
}

export type { PanelRegistry };
