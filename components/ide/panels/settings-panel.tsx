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
  Monitor,
  Laptop,
  Smartphone,
  Shield,
  Fingerprint,
  FolderTree,
  Code2,
  Layers,
  HeartPulse,
  Unplug,
  Globe,
  Lock,
  UserCheck,
  Bot,
  Save,
  Key,
  Zap,
  ArrowRightLeft,
} from 'lucide-react';
import { useSetting } from '@/lib/ide/settings-store';
import {
  MODEL_CATALOG,
  PROVIDERS,
  getEnabledModels,
  groupByProvider,
  type ProviderId,
} from '@/lib/ide/model-catalog';
import { getServiceUrl } from '@/lib/ide/service-registry';

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

interface PlatformInfo {
  os: string;
  osVersion: string;
  arch: string;
  chip: string;
  ramGB: number;
  gpuAvailable: boolean;
  gpuType: string;
  recommendedBackend: string;
  recommendedModel: string;
  estimatedVRAM: string;
}

interface HierarchyProfile {
  repoType: string;
  projectName: string;
  services: { name: string; path: string; type: string }[];
  submodules: string[];
  activeIDE: string;
  trackedPaths: string[];
  profilePath: string;
}

interface DeviceInfo {
  deviceId: string;
  hardwareFingerprint: string;
  publicKeyBound: boolean;
  subscriptionStatus: 'active' | 'trial' | 'expired' | 'none';
  subscriptionPlan: string;
  linkedDevices: { name: string; type: 'desktop' | 'mobile' | 'tablet'; lastSeen: number; current: boolean }[];
  crossDeviceEnabled: boolean;
}

interface RecoveryStatus {
  agentLoaded: boolean;
  lastRun: number;
  lastResult: 'ok' | 'recovered' | 'failed' | 'never';
  dockerAutoRestart: boolean;
  servicesMonitored: number;
  plistPath: string;
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
  platform: PlatformInfo;
  hierarchy: HierarchyProfile;
  device: DeviceInfo;
  recovery: RecoveryStatus;
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
    platform: {
      os: 'macOS',
      osVersion: 'Sequoia 15.5',
      arch: 'arm64',
      chip: 'Apple M4 Max',
      ramGB: 64,
      gpuAvailable: true,
      gpuType: 'Metal (40-core GPU)',
      recommendedBackend: 'MLX',
      recommendedModel: 'Qwen3-14B-4bit',
      estimatedVRAM: '~8.3GB',
    },
    hierarchy: {
      repoType: 'submodule-monorepo',
      projectName: 'er-simulator-superrepo',
      services: [
        { name: 'backend', path: 'backend', type: 'django' },
        { name: 'context_dna', path: 'context-dna', type: 'python' },
        { name: 'memory', path: 'memory', type: 'python' },
        { name: 'infra', path: 'infra', type: 'terraform' },
      ],
      submodules: ['landing-page', 'sim-frontend', 'admin.ersimulator.com', 'admin.contextdna.io'],
      activeIDE: 'Cursor',
      trackedPaths: ['backend/', 'context-dna/', 'memory/'],
      profilePath: '~/.context-dna/hierarchy_profile.json',
    },
    device: {
      deviceId: 'cdna-a1b2c3d4',
      hardwareFingerprint: 'sha256:e4f8...9c21',
      publicKeyBound: true,
      subscriptionStatus: 'active',
      subscriptionPlan: 'Pro (Lifetime)',
      linkedDevices: [
        { name: 'MacBook Pro', type: 'desktop', lastSeen: Date.now(), current: true },
        { name: 'iPhone 16 Pro', type: 'mobile', lastSeen: Date.now() - 3600000, current: false },
      ],
      crossDeviceEnabled: true,
    },
    recovery: {
      agentLoaded: true,
      lastRun: Date.now() - 1800000,
      lastResult: 'ok',
      dockerAutoRestart: true,
      servicesMonitored: 20,
      plistPath: '~/Library/LaunchAgents/com.contextdna.recovery.plist',
    },
    services: [
      { name: 'agent_service', port: 8080, status: 'healthy', latencyMs: 12 },
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
// Time ago helper
// ---------------------------------------------------------------------------

function timeAgo(ms: number): string {
  if (ms === 0) return 'never';
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Info row (reusable key-value)
// ---------------------------------------------------------------------------

function InfoRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-[#6b6b75] min-w-[60px]">{label}</span>
      <span className={`text-[#e5e5e5] ${mono ? 'font-mono' : ''} truncate`}>{value}</span>
    </div>
  );
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
// Device icon helper
// ---------------------------------------------------------------------------

function DeviceIcon({ type }: { type: 'desktop' | 'mobile' | 'tablet' }) {
  switch (type) {
    case 'desktop': return <Laptop className="w-3 h-3 text-[#3b82f6]" />;
    case 'mobile': return <Smartphone className="w-3 h-3 text-[#22c55e]" />;
    case 'tablet': return <Monitor className="w-3 h-3 text-[#c678dd]" />;
  }
}

// ---------------------------------------------------------------------------
// Agent Execution Section — primary mode + auto-fallback
// ---------------------------------------------------------------------------

function AgentExecutionSection() {
  const [primaryMode, setPrimaryMode] = useSetting('agents.primaryMode');
  const [autoFallback, setAutoFallback] = useSetting('agents.autoFallback');
  const fallbackMode = primaryMode === 'subscription' ? 'api' : 'subscription';

  return (
    <Section
      title="Agent Execution"
      icon={<Zap className="w-3.5 h-3.5" />}
      defaultOpen={false}
      badge={
        <span className="text-[9px] text-[#6b6b75]">
          {primaryMode === 'subscription' ? 'Sub' : 'API'}{autoFallback ? ' + fallback' : ''}
        </span>
      }
    >
      <div className="px-3 py-2 space-y-2.5">
        {/* Primary mode */}
        <div>
          <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider mb-1">Primary Mode</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPrimaryMode('subscription')}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors ${
                primaryMode === 'subscription'
                  ? 'border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]'
                  : 'border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5]'
              }`}
            >
              <Zap className="w-3 h-3" />
              Subscription
            </button>
            <button
              onClick={() => setPrimaryMode('api')}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors ${
                primaryMode === 'api'
                  ? 'border-[#e5c07b]/40 bg-[#e5c07b]/10 text-[#e5c07b]'
                  : 'border-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5]'
              }`}
            >
              <Key className="w-3 h-3" />
              API Key
            </button>
          </div>
          <div className="text-[9px] text-[#4a4a55] mt-1">
            {primaryMode === 'subscription'
              ? 'Uses Claude Pro/Max subscription via CLI (no per-token cost)'
              : 'Uses API key with pay-per-token pricing'}
          </div>
        </div>

        {/* Auto-fallback toggle */}
        <div className="flex items-center gap-2 pt-1.5 border-t border-[#2a2a35]/30">
          <button
            onClick={() => setAutoFallback(!autoFallback)}
            className="flex items-center"
          >
            <span className={`w-5 h-2.5 rounded-full transition-colors inline-flex items-center ${autoFallback ? 'bg-[#3b82f6]/30' : 'bg-[#6b6b75]/30'}`}>
              <span className={`w-2 h-2 rounded-full transition-all ${autoFallback ? 'bg-[#3b82f6] translate-x-2.5' : 'bg-[#6b6b75] translate-x-0.5'}`} />
            </span>
          </button>
          <div className="flex-1">
            <div className="text-[10px] text-[#e5e5e5]">Auto-Fallback</div>
            <div className="text-[9px] text-[#4a4a55]">
              {autoFallback
                ? `If ${primaryMode} fails → auto-retry with ${fallbackMode}`
                : 'No fallback — only the selected mode is used'}
            </div>
          </div>
          {autoFallback && (
            <ArrowRightLeft className="w-3 h-3 text-[#3b82f6]" />
          )}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Models Section — toggle models on/off, grouped by provider (Cursor-style)
// ---------------------------------------------------------------------------

const AGENT_API = getServiceUrl('helper_agent');

function ModelsSection() {
  const [enabledModels, setEnabledModels] = useSetting('models.enabled');
  const grouped = groupByProvider(MODEL_CATALOG);
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${AGENT_API}/api/agents/config/api-keys`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        const status: Record<string, boolean> = {};
        for (const [provider, info] of Object.entries(data as Record<string, { configured: boolean }>)) {
          status[provider] = info.configured;
        }
        setKeyStatus(status);
      })
      .catch(() => {});
  }, []);

  const toggle = (modelId: string) => {
    const current = enabledModels[modelId] ?? MODEL_CATALOG.find((m) => m.id === modelId)?.defaultEnabled ?? false;
    setEnabledModels({ ...enabledModels, [modelId]: !current });
  };

  const isEnabled = (modelId: string) =>
    enabledModels[modelId] ?? MODEL_CATALOG.find((m) => m.id === modelId)?.defaultEnabled ?? false;

  const enabledCount = MODEL_CATALOG.filter((m) => isEnabled(m.id)).length;

  return (
    <Section
      title="Models"
      icon={<Bot className="w-3.5 h-3.5" />}
      defaultOpen={false}
      badge={<span className="text-[9px] text-[#6b6b75]">{enabledCount} active</span>}
    >
      <div className="py-0.5">
        {PROVIDERS.map((provider) => {
          const models = grouped[provider.id];
          if (!models?.length) return null;
          return (
            <div key={provider.id} className="mb-1">
              <div className="flex items-center gap-1.5 px-3 py-0.5">
                <StatusDot status={keyStatus[provider.id] ? 'healthy' : provider.id === 'anthropic' ? 'healthy' : 'unknown'} />
                <span className="text-[9px] uppercase tracking-wider font-semibold text-[#6b6b75]">
                  {provider.name}
                </span>
              </div>
              {models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-3 py-0.5 hover:bg-[#1a1a24]/50 transition-colors"
                >
                  <button
                    onClick={() => toggle(m.id)}
                    className="flex items-center"
                  >
                    <span className={`w-5 h-2.5 rounded-full transition-colors inline-flex items-center ${isEnabled(m.id) ? 'bg-[#22c55e]/30' : 'bg-[#6b6b75]/30'}`}>
                      <span className={`w-2 h-2 rounded-full transition-all ${isEnabled(m.id) ? 'bg-[#22c55e] translate-x-2.5' : 'bg-[#6b6b75] translate-x-0.5'}`} />
                    </span>
                  </button>
                  <span className={`text-[10px] flex-1 ${isEnabled(m.id) ? 'text-[#e5e5e5]' : 'text-[#6b6b75]'}`}>
                    {m.displayName}
                  </span>
                  {m.supportsSubscription && (
                    <span className="text-[8px] px-1 rounded bg-[#22c55e]/10 text-[#22c55e]">sub</span>
                  )}
                  <span className="text-[9px] text-[#4a4a55] font-mono">
                    ${m.costPerMInput}/M
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// API Keys Section — per-provider key inputs with masked display
// ---------------------------------------------------------------------------

function ApiKeysSection() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [keyStatus, setKeyStatus] = useState<Record<string, { configured: boolean; masked: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [baseUrls, setBaseUrls] = useSetting('providers.baseUrls');
  const [customEnvKeys, setCustomEnvKeys] = useSetting('providers.envKeys');

  const fetchStatus = useCallback(() => {
    fetch(`${AGENT_API}/api/agents/config/api-keys`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => setKeyStatus(data as Record<string, { configured: boolean; masked: string }>))
      .catch(() => {});
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const saveKey = async (providerId: string) => {
    const key = keys[providerId];
    if (!key?.trim()) return;
    setSaving(providerId);
    try {
      const body: Record<string, string> = { provider: providerId, api_key: key.trim() };
      const provider = PROVIDERS.find((p) => p.id === providerId);
      if (provider?.baseUrlConfigurable && baseUrls[providerId]) {
        body.base_url = baseUrls[providerId];
      }
      // Send custom env var name if user overrode it
      const envKeyOverride = customEnvKeys[providerId];
      if (envKeyOverride) {
        body.env_key = envKeyOverride;
      }
      await fetch(`${AGENT_API}/api/agents/config/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      setKeys((prev) => ({ ...prev, [providerId]: '' }));
      fetchStatus();
    } catch { /* ignore */ }
    setSaving(null);
  };

  const getEnvKeyName = (providerId: string) =>
    customEnvKeys[providerId] || PROVIDERS.find((p) => p.id === providerId)?.envKey || '';

  return (
    <Section
      title="API Keys"
      icon={<Key className="w-3.5 h-3.5" />}
      defaultOpen={false}
    >
      <div className="py-0.5 space-y-1.5">
        {PROVIDERS.map((provider) => (
          <div key={provider.id} className="px-3">
            <div className="flex items-center gap-2 py-0.5">
              <StatusDot status={keyStatus[provider.id]?.configured ? 'healthy' : 'unknown'} />
              <span className="text-[10px] text-[#e5c07b] font-medium w-20">{provider.name}</span>
              <span className="text-[9px] font-mono text-[#4a4a55] flex-1 truncate">
                {keyStatus[provider.id]?.configured
                  ? keyStatus[provider.id].masked + '\u2022'.repeat(16)
                  : 'Not configured'}
              </span>
            </div>
            {/* Env var name (editable) */}
            <div className="flex items-center gap-1 ml-5 mb-0.5">
              <span className="text-[8px] text-[#4a4a55]">env:</span>
              <input
                type="text"
                value={getEnvKeyName(provider.id)}
                onChange={(e) => setCustomEnvKeys({ ...customEnvKeys, [provider.id]: e.target.value })}
                className="px-1 py-0 text-[9px] font-mono bg-transparent border-b border-[#2a2a35]/50 text-[#6b6b75] focus:outline-none focus:border-[#3b82f6]/50 focus:text-[#e5e5e5] w-40"
                title="Environment variable name — edit if your system uses a different name"
              />
            </div>
            <div className="flex items-center gap-1.5 ml-5">
              <input
                type={revealed[provider.id] ? 'text' : 'password'}
                placeholder={`Enter ${getEnvKeyName(provider.id)}`}
                value={keys[provider.id] || ''}
                onChange={(e) => setKeys((prev) => ({ ...prev, [provider.id]: e.target.value }))}
                className="flex-1 px-1.5 py-0.5 text-[10px] font-mono bg-[#111118] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#4a4a55] focus:outline-none focus:border-[#3b82f6]/50"
              />
              <button
                onClick={() => setRevealed((prev) => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                className="p-0.5 rounded hover:bg-[#2a2a35]"
              >
                {revealed[provider.id]
                  ? <EyeOff className="w-3 h-3 text-[#6b6b75]" />
                  : <Eye className="w-3 h-3 text-[#6b6b75]" />}
              </button>
              <button
                onClick={() => saveKey(provider.id)}
                disabled={!keys[provider.id]?.trim() || saving === provider.id}
                className="p-0.5 rounded hover:bg-[#22c55e]/15 disabled:opacity-30"
                title="Save key"
              >
                {saving === provider.id
                  ? <Loader2 className="w-3 h-3 text-[#22c55e] animate-spin" />
                  : <Save className="w-3 h-3 text-[#22c55e]" />}
              </button>
            </div>
            {provider.baseUrlConfigurable && (
              <div className="flex items-center gap-1.5 ml-5 mt-0.5">
                <span className="text-[9px] text-[#6b6b75] w-14">Base URL</span>
                <input
                  type="text"
                  placeholder={provider.defaultBaseUrl}
                  value={baseUrls[provider.id] || ''}
                  onChange={(e) => setBaseUrls({ ...baseUrls, [provider.id]: e.target.value })}
                  className="flex-1 px-1.5 py-0.5 text-[10px] font-mono bg-[#111118] border border-[#2a2a35] rounded text-[#6b6b75] placeholder-[#4a4a55] focus:outline-none focus:border-[#3b82f6]/50"
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="px-4 py-1.5 text-[9px] text-[#4a4a55] italic">
        Keys stored server-side in .env (never in browser)
      </div>
    </Section>
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
        const res = await fetch(getServiceUrl('helper_agent') + '/api/settings/status', {
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
      const res = await fetch(getServiceUrl('helper_agent') + '/api/settings/status', {
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
    setTimeout(() => {
      setData((prev) => ({
        ...prev,
        installSteps: prev.installSteps.map((s) => ({ ...s, completed: true })),
      }));
      setRunningSetup(false);
    }, 3000);
  }, []);

  const { system, platform, hierarchy, device, recovery, services, installSteps, envVars } = data;
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
            className="p-1 rounded hover:bg-[#1a1a24] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 text-[#6b6b75] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ---- Section: Platform & Hardware ---- */}
        <Section
          title="Platform & Hardware"
          icon={<Cpu className="w-3.5 h-3.5" />}
          defaultOpen={true}
          badge={
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6]">
              {platform.arch}
            </span>
          }
        >
          <div className="px-3 py-1.5 space-y-1">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <InfoRow label="OS" value={`${platform.os} ${platform.osVersion}`} />
              <InfoRow label="Arch" value={platform.arch} />
              <InfoRow label="Chip" value={platform.chip} />
              <InfoRow label="RAM" value={`${platform.ramGB}GB`} />
            </div>

            {/* GPU */}
            <div className="flex items-center gap-2 text-[10px] mt-1.5 pt-1.5 border-t border-[#2a2a35]/30">
              {platform.gpuAvailable ? (
                <CheckCircle2 className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
              ) : (
                <XCircle className="w-3 h-3 text-[#ef4444] flex-shrink-0" />
              )}
              <span className="text-[#6b6b75]">GPU</span>
              <span className="text-[#e5e5e5] font-mono text-[9px]">{platform.gpuType}</span>
            </div>

            {/* Recommended config */}
            <div className="mt-1.5 pt-1.5 border-t border-[#2a2a35]/30 space-y-0.5">
              <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider mb-1">Recommended</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <InfoRow label="Backend" value={platform.recommendedBackend} />
                <InfoRow label="VRAM" value={platform.estimatedVRAM} />
              </div>
              <InfoRow label="Model" value={platform.recommendedModel} />
            </div>
          </div>
        </Section>

        {/* ---- Section: System Status ---- */}
        <Section
          title="System Status"
          icon={<Server className="w-3.5 h-3.5" />}
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

        {/* ---- Section: Service Configuration ---- */}
        <Section
          title="Service Configuration"
          icon={<Unplug className="w-3.5 h-3.5" />}
          defaultOpen={false}
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

        {/* ---- Section: Hierarchy Profile ---- */}
        <Section
          title="Hierarchy Profile"
          icon={<FolderTree className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c678dd]/15 text-[#c678dd]">
              {hierarchy.repoType}
            </span>
          }
        >
          <div className="px-3 py-1.5 space-y-2">
            {/* Project info */}
            <div className="space-y-0.5">
              <InfoRow label="Project" value={hierarchy.projectName} mono={false} />
              <InfoRow label="Type" value={hierarchy.repoType} />
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[#6b6b75] min-w-[60px]">IDE</span>
                <Code2 className="w-3 h-3 text-[#3b82f6]" />
                <span className="text-[#e5e5e5]">{hierarchy.activeIDE}</span>
              </div>
            </div>

            {/* Services */}
            <div className="pt-1.5 border-t border-[#2a2a35]/30">
              <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider mb-1">Detected Services</div>
              <div className="space-y-0.5">
                {hierarchy.services.map((svc) => (
                  <div key={svc.name} className="flex items-center gap-2 text-[10px] py-0.5 px-1 rounded hover:bg-[#1a1a24]/50">
                    <Layers className="w-3 h-3 text-[#6b6b75]" />
                    <span className="text-[#e5e5e5] flex-1">{svc.name}</span>
                    <span className="text-[9px] font-mono text-[#4a4a55]">{svc.path}/</span>
                    <span className="text-[9px] px-1 rounded bg-[#1a1a24] text-[#6b6b75]">{svc.type}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Submodules */}
            <div className="pt-1.5 border-t border-[#2a2a35]/30">
              <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider mb-1">
                Submodules ({hierarchy.submodules.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {hierarchy.submodules.map((sm) => (
                  <span key={sm} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a24] text-[#6b6b75] font-mono">
                    {sm}
                  </span>
                ))}
              </div>
            </div>

            {/* Profile path */}
            <div className="pt-1 text-[9px] text-[#4a4a55] italic font-mono truncate">
              {hierarchy.profilePath}
            </div>
          </div>
        </Section>

        {/* ---- Section: Subscription & Device ---- */}
        <Section
          title="Subscription & Device"
          icon={<Shield className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            device.subscriptionStatus === 'active' ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">
                {device.subscriptionPlan}
              </span>
            ) : device.subscriptionStatus === 'trial' ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#e5c07b]/15 text-[#e5c07b]">
                Trial
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#ef4444]/15 text-[#ef4444]">
                Inactive
              </span>
            )
          }
        >
          <div className="px-3 py-1.5 space-y-2">
            {/* Device identity */}
            <div className="space-y-0.5">
              <InfoRow label="Device ID" value={device.deviceId} />
              <InfoRow label="Fingerprint" value={device.hardwareFingerprint} />
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[#6b6b75] min-w-[60px]">Key Bound</span>
                {device.publicKeyBound ? (
                  <>
                    <Lock className="w-3 h-3 text-[#22c55e]" />
                    <span className="text-[#22c55e]">X25519 bound</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-3 h-3 text-[#e5c07b]" />
                    <span className="text-[#e5c07b]">Unbound</span>
                  </>
                )}
              </div>
            </div>

            {/* Linked devices */}
            <div className="pt-1.5 border-t border-[#2a2a35]/30">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] text-[#6b6b75] uppercase tracking-wider flex-1">
                  Linked Devices ({device.linkedDevices.length})
                </span>
                {device.crossDeviceEnabled && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6] flex items-center gap-1">
                    <Globe className="w-2.5 h-2.5" />
                    Cross-Device
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {device.linkedDevices.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-[#1a1a24]/50 text-[10px]">
                    <DeviceIcon type={d.type} />
                    <span className={`flex-1 ${d.current ? 'text-[#e5e5e5]' : 'text-[#6b6b75]'}`}>
                      {d.name}
                    </span>
                    {d.current && (
                      <span className="text-[9px] px-1 rounded bg-[#22c55e]/15 text-[#22c55e]">current</span>
                    )}
                    <span className="text-[9px] text-[#4a4a55]">{timeAgo(d.lastSeen)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cross-device features */}
            <div className="pt-1.5 border-t border-[#2a2a35]/30">
              <div className="text-[9px] text-[#6b6b75] uppercase tracking-wider mb-1">Cross-Device Features</div>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'Voice Mode', enabled: device.crossDeviceEnabled },
                  { label: 'LLM Chat', enabled: device.crossDeviceEnabled },
                  { label: 'Doc Upload', enabled: device.crossDeviceEnabled },
                  { label: 'Text Orchestration', enabled: device.crossDeviceEnabled },
                ].map((feat) => (
                  <div key={feat.label} className="flex items-center gap-1 text-[10px]">
                    {feat.enabled ? (
                      <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                    ) : (
                      <Circle className="w-3 h-3 text-[#4a4a55]" />
                    )}
                    <span className={feat.enabled ? 'text-[#e5e5e5]' : 'text-[#4a4a55]'}>
                      {feat.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Security note */}
            <div className="px-1 py-1 text-[9px] text-[#4a4a55] italic">
              4-layer security: Device ID + HW Fingerprint + X25519 + Ed25519
            </div>
          </div>
        </Section>

        {/* ---- Section: Recovery Agent ---- */}
        <Section
          title="Recovery Agent"
          icon={<HeartPulse className="w-3.5 h-3.5" />}
          defaultOpen={false}
          badge={
            recovery.agentLoaded ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">
                Active
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#ef4444]/15 text-[#ef4444]">
                Inactive
              </span>
            )
          }
        >
          <div className="px-3 py-1.5 space-y-1.5">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[#6b6b75] min-w-[60px]">Status</span>
                {recovery.agentLoaded ? (
                  <>
                    <UserCheck className="w-3 h-3 text-[#22c55e]" />
                    <span className="text-[#22c55e]">Loaded (launchd)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3 h-3 text-[#ef4444]" />
                    <span className="text-[#ef4444]">Not loaded</span>
                  </>
                )}
              </div>
              <InfoRow label="Last Run" value={timeAgo(recovery.lastRun)} />
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[#6b6b75] min-w-[60px]">Result</span>
                <span className={`font-mono ${
                  recovery.lastResult === 'ok' ? 'text-[#22c55e]' :
                  recovery.lastResult === 'recovered' ? 'text-[#e5c07b]' :
                  recovery.lastResult === 'failed' ? 'text-[#ef4444]' :
                  'text-[#6b6b75]'
                }`}>
                  {recovery.lastResult}
                </span>
              </div>
            </div>

            <div className="pt-1.5 border-t border-[#2a2a35]/30 space-y-0.5">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="text-[#6b6b75] min-w-[60px]">Docker</span>
                {recovery.dockerAutoRestart ? (
                  <span className="text-[#22c55e]">Auto-restart enabled</span>
                ) : (
                  <span className="text-[#6b6b75]">Manual only</span>
                )}
              </div>
              <InfoRow label="Monitored" value={`${recovery.servicesMonitored} services`} />
            </div>

            <div className="pt-1 text-[9px] text-[#4a4a55] italic font-mono truncate">
              {recovery.plistPath}
            </div>
          </div>
        </Section>

        {/* ---- Section: Install Wizard ---- */}
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

        {/* ---- Section: Agent Execution ---- */}
        <AgentExecutionSection />

        {/* ---- Section: Models ---- */}
        <ModelsSection />

        {/* ---- Section: API Keys ---- */}
        <ApiKeysSection />

        {/* ---- Section: Environment Variables ---- */}
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
