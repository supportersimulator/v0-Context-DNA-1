'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Play,
  Server,
  Database,
  HardDrive,
  Cpu,
  MemoryStick,
  RefreshCw,
  Wifi,
  WifiOff,
  Circle,
  Loader2,
  Download,
  GitBranch,
  Container,
  KeyRound,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  latencyMs?: number;
}

interface SystemInfo {
  pythonVersion: string;
  venvPath: string;
  nodeVersion: string;
  dockerContainers: { healthy: number; total: number };
  diskUsage: { sqliteBytes: number; pgBytes: number };
  memoryUsage: { schedulerMB: number; agentServiceMB: number };
}

interface InstallStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
}

interface EnvVar {
  key: string;
  value: string;
  masked: boolean;
}

interface SettingsData {
  system: SystemInfo;
  services: ServiceStatus[];
  installSteps: InstallStep[];
  envVars: EnvVar[];
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockData(): SettingsData {
  return {
    system: {
      pythonVersion: '3.14.0a4',
      venvPath: '/Users/aarontjomsland/Documents/er-simulator-superrepo/.venv',
      nodeVersion: '22.11.0',
      dockerContainers: { healthy: 19, total: 20 },
      diskUsage: { sqliteBytes: 48_300_000, pgBytes: 312_000_000 },
      memoryUsage: { schedulerMB: 103, agentServiceMB: 184 },
    },
    services: [
      { name: 'agent_service', port: 8029, status: 'healthy', latencyMs: 12 },
      { name: 'vllm-mlx', port: 5044, status: 'healthy', latencyMs: 45 },
      { name: 'PostgreSQL (context_dna)', port: 5432, status: 'healthy', latencyMs: 3 },
      { name: 'PostgreSQL (acontext)', port: 15432, status: 'healthy', latencyMs: 4 },
      { name: 'Redis', port: 6379, status: 'healthy', latencyMs: 1 },
    ],
    installSteps: [
      { id: 'python', label: 'Python 3.14 venv', description: 'Virtual environment with Python 3.14', completed: true },
      { id: 'docker', label: 'Docker containers running', description: '20 containers orchestrated via Docker Compose', completed: true },
      { id: 'postgres', label: 'PostgreSQL databases created', description: 'context_dna (5432) + acontext (15432)', completed: true },
      { id: 'redis', label: 'Redis accessible', description: 'Port 6379, no auth (context-dna-redis)', completed: true },
      { id: 'vllm', label: 'vllm-mlx model downloaded', description: 'Qwen3-14B-4bit (8.31GB)', completed: true },
      { id: 'sqlite', label: 'SQLite databases initialized', description: '11 DBs with WAL mode + FTS5', completed: true },
      { id: 'scheduler', label: 'Scheduler daemon active', description: 'lite_scheduler with 24 jobs', completed: true },
      { id: 'hooks', label: 'Git hooks installed', description: 'post-commit hook for auto_learn.py', completed: false },
    ],
    envVars: [
      { key: 'GOOGLE_SHEET_ID', value: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ', masked: true },
      { key: 'DATABASE_URL', value: 'postgresql://user:pass@127.0.0.1:5432/context_dna', masked: true },
      { key: 'REDIS_URL', value: 'redis://127.0.0.1:6379/0', masked: false },
      { key: 'OPENAI_API_KEY', value: 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', masked: true },
      { key: 'VLLM_HOST', value: 'http://127.0.0.1:5044', masked: false },
      { key: 'LIVE_SYNC_PORT', value: '3333', masked: false },
    ],
  };
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function Section({
  title,
  icon,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#2a2a35]/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 hover:bg-[#1a1a24] transition-colors"
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-[#6b6b75]" />
          : <ChevronRight className="w-3 h-3 text-[#6b6b75]" />
        }
        <span className="text-[var(--primary)]">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75] flex-1">
          {title}
        </span>
        {badge}
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status indicator dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'healthy' ? 'bg-[#22c55e]' :
    status === 'degraded' ? 'bg-[#e5c07b]' :
    status === 'offline' ? 'bg-[#ef4444]' :
    'bg-[#6b6b75]';

  return (
    <span className={`w-2 h-2 rounded-full ${color} flex-shrink-0 inline-block`} />
  );
}

// ---------------------------------------------------------------------------
// Format bytes
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

// ---------------------------------------------------------------------------
// Editable port field
// ---------------------------------------------------------------------------

function PortField({
  port,
  onRestart,
}: {
  port: number;
  onRestart: () => void;
}) {
  const [value, setValue] = useState(String(port));
  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(() => {
    setRestarting(true);
    setTimeout(() => {
      setRestarting(false);
      onRestart();
    }, 1500);
  }, [onRestart]);

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        className="w-16 px-1.5 py-0.5 text-[10px] font-mono text-[#e5e5e5] bg-[#111118] border border-[#2a2a35] rounded
          focus:outline-none focus:border-[var(--primary)] text-center"
      />
      <button
        onClick={handleRestart}
        disabled={restarting}
        title="Restart service"
        className="p-0.5 rounded hover:bg-[#2a2a35] transition-colors disabled:opacity-50"
      >
        {restarting
          ? <Loader2 className="w-3 h-3 text-[#e5c07b] animate-spin" />
          : <RefreshCw className="w-3 h-3 text-[#6b6b75] hover:text-[#e5e5e5]" />
        }
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Masked env var row
// ---------------------------------------------------------------------------

function EnvVarRow({ envVar }: { envVar: EnvVar }) {
  const [revealed, setRevealed] = useState(!envVar.masked);

  const displayValue = revealed
    ? envVar.value
    : envVar.value.slice(0, 4) + '\u2022'.repeat(Math.min(20, envVar.value.length - 4));

  return (
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-[#1a1a24]/50 transition-colors group">
      <KeyRound className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
      <span className="text-[10px] font-mono text-[#e5c07b] w-36 flex-shrink-0 truncate">
        {envVar.key}
      </span>
      <span className="text-[10px] font-mono text-[#6b6b75] flex-1 truncate">
        {displayValue}
      </span>
      {envVar.masked && (
        <button
          onClick={() => setRevealed((v) => !v)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[#2a2a35]"
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed
            ? <EyeOff className="w-3 h-3 text-[#6b6b75]" />
            : <Eye className="w-3 h-3 text-[#6b6b75]" />
          }
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsPanel -- main export
// ---------------------------------------------------------------------------

export function SettingsPanel() {
  const [data, setData] = useState<SettingsData>(getMockData);
  const [loading, setLoading] = useState(false);
  const [runningSetup, setRunningSetup] = useState(false);

  // Attempt live fetch from agent_service
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('http://127.0.0.1:8029/api/settings/status', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.system) setData(json);
        }
      } catch {
        // keep mock data
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8029/api/settings/status', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.system) setData(json);
      }
    } catch {
      // keep current
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRunSetup = useCallback(() => {
    setRunningSetup(true);
    // Simulate setup execution
    setTimeout(() => {
      setData((prev) => ({
        ...prev,
        installSteps: prev.installSteps.map((s) => ({ ...s, completed: true })),
      }));
      setRunningSetup(false);
    }, 3000);
  }, []);

  const { system, services, installSteps, envVars } = data;
  const completedSteps = installSteps.filter((s) => s.completed).length;
  const allComplete = completedSteps === installSteps.length;
  const healthyServices = services.filter((s) => s.status === 'healthy').length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Settings className="w-3.5 h-3.5 text-[var(--primary)]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Settings / Install Wizard</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={loading}
            title="Refresh status"
            className="p-1 rounded hover:bg-[#1a1a24] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 text-[#6b6b75] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ---- Section 1: System Status ---- */}
        <Section
          title="System Status"
          icon={<Cpu className="w-3.5 h-3.5" />}
          defaultOpen={true}
          badge={
            <span className="flex items-center gap-1 text-[9px] text-[#6b6b75]">
              {healthyServices === services.length
                ? <Wifi className="w-3 h-3 text-[#22c55e]" />
                : <WifiOff className="w-3 h-3 text-[#e5c07b]" />
              }
              {healthyServices}/{services.length}
            </span>
          }
        >
          <div className="px-3 py-1.5 space-y-1.5">
            {/* Runtime versions */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[#6b6b75]">Python</span>
                <span className="text-[#e5e5e5] font-mono">{system.pythonVersion}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#6b6b75]">Node</span>
                <span className="text-[#e5e5e5] font-mono">{system.nodeVersion}</span>
              </div>
            </div>

            <div className="text-[10px] flex items-center gap-1.5">
              <span className="text-[#6b6b75]">venv</span>
              <span className="text-[#e5e5e5] font-mono text-[9px] truncate">{system.venvPath}</span>
            </div>

            {/* Docker */}
            <div className="flex items-center gap-2 text-[10px] mt-1">
              <Container className="w-3 h-3 text-[#3b82f6]" />
              <span className="text-[#6b6b75]">Docker</span>
              <span className="text-[#e5e5e5] font-mono">
                {system.dockerContainers.healthy} healthy / {system.dockerContainers.total} total
              </span>
              {system.dockerContainers.healthy === system.dockerContainers.total
                ? <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                : <XCircle className="w-3 h-3 text-[#e5c07b]" />
              }
            </div>

            {/* Disk */}
            <div className="flex items-center gap-2 text-[10px]">
              <HardDrive className="w-3 h-3 text-[#6b6b75]" />
              <span className="text-[#6b6b75]">Disk</span>
              <span className="text-[#e5e5e5] font-mono">
                SQLite: {formatBytes(system.diskUsage.sqliteBytes)}
              </span>
              <span className="text-[#4a4a55]">|</span>
              <span className="text-[#e5e5e5] font-mono">
                PG: {formatBytes(system.diskUsage.pgBytes)}
              </span>
            </div>

            {/* Memory */}
            <div className="flex items-center gap-2 text-[10px]">
              <MemoryStick className="w-3 h-3 text-[#c678dd]" />
              <span className="text-[#6b6b75]">RSS</span>
              <span className="text-[#e5e5e5] font-mono">
                scheduler: {system.memoryUsage.schedulerMB}MB
              </span>
              <span className="text-[#4a4a55]">|</span>
              <span className="text-[#e5e5e5] font-mono">
                agent: {system.memoryUsage.agentServiceMB}MB
              </span>
            </div>
          </div>
        </Section>

        {/* ---- Section 2: Service Configuration ---- */}
        <Section
          title="Service Configuration"
          icon={<Server className="w-3.5 h-3.5" />}
          defaultOpen={true}
          badge={
            <span className="text-[9px] text-[#6b6b75]">
              {healthyServices} active
            </span>
          }
        >
          <div className="px-3 py-1 space-y-0.5">
            {services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center gap-2 py-1.5 text-[10px] hover:bg-[#1a1a24]/50 px-1.5 rounded transition-colors"
              >
                <StatusDot status={svc.status} />
                <span className="text-[#e5e5e5] flex-1 truncate">{svc.name}</span>
                {svc.latencyMs !== undefined && (
                  <span className="text-[9px] text-[#4a4a55] font-mono">{svc.latencyMs}ms</span>
                )}
                <PortField
                  port={svc.port}
                  onRestart={() => {
                    // In production: POST to restart endpoint
                  }}
                />
              </div>
            ))}
          </div>

          {/* Auth note for Redis */}
          <div className="px-4 py-1 text-[9px] text-[#4a4a55] italic">
            Redis: no auth (context-dna-redis on 6379)
          </div>
        </Section>

        {/* ---- Section 3: Install Wizard ---- */}
        <Section
          title="Install Wizard"
          icon={<Download className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            allComplete ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">
                Complete
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#e5c07b]/15 text-[#e5c07b]">
                {completedSteps}/{installSteps.length}
              </span>
            )
          }
        >
          <div className="px-3 py-1.5 space-y-0.5">
            {installSteps.map((step) => (
              <div
                key={step.id}
                className="flex items-start gap-2 py-1.5 px-1.5 rounded hover:bg-[#1a1a24]/50 transition-colors"
              >
                {step.completed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-[#4a4a55] flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] ${step.completed ? 'text-[#e5e5e5]' : 'text-[#6b6b75]'}`}>
                    {step.label}
                  </div>
                  <div className="text-[9px] text-[#4a4a55] truncate">{step.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="px-4 py-1.5">
            <div className="h-1.5 bg-[#1a1a24] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#22c55e] transition-all duration-500"
                style={{ width: `${(completedSteps / installSteps.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Run Setup button */}
          {!allComplete && (
            <div className="px-4 py-2">
              <button
                onClick={handleRunSetup}
                disabled={runningSetup}
                className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-medium rounded
                  bg-[var(--primary)]/15 text-[var(--primary)] border border-[var(--primary)]/30
                  hover:bg-[var(--primary)]/25 transition-colors disabled:opacity-50"
              >
                {runningSetup ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Running Setup...
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    Run Setup
                  </>
                )}
              </button>
            </div>
          )}

          {allComplete && (
            <div className="px-4 py-2 text-center">
              <span className="text-[10px] text-[#22c55e]">
                All components installed and verified
              </span>
            </div>
          )}
        </Section>

        {/* ---- Section 4: Environment Variables ---- */}
        <Section
          title="Environment Variables"
          icon={<KeyRound className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            <span className="text-[9px] text-[#6b6b75]">{envVars.length} vars</span>
          }
        >
          <div className="py-0.5">
            {envVars.map((ev) => (
              <EnvVarRow key={ev.key} envVar={ev} />
            ))}
          </div>
          <div className="px-4 py-1.5 text-[9px] text-[#4a4a55] italic">
            Source: .env (never committed to git)
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[#2a2a35] text-[9px] text-[#4a4a55] flex-shrink-0">
        <span className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          Context DNA v2.0
        </span>
        <span className="font-mono flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          main
        </span>
      </div>
    </div>
  );
}
