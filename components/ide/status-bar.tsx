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
  HeartPulse,
} from 'lucide-react';
import { useMode } from '@/lib/hooks/use-mode';
import { useDiagnostics } from '@/lib/hooks/use-diagnostics';
import { useSwarmStatus } from '@/lib/hooks/use-swarm';
import { useErSimStatus } from '@/lib/hooks/use-er-sim-status';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 30_000; // 30 seconds
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

// ---------------------------------------------------------------------------
// useStatusBarPolling — lightweight poll for learningCount + modelName only
// ---------------------------------------------------------------------------

function useStatusBarPolling() {
  const [learningCount, setLearningCount] = useState(313);
  const [modelName, setModelName] = useState('Qwen3-14B');

  const pollHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const d = await res.json();
        const name = d.model_name || d.modelName;
        if (name) setModelName(name);
        const count = d.learning_count ?? d.learningCount ?? d.total;
        if (typeof count === 'number') setLearningCount(count);
      }
    } catch {
      // Health fetch failed — keep existing values
    }
  }, []);

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
        if (typeof stats.total === 'number') setLearningCount(stats.total);
      }
    } catch {
      // Stats fetch failed — keep existing count
    }
  }, []);

  useEffect(() => {
    pollHealth();
    pollStats();

    const healthTimer = setInterval(pollHealth, POLL_INTERVAL);
    const statsTimer = setInterval(pollStats, POLL_INTERVAL);

    return () => {
      clearInterval(healthTimer);
      clearInterval(statsTimer);
    };
  }, [pollHealth, pollStats]);

  return { learningCount, modelName };
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
  // Phase 9 hooks
  const { mode, isHeavy, services } = useMode();
  const diagnostics = useDiagnostics();
  const { run: swarmRun, status: swarmStatus } = useSwarmStatus(null);
  // Cross-product: ER Simulator health probe (Expo dev server on 8081)
  const { data: erSim, loading: erSimLoading } = useErSimStatus(5000);

  // Lightweight polling for learning count + model name
  const { learningCount, modelName } = useStatusBarPolling();

  // Derive connection status from services (API reachable = connected)
  const connected = services.context_dna_api;

  const handleBranchClick = useCallback(() => {
    // Future: open git panel
  }, []);

  const handleModelClick = useCallback(() => {
    // Future: open models panel
  }, []);

  const handleNotificationsClick = useCallback(() => {
    // Future: open notifications panel
  }, []);

  // Swarm label from real hook data
  const swarmActive = swarmStatus === 'running' || swarmStatus === 'collecting' || swarmStatus === 'harmonizing' || swarmStatus === 'integrating';
  const swarmAgentCount = swarmRun ? Object.keys(swarmRun.agent_results ?? {}).length : 0;
  const swarmLabel = swarmActive
    ? `Running (${swarmAgentCount} agent${swarmAgentCount !== 1 ? 's' : ''})`
    : 'Idle';

  // ER Sim label/variant — drives the cross-product status pill.
  // Three states: loading (initial), running (reachable), stopped (no probe response).
  const erSimReachable = !!erSim?.reachable;
  const erSimLabel = erSimLoading && !erSim
    ? 'ER Sim ...'
    : erSimReachable
      ? `ER Sim ${typeof erSim?.latency_ms === 'number' ? `${erSim.latency_ms}ms` : 'up'}`
      : 'ER Sim stopped';
  const erSimTooltip = erSimReachable
    ? `ER Simulator running at ${erSim?.url ?? 'localhost:8081'}`
    : 'ER Simulator not reachable — launch from Home view';

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

        {/* Connection status + mode pill */}
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
        <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
          isHeavy ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#6b6b75]/20 text-[#6b6b75]'
        }`}>
          {mode}
        </span>

        <Separator />

        {/* Active model */}
        <StatusBarItem
          icon={<Brain className="w-3 h-3" />}
          label={modelName}
          onClick={handleModelClick}
          tooltip={`Active LLM model: ${modelName}`}
          variant={connected ? 'success' : 'default'}
        />

        {/* Diagnostic indicators (errors + warnings) from useDiagnostics */}
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

        {/* Swarm status from useSwarmStatus */}
        <StatusBarItem
          icon={<Activity className="w-3 h-3" />}
          label={swarmLabel}
          tooltip={
            swarmActive
              ? `Swarm active: ${swarmAgentCount} agent${swarmAgentCount !== 1 ? 's' : ''} running`
              : 'Agent swarm idle'
          }
          variant={swarmActive ? 'success' : 'default'}
        />

        <Separator />

        {/* ER Simulator cross-product health pill */}
        <StatusBarItem
          icon={<HeartPulse className="w-3 h-3" />}
          label={erSimLabel}
          tooltip={erSimTooltip}
          variant={erSimReachable ? 'success' : 'default'}
        />

        <Separator />

        {/* Notifications */}
        <StatusBarItem
          icon={<Bell className="w-3 h-3" />}
          label=""
          onClick={handleNotificationsClick}
          tooltip="No notifications"
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
