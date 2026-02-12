'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getServiceWsUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// useRealtimePanels — EventBus for real-time panel data from Context DNA
//
// Provides a centralized event subscription system. Panels subscribe to
// specific channels and receive live data updates via WebSocket.
//
// Usage:
//   const { subscribe, lastEvent } = useRealtimePanels();
//   useEffect(() => subscribe('injection', (data) => setPayload(data)), []);
// ---------------------------------------------------------------------------

const CONTEXTDNA_WS_URL = getServiceWsUrl('events_ws');
const WS_RECONNECT_DELAY = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export type EventChannel =
  | 'injection'         // Real-time injection payloads (9-section)
  | 'diagnostics'       // TypeScript/lint errors and warnings
  | 'health'            // Service health status changes
  | 'evidence'          // Evidence pipeline state changes
  | 'swarm'             // Swarm agent status updates
  | 'learning'          // New learnings captured
  | 'synaptic'          // 8th Intelligence messages
  | 'git'               // Git status changes
  | 'session'           // Session historian events
  | 'debug'             // Debug state changes
  | 'collaboration';    // Collaboration state changes

interface EventMessage {
  channel: EventChannel;
  data: unknown;
  timestamp: number;
}

type EventCallback = (data: unknown) => void;

interface RealtimePanelsState {
  connected: boolean;
  reconnecting: boolean;
  lastEvent: EventMessage | null;
}

export function useRealtimePanels() {
  const [state, setState] = useState<RealtimePanelsState>({
    connected: false,
    reconnecting: false,
    lastEvent: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Map<EventChannel, Set<EventCallback>>>(new Map());
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Subscribe to a channel — returns unsubscribe function
  const subscribe = useCallback((channel: EventChannel, callback: EventCallback): (() => void) => {
    if (!subscribersRef.current.has(channel)) {
      subscribersRef.current.set(channel, new Set());
    }
    subscribersRef.current.get(channel)!.add(callback);

    return () => {
      const subs = subscribersRef.current.get(channel);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) subscribersRef.current.delete(channel);
      }
    };
  }, []);

  // Dispatch event to subscribers
  const dispatch = useCallback((msg: EventMessage) => {
    setState((prev) => ({ ...prev, lastEvent: msg }));
    const subs = subscribersRef.current.get(msg.channel);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(msg.data);
        } catch {
          // Subscriber error — don't break other subscribers
        }
      }
    }
  }, []);

  // WebSocket connection management
  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (reconnectCountRef.current >= MAX_RECONNECT_ATTEMPTS) return;

    try {
      const ws = new WebSocket(CONTEXTDNA_WS_URL);
      wsRef.current = ws;
      setState((prev) => ({ ...prev, reconnecting: true }));

      ws.onopen = () => {
        reconnectCountRef.current = 0;
        setState((prev) => ({ ...prev, connected: true, reconnecting: false }));

        // Subscribe to all channels we have listeners for
        const channels = Array.from(subscribersRef.current.keys());
        if (channels.length > 0) {
          ws.send(JSON.stringify({ type: 'subscribe', channels }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg: EventMessage = JSON.parse(event.data);
          if (msg.channel && msg.data !== undefined) {
            dispatch(msg);
          }
        } catch {
          // Malformed message — ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setState((prev) => ({ ...prev, connected: false }));
        reconnectCountRef.current++;
        reconnectTimerRef.current = setTimeout(connect, WS_RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket constructor failed
      setState((prev) => ({ ...prev, connected: false, reconnecting: false }));
    }
  }, [dispatch]);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    /** Subscribe to a channel. Returns unsubscribe function. */
    subscribe,
    /** Whether the WebSocket is connected */
    connected: state.connected,
    /** Whether a reconnection attempt is in progress */
    reconnecting: state.reconnecting,
    /** The most recent event received */
    lastEvent: state.lastEvent,
  };
}
