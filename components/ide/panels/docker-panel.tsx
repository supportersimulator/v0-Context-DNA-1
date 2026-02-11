'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container,
  Play,
  Square,
  RotateCcw,
  Activity,
  AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ContainerInfo {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  ports: Array<{ PrivatePort: number; PublicPort?: number; Type: string }>;
}

interface ContainerStats {
  cpuPercent: number;
  memory: { usage: number; limit: number; percent: number };
}

// ---------------------------------------------------------------------------
// Electron Docker bridge
// ---------------------------------------------------------------------------
function getElectronDocker() {
  if (typeof window !== 'undefined' && (window as any).electron?.docker) {
    return (window as any).electron.docker;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status dot color
// ---------------------------------------------------------------------------
function statusColor(state: string) {
  switch (state) {
    case 'running':
      return 'bg-[#22c55e]';
    case 'exited':
    case 'dead':
      return 'bg-red-500';
    case 'restarting':
    case 'paused':
      return 'bg-yellow-500';
    default:
      return 'bg-[#6b6b75]';
  }
}

// ---------------------------------------------------------------------------
// Format bytes
// ---------------------------------------------------------------------------
function formatMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(0)}MB`;
}

// ---------------------------------------------------------------------------
// DockerPanel
// ---------------------------------------------------------------------------
export function DockerPanel() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [stats, setStats] = useState<Record<string, ContainerStats>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const docker = useRef(getElectronDocker());
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Fetch containers
  const refresh = useCallback(async () => {
    if (!docker.current) return;
    try {
      const result = await docker.current.listContainers();
      setContainers(result.containers || []);
      setError(null);
    } catch {
      setError('Failed to connect to Docker');
    }
  }, []);

  // Fetch stats for running containers
  const refreshStats = useCallback(async () => {
    if (!docker.current) return;
    const running = containers.filter((c) => c.state === 'running');
    const results: Record<string, ContainerStats> = {};
    await Promise.allSettled(
      running.map(async (c) => {
        try {
          const s = await docker.current!.containerStats(c.id);
          results[c.id] = s;
        } catch { /* ignore individual failures */ }
      })
    );
    setStats((prev) => ({ ...prev, ...results }));
  }, [containers]);

  // Container action
  const handleAction = useCallback(async (id: string, action: 'start' | 'stop' | 'restart') => {
    if (!docker.current) return;
    try {
      await docker.current.containerAction(id, action);
      await refresh();
    } catch { /* toast error in future */ }
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 10000);
    return () => clearInterval(intervalRef.current);
  }, [refresh]);

  useEffect(() => {
    if (containers.length > 0) refreshStats();
  }, [containers, refreshStats]);

  if (!docker.current) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2 p-4">
        <Container className="w-8 h-8 opacity-50" />
        <span>Docker panel requires Electron</span>
        <span className="text-xs">Available in Electron desktop app</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2 p-4">
        <AlertCircle className="w-8 h-8 text-red-400 opacity-70" />
        <span>{error}</span>
        <button onClick={refresh} className="text-xs text-[#22c55e] hover:underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Container className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">
          Containers ({containers.length})
        </span>
        <button onClick={refresh} className="ml-auto" title="Refresh">
          <RotateCcw className="w-3 h-3 text-[#6b6b75] hover:text-[#e5e5e5]" />
        </button>
      </div>

      {/* Container list */}
      <div className="flex-1 overflow-auto">
        {containers.map((c) => {
          const s = stats[c.id];
          const name = c.names[0]?.replace(/^\//, '') || c.id.slice(0, 12);
          const isRunning = c.state === 'running';

          return (
            <div key={c.id} className="border-b border-[#2a2a35]/50">
              <button
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-[#1a1a24] transition-colors"
                onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              >
                <span className={`w-2 h-2 rounded-full ${statusColor(c.state)} flex-shrink-0`} />
                <span className="text-xs text-[#e5e5e5] truncate flex-1">{name}</span>
                {s && isRunning && (
                  <span className="text-[10px] text-[#6b6b75] flex-shrink-0">
                    {s.cpuPercent.toFixed(1)}% | {formatMB(s.memory.usage)}
                  </span>
                )}
              </button>

              {expandedId === c.id && (
                <div className="px-3 py-2 bg-[#111118] text-xs space-y-1">
                  <div className="text-[#6b6b75]">
                    Image: <span className="text-[#e5e5e5]">{c.image}</span>
                  </div>
                  <div className="text-[#6b6b75]">
                    Status: <span className="text-[#e5e5e5]">{c.status}</span>
                  </div>
                  {s && (
                    <div className="flex gap-3">
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-blue-400" />
                        <span className="text-[#e5e5e5]">{s.cpuPercent.toFixed(1)}%</span>
                      </div>
                      <div className="text-[#e5e5e5]">
                        {formatMB(s.memory.usage)} / {formatMB(s.memory.limit)}
                      </div>
                    </div>
                  )}
                  {/* Actions */}
                  <div className="flex gap-1 pt-1">
                    {!isRunning && (
                      <button
                        onClick={() => handleAction(c.id, 'start')}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#22c55e]/20 text-[#22c55e] text-[10px] hover:bg-[#22c55e]/30"
                      >
                        <Play className="w-3 h-3" /> Start
                      </button>
                    )}
                    {isRunning && (
                      <button
                        onClick={() => handleAction(c.id, 'stop')}
                        className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] hover:bg-red-500/30"
                      >
                        <Square className="w-3 h-3" /> Stop
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(c.id, 'restart')}
                      className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1a1a24] text-[#6b6b75] text-[10px] hover:text-[#e5e5e5]"
                    >
                      <RotateCcw className="w-3 h-3" /> Restart
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
