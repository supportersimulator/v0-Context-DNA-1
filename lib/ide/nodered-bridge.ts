'use client';

import { getServiceUrl, getServiceWsUrl } from './service-registry';
import { getCapabilityBus } from './capability-bus';

// =============================================================================
// NodeREDBridge — WebSocket client for Node-RED /comms API
//
// Connects to Node-RED's runtime, subscribes to debug + status topics,
// and bridges messages to CapabilityBus.
//
// Lifecycle: singleton, auto-reconnect with exponential backoff.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NodeRedMessage {
  topic: string;
  data: unknown;
  retain?: boolean;
}

export interface NodeRedFlow {
  id: string;
  label: string;
  disabled: boolean;
  nodes: { id: string; type: string; name: string }[];
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'evidence' | 'injection' | 'scheduler' | 'custom';
  flow: unknown; // Node-RED flow JSON
}

export type BridgeState = 'disconnected' | 'connecting' | 'connected' | 'error';

type StateListener = (state: BridgeState) => void;
type MessageListener = (msg: NodeRedMessage) => void;

// ---------------------------------------------------------------------------
// Flow Templates — presets for Context DNA pipelines
// ---------------------------------------------------------------------------

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'evidence-pipeline',
    name: 'Evidence Pipeline Monitor',
    description: 'Monitors claim → quarantine → promotion flow. Displays live evidence stats.',
    category: 'evidence',
    flow: {
      label: 'Evidence Pipeline',
      nodes: [
        { id: 'n1', type: 'http in', name: 'Evidence Webhook' },
        { id: 'n2', type: 'function', name: 'Parse Event' },
        { id: 'n3', type: 'switch', name: 'Route by Type' },
        { id: 'n4', type: 'debug', name: 'Debug Output' },
      ],
    },
  },
  {
    id: 'injection-assembly',
    name: 'Injection Assembly Viewer',
    description: 'Visualizes the 9-section webhook assembly pipeline with per-section timing.',
    category: 'injection',
    flow: {
      label: 'Injection Assembly',
      nodes: [
        { id: 'n1', type: 'http in', name: 'Injection Trigger' },
        { id: 'n2', type: 'function', name: 'Section Builder' },
        { id: 'n3', type: 'join', name: 'Assemble Payload' },
        { id: 'n4', type: 'http response', name: 'Respond' },
      ],
    },
  },
  {
    id: 'scheduler-monitor',
    name: 'Scheduler Job Monitor',
    description: 'Tracks all 24+ scheduler jobs with start/complete/fail events.',
    category: 'scheduler',
    flow: {
      label: 'Scheduler Monitor',
      nodes: [
        { id: 'n1', type: 'inject', name: 'Poll Jobs' },
        { id: 'n2', type: 'http request', name: 'Fetch Status' },
        { id: 'n3', type: 'function', name: 'Format' },
        { id: 'n4', type: 'ui_table', name: 'Job Dashboard' },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// NodeREDBridge
// ---------------------------------------------------------------------------

class NodeREDBridge {
  private ws: WebSocket | null = null;
  private state: BridgeState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<StateListener>();
  private messageListeners = new Set<MessageListener>();
  private debugMessages: NodeRedMessage[] = [];
  private maxDebugMessages = 200;

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.setState('connecting');

    const url = getServiceWsUrl('nodered_ws');
    if (!url) {
      this.setState('error');
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('connected');

        // Subscribe to debug messages
        this.send({ subscribe: 'debug' });
        this.send({ subscribe: 'status/#' });

        // Emit connected event to CapabilityBus
        try {
          getCapabilityBus().emit('nodered.connected', { url });
        } catch { /* bus not ready */ }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: NodeRedMessage = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch { /* invalid JSON */ }
      };

      this.ws.onclose = () => {
        this.setState('disconnected');
        try {
          getCapabilityBus().emit('nodered.disconnected', { reason: 'connection closed' });
        } catch { /* bus not ready */ }
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.setState('error');
      };
    } catch {
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    if (this.ws) {
      this.ws.onclose = null; // prevent reconnect
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  // -------------------------------------------------------------------------
  // REST API methods
  // -------------------------------------------------------------------------

  async getFlows(): Promise<NodeRedFlow[]> {
    try {
      const base = getServiceUrl('nodered');
      const res = await fetch(`${base}/flows`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Node-RED-API-Version': 'v2' },
      });
      if (!res.ok) return [];
      const data = await res.json();
      // Node-RED v2 returns { flows: [...] } or just an array
      const flows = Array.isArray(data) ? data : (data.flows ?? []);
      return flows.filter((n: any) => n.type === 'tab').map((f: any) => ({
        id: f.id,
        label: f.label ?? 'Unnamed',
        disabled: f.disabled ?? false,
        nodes: flows.filter((n: any) => n.z === f.id).map((n: any) => ({
          id: n.id,
          type: n.type,
          name: n.name ?? n.type,
        })),
      }));
    } catch {
      return [];
    }
  }

  async deployFlows(): Promise<boolean> {
    try {
      const base = getServiceUrl('nodered');
      const res = await fetch(`${base}/flows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Node-RED-Deployment-Type': 'reload',
          'Node-RED-API-Version': 'v2',
        },
        body: JSON.stringify({ flows: [] }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        try {
          getCapabilityBus().emit('nodered.flow.deployed', {
            flowId: 'all',
            nodeCount: 0,
            timestamp: Date.now(),
          });
        } catch { /* bus not ready */ }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async injectNode(nodeId: string): Promise<boolean> {
    try {
      const base = getServiceUrl('nodered');
      const res = await fetch(`${base}/inject/${nodeId}`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        try {
          getCapabilityBus().emit('nodered.inject', { nodeId, source: 'nodered-bridge' });
        } catch { /* bus not ready */ }
      }
      return res.ok;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  getTemplates(): FlowTemplate[] {
    return FLOW_TEMPLATES;
  }

  getTemplate(id: string): FlowTemplate | undefined {
    return FLOW_TEMPLATES.find((t) => t.id === id);
  }

  // -------------------------------------------------------------------------
  // Debug message buffer
  // -------------------------------------------------------------------------

  getDebugMessages(): NodeRedMessage[] {
    return this.debugMessages;
  }

  clearDebugMessages(): void {
    this.debugMessages = [];
  }

  // -------------------------------------------------------------------------
  // State + subscriptions
  // -------------------------------------------------------------------------

  getState(): BridgeState {
    return this.state;
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => { this.messageListeners.delete(listener); };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private setState(state: BridgeState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) {
      try { listener(state); } catch { /* silent */ }
    }
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(msg: NodeRedMessage): void {
    // Buffer debug messages
    if (msg.topic?.startsWith('debug')) {
      this.debugMessages.push(msg);
      if (this.debugMessages.length > this.maxDebugMessages) {
        this.debugMessages = this.debugMessages.slice(-this.maxDebugMessages);
      }

      // Emit to CapabilityBus
      try {
        getCapabilityBus().emit('nodered.debug', {
          nodeId: (msg.data as any)?.id ?? 'unknown',
          message: typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data),
          timestamp: Date.now(),
        });
      } catch { /* bus not ready */ }
    }

    // Notify message listeners
    for (const listener of this.messageListeners) {
      try { listener(msg); } catch { /* silent */ }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _bridge: NodeREDBridge | null = null;

export function getNodeREDBridge(): NodeREDBridge {
  if (!_bridge) {
    _bridge = new NodeREDBridge();
  }
  return _bridge;
}
