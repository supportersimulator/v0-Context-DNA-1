'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { ActivityBadge } from '@/components/ide/activity-bar';

// ---------------------------------------------------------------------------
// useRealtimeBadges — WebSocket-powered Activity Bar badge counts
//
// Connects to Context DNA backend for live:
//   - Diagnostics (errors/warnings → health badge)
//   - 8th Intelligence status (active dot → synaptic badge)
//   - Evidence pipeline (pending claims → evidence badge)
//   - Swarm activity (running agents → swarm badge)
//   - Git changes (modified files → git badge)
//   - Collaboration (active users → collab badge)
// Falls back to HTTP polling if WebSocket unavailable.
// ---------------------------------------------------------------------------

const CONTEXTDNA_WS_URL = 'ws://127.0.0.1:8029/ws/badges';
const CONTEXTDNA_HTTP_URL = 'http://127.0.0.1:8029/api/badges';
const POLL_INTERVAL = 15_000;
const WS_RECONNECT_DELAY = 5_000;

interface BadgeData {
  health?: { errors: number; warnings: number };
  synaptic?: { active: boolean; thinking: boolean };
  evidence?: { pendingClaims: number; recentPromotions: number };
  swarm?: { runningAgents: number };
  git?: { modifiedFiles: number; untracked: number };
  collaboration?: { activeUsers: number };
  debug?: { breakpointsHit: number };
  notifications?: { unread: number };
}

export function useRealtimeBadges(): Record<string, ActivityBadge> {
  const [data, setData] = useState<BadgeData>({});
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // WebSocket connection
  const connectWs = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const ws = new WebSocket(CONTEXTDNA_WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'badges' && msg.data) {
            setData(msg.data);
          }
        } catch {
          // Malformed message — ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Reconnect after delay
        reconnectTimerRef.current = setTimeout(connectWs, WS_RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket not available — will fall back to polling
    }
  }, []);

  // HTTP polling fallback
  const pollBadges = useCallback(async () => {
    try {
      const res = await fetch(CONTEXTDNA_HTTP_URL, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Offline or unavailable — keep last known state
    }
  }, []);

  useEffect(() => {
    // Try WebSocket first
    connectWs();

    // Also poll as fallback (will update even if WS fails)
    pollBadges();
    const pollTimer = setInterval(pollBadges, POLL_INTERVAL);

    return () => {
      clearInterval(pollTimer);
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connectWs, pollBadges]);

  // Transform raw data into ActivityBadge records
  const badges = useMemo<Record<string, ActivityBadge>>(() => {
    const result: Record<string, ActivityBadge> = {};

    // Health: show error count or warning count
    if (data.health) {
      if (data.health.errors > 0) {
        result['health'] = { count: data.health.errors, variant: 'error' };
      } else if (data.health.warnings > 0) {
        result['health'] = { count: data.health.warnings, variant: 'warning' };
      }
    }

    // Problems: mirror health into problems icon too
    if (data.health) {
      const total = data.health.errors + data.health.warnings;
      if (total > 0) {
        result['problems'] = {
          count: total,
          variant: data.health.errors > 0 ? 'error' : 'warning',
        };
      }
    }

    // Synaptic: green dot when active
    if (data.synaptic?.active) {
      result['synaptic'] = { count: 0, dot: true, variant: 'success' };
    }

    // Evidence: pending claims
    if (data.evidence && data.evidence.pendingClaims > 0) {
      result['evidence'] = { count: data.evidence.pendingClaims, variant: 'info' };
    }

    // Swarm: running agents
    if (data.swarm && data.swarm.runningAgents > 0) {
      result['swarm'] = { count: data.swarm.runningAgents, variant: 'info' };
    }

    // Git: modified + untracked files
    if (data.git) {
      const total = data.git.modifiedFiles + data.git.untracked;
      if (total > 0) {
        result['git'] = { count: total, variant: 'info' };
      }
    }

    // Collaboration: active users (show when > 1, since you're always 1)
    if (data.collaboration && data.collaboration.activeUsers > 1) {
      result['collaboration'] = { count: data.collaboration.activeUsers, variant: 'info' };
    }

    // Debug: breakpoints hit
    if (data.debug && data.debug.breakpointsHit > 0) {
      result['debug'] = { count: data.debug.breakpointsHit, variant: 'warning' };
    }

    // Notifications: unread count
    if (data.notifications && data.notifications.unread > 0) {
      result['notifications'] = { count: data.notifications.unread, variant: 'info' };
    }

    return result;
  }, [data]);

  return badges;
}
