'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ---------------------------------------------------------------------------
// usePanelVisibility — pauses expensive operations when a panel is hidden
//
// Dockview tabs can hide panels (tabbed behind). When hidden, panels should
// pause WebSocket subscriptions, polling intervals, and animations to save
// resources. This hook tracks visibility using dockview's API.
//
// Usage:
//   function MyPanel({ api }: { api: IDockviewPanelApi }) {
//     const { isVisible, shouldRender } = usePanelVisibility(api);
//
//     // Guard expensive operations
//     useEffect(() => {
//       if (!shouldRender) return;
//       const ws = new WebSocket('...');
//       return () => ws.close();
//     }, [shouldRender]);
//
//     if (!shouldRender) return <PanelSkeleton variant="compact" />;
//     return <ExpensiveContent />;
//   }
// ---------------------------------------------------------------------------

/**
 * Minimal interface for dockview panel API visibility events.
 * Avoids direct import of dockview types to keep this module lightweight.
 */
interface DockviewPanelVisibilityAPI {
  /** Whether the panel is currently visible (not tabbed behind) */
  isVisible: boolean;
  /** Subscribe to visibility changes */
  onDidVisibilityChange: (handler: (event: { isVisible: boolean }) => void) => {
    dispose: () => void;
  };
}

export interface PanelVisibilityState {
  /** Whether the dockview panel is currently visible (active tab) */
  isVisible: boolean;
  /**
   * Whether the panel should perform expensive renders/operations.
   * Same as isVisible, but with a short delay on hide to avoid flicker
   * during rapid tab switching.
   */
  shouldRender: boolean;
}

/** Delay before pausing operations after becoming hidden (ms) */
const HIDE_DELAY_MS = 300;

/**
 * Hook: tracks dockview panel visibility for resource optimization.
 *
 * When a panel is hidden (tabbed behind another):
 *   - isVisible becomes false immediately
 *   - shouldRender becomes false after 300ms delay (avoids flicker)
 *
 * When a panel becomes visible:
 *   - Both isVisible and shouldRender become true immediately
 *
 * @param api - The dockview panel API instance (from IDockviewPanelProps)
 * @returns { isVisible, shouldRender }
 */
export function usePanelVisibility(
  api: DockviewPanelVisibilityAPI | null | undefined,
): PanelVisibilityState {
  const [isVisible, setIsVisible] = useState(() => api?.isVisible ?? true);
  const [shouldRender, setShouldRender] = useState(() => api?.isVisible ?? true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync initial state when API becomes available
  useEffect(() => {
    if (!api) return;

    const visible = api.isVisible;
    setIsVisible(visible);
    setShouldRender(visible);

    const disposable = api.onDidVisibilityChange((event) => {
      setIsVisible(event.isVisible);

      if (event.isVisible) {
        // Show immediately — no delay
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setShouldRender(true);
      } else {
        // Hide with delay — avoids flicker during rapid tab switching
        hideTimerRef.current = setTimeout(() => {
          hideTimerRef.current = null;
          setShouldRender(false);
        }, HIDE_DELAY_MS);
      }
    });

    return () => {
      disposable.dispose();
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [api]);

  return { isVisible, shouldRender };
}

// ---------------------------------------------------------------------------
// useVisibilityAwareInterval — polling that pauses when panel is hidden
// ---------------------------------------------------------------------------

/**
 * Like setInterval, but automatically pauses when the panel is hidden
 * and resumes when visible.
 *
 * Usage:
 *   useVisibilityAwareInterval(
 *     api,
 *     () => fetchLatestData(),
 *     10_000, // poll every 10s
 *   );
 */
export function useVisibilityAwareInterval(
  api: DockviewPanelVisibilityAPI | null | undefined,
  callback: () => void,
  intervalMs: number,
): void {
  const { isVisible } = usePanelVisibility(api);
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isVisible) return;

    // Fire immediately on becoming visible
    callbackRef.current();

    const id = setInterval(() => {
      callbackRef.current();
    }, intervalMs);

    return () => clearInterval(id);
  }, [isVisible, intervalMs]);
}

// ---------------------------------------------------------------------------
// useVisibilityAwareWebSocket — WS that disconnects when panel is hidden
// ---------------------------------------------------------------------------

/**
 * Returns a stable connect/disconnect pair that respects panel visibility.
 * The WebSocket is automatically disconnected when the panel becomes hidden
 * and reconnected when visible.
 *
 * Usage:
 *   const { isConnected } = useVisibilityAwareWebSocket(api, {
 *     url: 'ws://localhost:3456/ws',
 *     onMessage: (data) => handleMessage(data),
 *   });
 */
export function useVisibilityAwareWebSocket(
  api: DockviewPanelVisibilityAPI | null | undefined,
  config: {
    url: string;
    onMessage?: (data: MessageEvent) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
  },
): { isConnected: boolean } {
  const { shouldRender } = usePanelVisibility(api);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (!shouldRender) {
      // Disconnect when hidden
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Connect when visible
    try {
      const ws = new WebSocket(configRef.current.url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        configRef.current.onOpen?.();
      };

      ws.onmessage = (event) => {
        configRef.current.onMessage?.(event);
      };

      ws.onerror = (event) => {
        configRef.current.onError?.(event);
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        configRef.current.onClose?.();
      };
    } catch {
      setIsConnected(false);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setIsConnected(false);
      }
    };
  }, [shouldRender]);

  return { isConnected };
}
