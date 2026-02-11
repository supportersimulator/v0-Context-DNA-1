'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  GitBranch,
  Brain,
  Database,
  Activity,
  Bell,
  Wifi,
  WifiOff,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_POLL_INTERVAL = 30_000; // 30 seconds
const API_BASE =
  process.env.NEXT_PUBLIC_MEMORY_API || 'http://127.0.0.1:3456';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusBarItemProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  tooltip?: string;
  badge?: number;
  variant?: 'default' | 'success' | 'error';
}

interface StatusBarData {
  connected: boolean;
  modelName: string;
  learningCount: number;
  swarmStatus: { active: boolean; agentCount: number };
  notifications: number;
  diagnostics: { errors: number; warnings: number };
}

// ---------------------------------------------------------------------------
// useStatusBarData — polls backend health every 30s
// ---------------------------------------------------------------------------

function useStatusBarData(): StatusBarData {
  const [data, setData] = useState<StatusBarData>({
    connected: false,
    modelName: 'Qwen3-14B',
    learningCount: 313,
    swarmStatus: { active: false, agentCount: 0 },
    notifications: 0,
    diagnostics: { errors: 0, warnings: 0 },
  });

  const pollHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const healthData = await res.json();
        setData((prev) => ({
          ...prev,
          connected: true,
          modelName: healthData.model_name || healthData.modelName || prev.modelName,
          learningCount:
            healthData.learning_count ??
            healthData.learningCount ??
            healthData.total ??
            prev.learningCount,
        }));
      } else {
        setData((prev) => ({ ...prev, connected: false }));
      }
    } catch {
      setData((prev) => ({ ...prev, connected: false }));
    }
  }, []);

  // Also try to fetch stats for learning count (separate endpoint)
  const pollStats = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/stats`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const stats = await res.json();
        if (typeof stats.total === 'number') {
          setData((prev) => ({ ...prev, learningCount: stats.total }));
        }
      }
    } catch {
      // Stats fetch failed — keep existing count
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    pollHealth();
    pollStats();

    // Set up polling intervals
    const healthTimer = setInterval(pollHealth, HEALTH_POLL_INTERVAL);
    const statsTimer = setInterval(pollStats, HEALTH_POLL_INTERVAL);

    return () => {
      clearInterval(healthTimer);
      clearInterval(statsTimer);
    };
  }, [pollHealth, pollStats]);

  return data;
}

// ---------------------------------------------------------------------------
// StatusBarItem — single item in the status bar
// ---------------------------------------------------------------------------

function StatusBarItem({
  icon,
  label,
  onClick,
  tooltip,
  badge,
  variant = 'default',
}: StatusBarItemProps) {
  const colorClass =
    variant === 'success'
      ? 'text-[#22c55e]'
      : variant === 'error'
        ? 'text-red-400'
        : 'text-[#6b6b75]';

  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`
        flex items-center gap-1.5 px-2 h-full
        text-xs select-none transition-colors duration-100
        hover:text-[#e5e5e5] hover:bg-[#1a1a24]
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${colorClass}
      `}
    >
      <span className="flex items-center flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      {typeof badge === 'number' && badge > 0 && (
        <span className="flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#22c55e] text-[#0a0a0f] text-[10px] font-bold leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Separator dot between items
// ---------------------------------------------------------------------------

function Separator() {
  return (
    <span className="text-[#2a2a35] text-[8px] select-none flex items-center px-0.5">
      &bull;
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusBar — full-width bar fixed at bottom
// ---------------------------------------------------------------------------

export function StatusBar() {
  const { connected, modelName, learningCount, swarmStatus, notifications, diagnostics } =
    useStatusBarData();

  const handleBranchClick = useCallback(() => {
    // Future: open git panel
  }, []);

  const handleModelClick = useCallback(() => {
    // Future: open models panel
  }, []);

  const handleNotificationsClick = useCallback(() => {
    // Future: open notifications panel
  }, []);

  const swarmLabel = swarmStatus.active
    ? `Running (${swarmStatus.agentCount} agent${swarmStatus.agentCount !== 1 ? 's' : ''})`
    : 'Idle';

  return (
    <div className="ide-status-bar hidden sm:flex items-center justify-between w-full h-[22px] bg-[#0a0a0f] border-t border-[#2a2a35] flex-shrink-0 select-none z-50">
      {/* ===== Left section ===== */}
      <div className="flex items-center h-full overflow-hidden">
        {/* Branch indicator */}
        <StatusBarItem
          icon={<GitBranch className="w-3 h-3" />}
          label="main"
          onClick={handleBranchClick}
          tooltip="Current branch (click to show git panel)"
        />

        <Separator />

        {/* Connection status */}
        <StatusBarItem
          icon={
            connected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )
          }
          label={connected ? 'Connected' : 'Disconnected'}
          tooltip={
            connected
              ? `Connected to ${API_BASE}`
              : 'Backend unreachable — retrying every 30s'
          }
          variant={connected ? 'success' : 'error'}
        />

        <Separator />

        {/* Active model */}
        <StatusBarItem
          icon={<Brain className="w-3 h-3" />}
          label={modelName}
          onClick={handleModelClick}
          tooltip={`Active LLM model: ${modelName}`}
          variant={connected ? 'success' : 'default'}
        />

        {/* Diagnostic indicators (errors + warnings) */}
        {(diagnostics.errors > 0 || diagnostics.warnings > 0) && (
          <>
            <Separator />
            {diagnostics.errors > 0 && (
              <StatusBarItem
                icon={<XCircle className="w-3 h-3" />}
                label={String(diagnostics.errors)}
                tooltip={`${diagnostics.errors} error${diagnostics.errors !== 1 ? 's' : ''}`}
                variant="error"
              />
            )}
            {diagnostics.warnings > 0 && (
              <StatusBarItem
                icon={<AlertTriangle className="w-3 h-3" />}
                label={String(diagnostics.warnings)}
                tooltip={`${diagnostics.warnings} warning${diagnostics.warnings !== 1 ? 's' : ''}`}
              />
            )}
          </>
        )}
      </div>

      {/* ===== Right section ===== */}
      <div className="flex items-center h-full overflow-hidden">
        {/* Learning count */}
        <StatusBarItem
          icon={<Database className="w-3 h-3" />}
          label={`${learningCount.toLocaleString()} learnings`}
          tooltip={`${learningCount.toLocaleString()} learnings in memory store`}
        />

        <Separator />

        {/* Swarm status */}
        <StatusBarItem
          icon={<Activity className="w-3 h-3" />}
          label={swarmLabel}
          tooltip={
            swarmStatus.active
              ? `Swarm active: ${swarmStatus.agentCount} agent${swarmStatus.agentCount !== 1 ? 's' : ''} running`
              : 'Agent swarm idle'
          }
          variant={swarmStatus.active ? 'success' : 'default'}
        />

        <Separator />

        {/* Notifications */}
        <StatusBarItem
          icon={<Bell className="w-3 h-3" />}
          label={notifications > 0 ? `${notifications}` : ''}
          onClick={handleNotificationsClick}
          tooltip={
            notifications > 0
              ? `${notifications} unread notification${notifications !== 1 ? 's' : ''}`
              : 'No notifications'
          }
          badge={notifications > 0 ? notifications : undefined}
        />

        <Separator />

        {/* Line/Col indicator */}
        <StatusBarItem
          icon={<></>}
          label="Ln 1, Col 1"
          tooltip="Line and column (editor integration pending)"
        />
      </div>
    </div>
  );
}
