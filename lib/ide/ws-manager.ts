'use client';

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { getServiceUrl } from './service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WSMessage<T = unknown> {
  channel: string;
  type: string;
  data: T;
  timestamp: number;
}

export interface WSConfig {
  url: string;
  reconnectMaxDelay: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  maxBufferSize: number;
  debug: boolean;
}

export interface WSStatus {
  connected: boolean;
  reconnecting: boolean;
  latency: number;
  lastConnected: number | null;
}

type SubscriptionCallback<T = unknown> = (msg: WSMessage<T>) => void;
type StatusListener = (status: WSStatus) => void;
type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// EventBus integration (graceful degradation)
// ---------------------------------------------------------------------------

// Lazy-loaded EventBus reference. We attempt a dynamic import once
// and cache the result. If the module doesn't exist or fails to load,
// we silently skip all event emissions.
let eventBusPromise: Promise<{ getEventBus: () => { emit: (event: string, data?: unknown) => void } }> | null = null;
let cachedEventBus: { emit: (event: string, data?: unknown) => void } | null = null;
let eventBusLoadAttempted = false;

function tryEmitEvent(event: string, data?: unknown): void {
  if (cachedEventBus) {
    try {
      cachedEventBus.emit(event, data);
    } catch {
      // Silently ignore emission errors
    }
    return;
  }

  if (eventBusLoadAttempted) return;

  eventBusLoadAttempted = true;
  eventBusPromise = import('@/lib/ide/event-bus').catch(() => null) as typeof eventBusPromise;
  eventBusPromise?.then((mod) => {
    if (mod?.getEventBus) {
      try {
        cachedEventBus = mod.getEventBus();
        cachedEventBus?.emit(event, data);
      } catch {
        // EventBus not functional
      }
    }
  }).catch(() => {
    // Module not available
  });
}

// ---------------------------------------------------------------------------
// Connection URL derivation
// ---------------------------------------------------------------------------

function getDefaultWSUrl(): string {
  if (typeof window === 'undefined') return '';

  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  if (isLocal) {
    const memoryBase = getServiceUrl('memory_api');
    return memoryBase.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
  }
  return `${wsProtocol}//${window.location.host}/api/ws`;
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: WSConfig = {
  url: '',
  reconnectMaxDelay: 30_000,
  heartbeatInterval: 30_000,
  heartbeatTimeout: 5_000,
  maxBufferSize: 100,
  debug: typeof process !== 'undefined' && process.env?.NODE_ENV === 'development',
};

// ---------------------------------------------------------------------------
// WSManager — Singleton WebSocket connection manager
// ---------------------------------------------------------------------------

export class WSManager {
  // Singleton
  private static instance: WSManager | null = null;

  // Configuration
  private config: WSConfig;

  // Connection state
  private ws: WebSocket | null = null;
  private status: WSStatus = {
    connected: false,
    reconnecting: false,
    latency: -1,
    lastConnected: null,
  };

  // Reconnect state
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;
  private isDestroyed = false;

  // Heartbeat state
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPingSentAt = 0;

  // Message buffer (messages queued during reconnect)
  private messageBuffer: string[] = [];

  // Subscriptions: key is channel pattern, value is set of callbacks
  // Supports exact channel ("learnings") or channel:type ("health:status")
  private subscriptions = new Map<string, Set<SubscriptionCallback>>();

  // Status listeners (for the React hook)
  private statusListeners = new Set<StatusListener>();

  // Snapshot version for useSyncExternalStore
  private statusVersion = 0;

  // ---------------------------------------------------------------------------
  // Constructor & Singleton
  // ---------------------------------------------------------------------------

  private constructor(config?: Partial<WSConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Resolve URL: provided > default derivation
    if (!this.config.url) {
      this.config.url = getDefaultWSUrl();
    }

    this.log('WSManager created', { url: this.config.url });
  }

  /**
   * Get the singleton WSManager instance.
   * Lazy-initializes on first access. SSR-safe: returns a no-op stub
   * if called during server-side rendering (no window).
   */
  static getInstance(config?: Partial<WSConfig>): WSManager {
    if (!WSManager.instance) {
      WSManager.instance = new WSManager(config);
    }
    return WSManager.instance;
  }

  /**
   * Reset the singleton (for testing or full teardown).
   * Closes the existing connection and clears all state.
   */
  static resetInstance(): void {
    if (WSManager.instance) {
      WSManager.instance.destroy();
      WSManager.instance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Open the WebSocket connection.
   * No-op if already connected/connecting, or if running in SSR.
   */
  connect(): void {
    // SSR guard
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      this.log('SSR environment detected, skipping connect');
      return;
    }

    if (this.isDestroyed) {
      this.log('Manager destroyed, skipping connect');
      return;
    }

    // Already connected or connecting
    if (this.ws) {
      const state = this.ws.readyState;
      if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) {
        return;
      }
    }

    if (!this.config.url) {
      this.log('No WebSocket URL configured, skipping connect');
      return;
    }

    this.isManualClose = false;
    this.doConnect();
  }

  /**
   * Gracefully close the connection. Stops reconnect attempts.
   */
  disconnect(): void {
    this.isManualClose = true;
    this.clearTimers();
    this.closeSocket();
    this.updateStatus({ connected: false, reconnecting: false });
  }

  /**
   * Full teardown. Clears subscriptions, buffers, and the singleton reference.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    this.subscriptions.clear();
    this.statusListeners.clear();
    this.messageBuffer = [];
    this.log('WSManager destroyed');
  }

  // ---------------------------------------------------------------------------
  // Subscription API
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to messages on a channel or channel:type pattern.
   *
   * Examples:
   *   subscribe('learnings', cb)       — all messages on 'learnings' channel
   *   subscribe('health:status', cb)   — only 'status' type on 'health' channel
   *   subscribe('*', cb)               — all messages on all channels
   *
   * Returns an unsubscribe function.
   */
  subscribe<T = unknown>(pattern: string, callback: SubscriptionCallback<T>): Unsubscribe {
    const cb = callback as SubscriptionCallback;
    let set = this.subscriptions.get(pattern);
    if (!set) {
      set = new Set();
      this.subscriptions.set(pattern, set);
    }
    set.add(cb);

    this.log('Subscription added', { pattern, total: set.size });

    // Ensure connection is open when first subscriber arrives
    if (this.totalSubscriptions() === 1) {
      this.connect();
    }

    return () => {
      set!.delete(cb);
      if (set!.size === 0) {
        this.subscriptions.delete(pattern);
      }
      this.log('Subscription removed', { pattern, remaining: set!.size });
    };
  }

  /**
   * Send a message through the WebSocket. If the socket is not open,
   * the message is buffered and flushed upon reconnect.
   */
  send(channel: string, type: string, data: unknown): void {
    const msg: WSMessage = {
      channel,
      type,
      data,
      timestamp: Date.now(),
    };
    const serialized = JSON.stringify(msg);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
      this.log('Sent', { channel, type });
    } else {
      // Buffer for later delivery
      if (this.messageBuffer.length < this.config.maxBufferSize) {
        this.messageBuffer.push(serialized);
        this.log('Buffered (offline)', { channel, type, bufferSize: this.messageBuffer.length });
      } else {
        this.log('Buffer full, dropping message', { channel, type });
      }
    }
  }

  /**
   * Subscribe to connection status changes. Returns an unsubscribe function.
   */
  onStatusChange(listener: StatusListener): Unsubscribe {
    this.statusListeners.add(listener);
    // Immediately notify with current status
    listener({ ...this.status });
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Get a snapshot of the current status (for useSyncExternalStore).
   */
  getStatus(): WSStatus {
    return this.status;
  }

  /**
   * Get the current status snapshot version (for useSyncExternalStore).
   */
  getStatusVersion(): number {
    return this.statusVersion;
  }

  // ---------------------------------------------------------------------------
  // Internal: Connection mechanics
  // ---------------------------------------------------------------------------

  private doConnect(): void {
    this.log('Connecting...', { url: this.config.url, attempt: this.reconnectAttempts });

    this.updateStatus({ reconnecting: this.reconnectAttempts > 0 });

    try {
      this.ws = new WebSocket(this.config.url);
    } catch (err) {
      this.log('WebSocket constructor threw', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = this.handleOpen;
    this.ws.onmessage = this.handleMessage;
    this.ws.onclose = this.handleClose;
    this.ws.onerror = this.handleError;
  }

  private handleOpen = (): void => {
    this.log('Connected');
    this.reconnectAttempts = 0;

    this.updateStatus({
      connected: true,
      reconnecting: false,
      lastConnected: Date.now(),
    });

    tryEmitEvent('connection:status-changed', { connected: true });

    // Start heartbeat
    this.startHeartbeat();

    // Flush buffered messages
    this.flushBuffer();
  };

  private handleMessage = (event: MessageEvent): void => {
    let msg: WSMessage;

    try {
      const parsed = JSON.parse(event.data);

      // Handle heartbeat pong
      if (parsed.type === 'pong' || parsed.type === 'heartbeat_ack') {
        this.handlePong();
        return;
      }

      // Normalize incoming messages to our WSMessage format.
      // The server may send messages in legacy format (no `channel` field)
      // or in the new unified format. We handle both.
      if (parsed.channel) {
        // Already in WSMessage format
        msg = parsed as WSMessage;
      } else if (parsed.event) {
        // Legacy format: { event: 'learning_captured', data: {...} }
        // Map legacy event names to channel:type
        const { channel, type } = mapLegacyEvent(parsed.event);
        msg = {
          channel,
          type,
          data: parsed.data ?? parsed,
          timestamp: parsed.timestamp ?? Date.now(),
        };
      } else {
        // Unknown format — wrap in a generic message
        msg = {
          channel: parsed.type || 'unknown',
          type: parsed.type || 'message',
          data: parsed.data ?? parsed,
          timestamp: parsed.timestamp ?? Date.now(),
        };
      }
    } catch {
      this.log('Failed to parse message', event.data);
      return;
    }

    this.dispatch(msg);
  };

  private handleClose = (event: CloseEvent): void => {
    this.log('Connection closed', { code: event.code, reason: event.reason, wasClean: event.wasClean });

    this.stopHeartbeat();

    this.updateStatus({ connected: false });
    tryEmitEvent('connection:status-changed', { connected: false });

    if (!this.isManualClose && !this.isDestroyed) {
      this.scheduleReconnect();
    }
  };

  private handleError = (_event: Event): void => {
    this.log('WebSocket error');
    // onclose will fire after onerror, so reconnect logic is handled there.
  };

  // ---------------------------------------------------------------------------
  // Internal: Reconnect with exponential backoff
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.isManualClose || this.isDestroyed) return;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.config.reconnectMaxDelay,
    );
    this.reconnectAttempts++;

    this.updateStatus({ reconnecting: true });
    this.log('Scheduling reconnect', { attempt: this.reconnectAttempts, delayMs: delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Internal: Heartbeat (ping/pong)
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      this.lastPingSentAt = Date.now();
      try {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: this.lastPingSentAt }));
      } catch {
        // Socket may have closed between check and send
        return;
      }

      // Timeout: if no pong within heartbeatTimeout, consider dead
      this.heartbeatTimeoutTimer = setTimeout(() => {
        this.log('Heartbeat timeout — closing connection');
        this.closeSocket();
        // handleClose will trigger reconnect
      }, this.config.heartbeatTimeout);
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private handlePong(): void {
    // Clear the timeout since we received a response
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }

    const latency = this.lastPingSentAt > 0 ? Date.now() - this.lastPingSentAt : -1;
    this.updateStatus({ latency });
    tryEmitEvent('connection:latency', { latency });
  }

  // ---------------------------------------------------------------------------
  // Internal: Message dispatch (channel routing)
  // ---------------------------------------------------------------------------

  private dispatch(msg: WSMessage): void {
    // Match patterns:
    // 1. Exact channel match: 'learnings' matches subscriber on 'learnings'
    // 2. Channel:type match:  'health:status' matches subscriber on 'health:status'
    // 3. Wildcard:            '*' matches everything

    const channelKey = msg.channel;
    const channelTypeKey = `${msg.channel}:${msg.type}`;

    // Collect all matching callbacks to avoid issues if callbacks modify subscriptions
    const callbacks: SubscriptionCallback[] = [];

    // Exact channel subscribers
    const channelSubs = this.subscriptions.get(channelKey);
    if (channelSubs) {
      for (const cb of channelSubs) callbacks.push(cb);
    }

    // Channel:type subscribers
    const typeSubs = this.subscriptions.get(channelTypeKey);
    if (typeSubs) {
      for (const cb of typeSubs) callbacks.push(cb);
    }

    // Wildcard subscribers
    const wildcardSubs = this.subscriptions.get('*');
    if (wildcardSubs) {
      for (const cb of wildcardSubs) callbacks.push(cb);
    }

    for (const cb of callbacks) {
      try {
        cb(msg);
      } catch (err) {
        this.log('Subscription callback threw', err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Buffer management
  // ---------------------------------------------------------------------------

  private flushBuffer(): void {
    if (this.messageBuffer.length === 0) return;

    this.log('Flushing buffer', { count: this.messageBuffer.length });

    const toSend = [...this.messageBuffer];
    this.messageBuffer = [];

    for (const serialized of toSend) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(serialized);
        } catch {
          // Re-buffer if send fails
          this.messageBuffer.push(serialized);
        }
      } else {
        // Connection lost during flush, re-buffer remaining
        this.messageBuffer.push(serialized);
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Status management
  // ---------------------------------------------------------------------------

  private updateStatus(partial: Partial<WSStatus>): void {
    const prev = this.status;
    this.status = { ...prev, ...partial };

    // Only notify if something actually changed
    const changed =
      prev.connected !== this.status.connected ||
      prev.reconnecting !== this.status.reconnecting ||
      prev.latency !== this.status.latency ||
      prev.lastConnected !== this.status.lastConnected;

    if (changed) {
      this.statusVersion++;
      const snapshot = { ...this.status };
      for (const listener of this.statusListeners) {
        try {
          listener(snapshot);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Helpers
  // ---------------------------------------------------------------------------

  private closeSocket(): void {
    if (this.ws) {
      // Remove handlers before closing to prevent recursive close handling
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;

      try {
        this.ws.close(1000, 'Client disconnect');
      } catch {
        // May already be closed
      }
      this.ws = null;
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private totalSubscriptions(): number {
    let total = 0;
    for (const set of this.subscriptions.values()) {
      total += set.size;
    }
    return total;
  }

  private log(message: string, data?: unknown): void {
    if (this.config.debug) {
      if (data !== undefined) {
        console.log(`[WSManager] ${message}`, data);
      } else {
        console.log(`[WSManager] ${message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy event name mapping
// ---------------------------------------------------------------------------

function mapLegacyEvent(event: string): { channel: string; type: string } {
  // Map known legacy event names to channel:type pairs
  const mapping: Record<string, { channel: string; type: string }> = {
    learning_captured: { channel: 'learnings', type: 'new' },
    learning_updated: { channel: 'learnings', type: 'update' },
    injection_complete: { channel: 'injection', type: 'complete' },
    injection_started: { channel: 'injection', type: 'started' },
    health_update: { channel: 'health', type: 'status' },
    health_changed: { channel: 'health', type: 'status' },
    agent_connected: { channel: 'agent', type: 'connected' },
    agent_disconnected: { channel: 'agent', type: 'disconnected' },
    notification: { channel: 'notifications', type: 'new' },
    broadcast: { channel: 'broadcast', type: 'message' },
    architecture_update: { channel: 'architecture', type: 'update' },
    architecture_changed: { channel: 'architecture', type: 'changed' },
  };

  if (mapping[event]) {
    return mapping[event];
  }

  // Best-effort: use the event name as channel, 'event' as type
  return { channel: event, type: 'event' };
}

// ---------------------------------------------------------------------------
// Singleton accessor (convenience for non-React usage)
// ---------------------------------------------------------------------------

/**
 * Get the singleton WSManager. SSR-safe.
 */
export function getWSManager(config?: Partial<WSConfig>): WSManager {
  return WSManager.getInstance(config);
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * Subscribe to a WebSocket channel. Returns connection status and latency.
 *
 * Usage:
 *   const { connected, latency } = useWSChannel<Learning>('learnings', (msg) => {
 *     console.log('New learning:', msg.data);
 *   });
 *
 *   const { connected } = useWSChannel<HealthStatus>('health:status', (msg) => {
 *     setHealth(msg.data);
 *   });
 */
export function useWSChannel<T = unknown>(
  channel: string,
  onMessage: (msg: WSMessage<T>) => void,
): { connected: boolean; latency: number } {
  // Stabilize callback reference to avoid re-subscribing on every render
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  const [status, setStatus] = useState<WSStatus>({
    connected: false,
    reconnecting: false,
    latency: -1,
    lastConnected: null,
  });

  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined') return;

    const manager = WSManager.getInstance();

    // Subscribe to messages
    const unsubMsg = manager.subscribe<T>(channel, (msg) => {
      callbackRef.current(msg);
    });

    // Subscribe to status changes
    const unsubStatus = manager.onStatusChange((s) => {
      setStatus(s);
    });

    // Ensure connection is open
    manager.connect();

    return () => {
      unsubMsg();
      unsubStatus();
    };
  }, [channel]);

  return {
    connected: status.connected,
    latency: status.latency,
  };
}

/**
 * Connection status hook. Returns full connection state.
 *
 * Usage:
 *   const { connected, reconnecting, latency, lastConnected } = useWSStatus();
 */
export function useWSStatus(): WSStatus {
  const [status, setStatus] = useState<WSStatus>({
    connected: false,
    reconnecting: false,
    latency: -1,
    lastConnected: null,
  });

  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined') return;

    const manager = WSManager.getInstance();

    const unsub = manager.onStatusChange((s) => {
      setStatus(s);
    });

    // Ensure connection is open
    manager.connect();

    return unsub;
  }, []);

  return status;
}

/**
 * Returns a stable send function for pushing messages through the WebSocket.
 *
 * Usage:
 *   const send = useWSSend();
 *   send('learnings', 'query', { search: 'async' });
 */
export function useWSSend(): (channel: string, type: string, data: unknown) => void {
  const sendRef = useRef<(channel: string, type: string, data: unknown) => void>(
    (channel, type, data) => {
      // SSR guard
      if (typeof window === 'undefined') return;
      const manager = WSManager.getInstance();
      manager.connect(); // Ensure connected
      manager.send(channel, type, data);
    },
  );

  return sendRef.current;
}

/**
 * useSyncExternalStore-based status hook for concurrent-safe reads.
 * Prefer this in React 18+ for tearing-free reads.
 */
export function useWSStatusSync(): WSStatus {
  const managerRef = useRef<WSManager | null>(null);

  // Lazily get manager (SSR-safe: returns default on server)
  if (typeof window !== 'undefined' && !managerRef.current) {
    managerRef.current = WSManager.getInstance();
    managerRef.current.connect();
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!managerRef.current) return () => {};
    return managerRef.current.onStatusChange(() => onStoreChange());
  }, []);

  const getSnapshot = useCallback(() => {
    if (!managerRef.current) {
      return {
        connected: false,
        reconnecting: false,
        latency: -1,
        lastConnected: null,
      };
    }
    return managerRef.current.getStatus();
  }, []);

  const getServerSnapshot = useCallback((): WSStatus => ({
    connected: false,
    reconnecting: false,
    latency: -1,
    lastConnected: null,
  }), []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
