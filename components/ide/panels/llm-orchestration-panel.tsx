'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  ChevronDown,
  ChevronRight,
  Circle,
  Activity,
  Zap,
  Clock,
  Gauge,
  Brain,
  Shield,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Thermometer,
  Power,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LLMServerStatus {
  online: boolean;
  model: string;
  modelSize: string;
  port: number;
  uptime: string;
  rssGb: number;
}

interface InferenceProfile {
  name: string;
  temperature: number;
  maxTokens: number;
  active: boolean;
}

interface QueueItem {
  id: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  label: string;
  source: string;
  status: 'queued' | 'processing' | 'done';
  timestamp: number;
}

interface InferenceMetrics {
  tokensPerSec: number;
  avgLatencyMs: number;
  cacheHitRate: number;
  totalRequests: number;
  thinkingEnabled: boolean;
}

interface HealthIndicator {
  id: string;
  label: string;
  enabled: boolean;
  status: 'ok' | 'warn' | 'fail';
}

interface WatchdogEntry {
  id: string;
  name: string;
  enabled: boolean;
  intervalSec: number;
  strikes: number;
  maxStrikes: number;
  lastCheck: number;
}

interface WatchdogStatus {
  intervalSec: number;
  strikes: number;
  maxStrikes: number;
  lastCheck: number;
  rssReady: boolean;
  watchdogs: WatchdogEntry[];
  indicators: HealthIndicator[];
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockData() {
  return {
    server: { online: true, model: 'Qwen3-14B-4bit', modelSize: '8.31 GB', port: 5044, uptime: '6h 12m', rssGb: 2.4 } as LLMServerStatus,
    profiles: [
      { name: 'coding', temperature: 0.3, maxTokens: 4096, active: false },
      { name: 'explore', temperature: 0.7, maxTokens: 4096, active: false },
      { name: 'voice', temperature: 0.6, maxTokens: 2048, active: false },
      { name: 'deep', temperature: 0.5, maxTokens: 4096, active: false },
      { name: 'reasoning', temperature: 0.6, maxTokens: 1024, active: true },
    ] as InferenceProfile[],
    queue: [
      { id: 'q1', priority: 'P2', label: 'Section 2 wisdom', source: 'injection', status: 'processing', timestamp: Date.now() - 2000 },
      { id: 'q2', priority: 'P2', label: 'Section 8 synaptic', source: 'injection', status: 'queued', timestamp: Date.now() - 1000 },
      { id: 'q3', priority: 'P4', label: 'Hindsight validation', source: 'scheduler', status: 'queued', timestamp: Date.now() - 5000 },
      { id: 'q4', priority: 'P4', label: 'Meta-analysis', source: 'scheduler', status: 'queued', timestamp: Date.now() - 8000 },
    ] as QueueItem[],
    metrics: { tokensPerSec: 42.5, avgLatencyMs: 340, cacheHitRate: 0.73, totalRequests: 1284, thinkingEnabled: true } as InferenceMetrics,
    watchdog: {
      intervalSec: 60, strikes: 0, maxStrikes: 3, lastCheck: Date.now() - 15000, rssReady: true,
      watchdogs: [
        { id: 'vllm-mlx', name: 'vllm-mlx Process', enabled: true, intervalSec: 60, strikes: 0, maxStrikes: 3, lastCheck: Date.now() - 15000 },
        { id: 'rss-memory', name: 'RSS Memory', enabled: true, intervalSec: 60, strikes: 0, maxStrikes: 3, lastCheck: Date.now() - 15000 },
        { id: 'inference-health', name: 'Inference Health', enabled: true, intervalSec: 30, strikes: 0, maxStrikes: 5, lastCheck: Date.now() - 10000 },
      ],
      indicators: [
        { id: 'rss-check', label: 'RSS >2GB readiness', enabled: true, status: 'ok' },
        { id: 'port-check', label: 'Port 5044 reachable', enabled: true, status: 'ok' },
        { id: 'response-time', label: 'Response time <5s', enabled: true, status: 'ok' },
        { id: 'process-alive', label: 'vllm-mlx process alive', enabled: true, status: 'ok' },
        { id: 'gpu-temp', label: 'GPU temperature', enabled: false, status: 'ok' },
        { id: 'queue-depth', label: 'Queue depth <50', enabled: true, status: 'ok' },
        { id: 'error-rate', label: 'Error rate <5%', enabled: false, status: 'ok' },
        { id: 'token-rate', label: 'Token throughput', enabled: true, status: 'ok' },
      ],
    } as WatchdogStatus,
  };
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function Section({ title, count, defaultOpen = true, children }: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1 hover:bg-[#1a1a24] text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75] border-b border-[#2a2a35]/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="flex-1">{title}</span>
        {count !== undefined && (
          <span className="bg-[#1a1a24] px-1.5 rounded-full text-[9px]">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------
function PriorityBadge({ priority }: { priority: QueueItem['priority'] }) {
  const config = {
    P1: { color: '#ef4444', label: 'AARON' },
    P2: { color: '#f97316', label: 'ATLAS' },
    P3: { color: '#3b82f6', label: 'EXTERNAL' },
    P4: { color: '#6b6b75', label: 'BACKGROUND' },
  }[priority];
  return (
    <span className="text-[8px] px-1 py-0.5 rounded font-mono" style={{ backgroundColor: `${config.color}20`, color: config.color }}>
      {priority} {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LLMOrchestrationPanel — main export
// ---------------------------------------------------------------------------
export function LLMOrchestrationPanel() {
  const [data, setData] = useState(getMockData);
  const [indicatorDropdownOpen, setIndicatorDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [serverRes, statusRes] = await Promise.all([
          fetch('http://127.0.0.1:5044/health', { signal: AbortSignal.timeout(3000) }).catch(() => null),
          fetch('http://127.0.0.1:8029/api/llm/status', { signal: AbortSignal.timeout(3000) }).catch(() => null),
        ]);
        if (statusRes?.ok) {
          const json = await statusRes.json();
          setData((prev) => ({ ...prev, ...json }));
        }
        if (serverRes) {
          setData((prev) => ({
            ...prev,
            server: { ...prev.server, online: serverRes.ok },
          }));
        }
      } catch { /* keep mock */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleWatchdog = useCallback(async (watchdogId: string) => {
    setData((prev) => ({
      ...prev,
      watchdog: {
        ...prev.watchdog,
        watchdogs: prev.watchdog.watchdogs.map((w) =>
          w.id === watchdogId ? { ...w, enabled: !w.enabled } : w
        ),
      },
    }));
    try {
      await fetch('http://127.0.0.1:8029/api/llm/watchdog/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchdogId }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* ignore */ }
  }, []);

  const toggleIndicator = useCallback(async (indicatorId: string) => {
    setData((prev) => ({
      ...prev,
      watchdog: {
        ...prev.watchdog,
        indicators: prev.watchdog.indicators.map((ind) =>
          ind.id === indicatorId ? { ...ind, enabled: !ind.enabled } : ind
        ),
      },
    }));
    try {
      await fetch('http://127.0.0.1:8029/api/llm/watchdog/indicator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indicatorId }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* ignore */ }
  }, []);

  const { server, profiles, queue, metrics, watchdog } = data;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Cpu className="w-3.5 h-3.5 text-[#c678dd]" />
        <span className="text-xs font-medium text-[#e5e5e5]">LLM Orchestration</span>
        <Circle className="w-2.5 h-2.5 ml-auto" style={{
          color: server.online ? '#22c55e' : '#ef4444',
          fill: server.online ? '#22c55e' : '#ef4444',
        }} />
        <span className={`text-[10px] ${server.online ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
          {server.online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Server Status */}
        <Section title="Server">
          <div className="px-3 py-2 space-y-1.5 text-[10px]">
            <div className="flex items-center gap-2">
              <Brain className="w-3 h-3 text-[#c678dd]" />
              <span className="text-[#e5e5e5]">{server.model}</span>
              <span className="text-[#6b6b75] ml-auto">{server.modelSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3 text-[#3b82f6]" />
              <span className="text-[#6b6b75]">Port {server.port}</span>
              <span className="text-[#6b6b75] ml-auto">RSS: {server.rssGb.toFixed(1)} GB</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-[#22c55e]" />
              <span className="text-[#6b6b75]">Uptime: {server.uptime}</span>
              {metrics.thinkingEnabled && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c678dd]/15 text-[#c678dd] ml-auto">
                  {'<think>'} mode
                </span>
              )}
            </div>
          </div>
        </Section>

        {/* Inference Metrics */}
        <Section title="Inference">
          <div className="px-3 py-2 grid grid-cols-4 gap-2">
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#22c55e]">{metrics.tokensPerSec}</div>
              <div className="text-[9px] text-[#6b6b75]">tok/s</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#3b82f6]">{metrics.avgLatencyMs}ms</div>
              <div className="text-[9px] text-[#6b6b75]">latency</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#e5c07b]">{(metrics.cacheHitRate * 100).toFixed(0)}%</div>
              <div className="text-[9px] text-[#6b6b75]">cache</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#c678dd]">{metrics.totalRequests}</div>
              <div className="text-[9px] text-[#6b6b75]">total</div>
            </div>
          </div>
        </Section>

        {/* Profiles */}
        <Section title="Inference Profiles" count={profiles.length}>
          <div className="px-3 py-1 space-y-0.5">
            {profiles.map((p) => (
              <div key={p.name} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                <Thermometer className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
                <span className={p.active ? 'text-[#22c55e] font-medium' : 'text-[#e5e5e5]'}>{p.name}</span>
                <span className="text-[#6b6b75] ml-auto">T={p.temperature}</span>
                <span className="text-[#6b6b75]">{p.maxTokens}tok</span>
                {p.active && (
                  <span className="text-[8px] px-1 rounded bg-[#22c55e]/15 text-[#22c55e]">ACTIVE</span>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* Priority Queue */}
        <Section title="Priority Queue" count={queue.length}>
          <div className="px-3 py-1 space-y-0.5">
            {queue.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                {item.status === 'processing' ? (
                  <RefreshCw className="w-3 h-3 text-[#3b82f6] animate-spin flex-shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
                )}
                <PriorityBadge priority={item.priority} />
                <span className="text-[#e5e5e5] truncate flex-1">{item.label}</span>
                <span className="text-[#6b6b75]">{item.source}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Watchdog Controls */}
        <Section title="Watchdogs" count={watchdog.watchdogs.filter((w) => w.enabled).length}>
          <div className="px-3 py-2 space-y-1.5">
            {watchdog.watchdogs.map((w) => (
              <div key={w.id} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                <button
                  onClick={() => toggleWatchdog(w.id)}
                  className={`p-0.5 rounded transition-colors ${
                    w.enabled
                      ? 'text-[#22c55e] hover:bg-[#22c55e]/15'
                      : 'text-[#6b6b75] hover:bg-[#ef4444]/15'
                  }`}
                  title={w.enabled ? 'Disable watchdog' : 'Enable watchdog'}
                >
                  <Power className="w-3 h-3" />
                </button>
                <Shield className={`w-3 h-3 flex-shrink-0 ${w.enabled ? 'text-[#22c55e]' : 'text-[#6b6b75]'}`} />
                <span className={`flex-1 truncate ${w.enabled ? 'text-[#e5e5e5]' : 'text-[#6b6b75] line-through'}`}>
                  {w.name}
                </span>
                <span className="text-[#6b6b75]">{w.intervalSec}s</span>
                {w.enabled && (
                  <span className={`text-[9px] px-1 rounded ${
                    w.strikes > 0
                      ? 'bg-[#e5c07b]/15 text-[#e5c07b]'
                      : 'bg-[#22c55e]/15 text-[#22c55e]'
                  }`}>
                    {w.strikes}/{w.maxStrikes}
                  </span>
                )}
              </div>
            ))}

            {/* Summary row */}
            <div className="flex items-center gap-2 pt-1 text-[10px] text-[#6b6b75]">
              <Gauge className="w-3 h-3 text-[#3b82f6]" />
              <span>RSS ready: {watchdog.rssReady ? 'Yes (>2GB)' : 'No'}</span>
              <span className="ml-auto">Last: {Math.floor((Date.now() - watchdog.lastCheck) / 1000)}s ago</span>
            </div>
          </div>
        </Section>

        {/* Health Indicators */}
        <Section title="Health Indicators" count={watchdog.indicators.filter((i) => i.enabled).length}>
          <div className="px-3 py-2 space-y-1">
            <button
              onClick={() => setIndicatorDropdownOpen((v) => !v)}
              className="flex items-center gap-1.5 w-full text-[10px] px-2 py-1.5 rounded bg-[#1a1a24] border border-[#2a2a35] text-[#e5e5e5] hover:border-[#3b82f6]/50 transition-colors"
            >
              <Settings className="w-3 h-3 text-[#6b6b75]" />
              <span className="flex-1 text-left">
                {watchdog.indicators.filter((i) => i.enabled).length} of {watchdog.indicators.length} active
              </span>
              <ChevronDown className={`w-3 h-3 text-[#6b6b75] transition-transform ${indicatorDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {indicatorDropdownOpen && (
              <div className="border border-[#2a2a35] rounded bg-[#1a1a24] overflow-hidden">
                {watchdog.indicators.map((ind) => (
                  <button
                    key={ind.id}
                    onClick={() => toggleIndicator(ind.id)}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-[10px] hover:bg-[#2a2a35]/50 transition-colors"
                  >
                    {ind.enabled
                      ? <Eye className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
                      : <EyeOff className="w-3 h-3 text-[#6b6b75] flex-shrink-0" />
                    }
                    <span className={ind.enabled ? 'text-[#e5e5e5] flex-1' : 'text-[#6b6b75] flex-1'}>
                      {ind.label}
                    </span>
                    {ind.enabled && (
                      <span className={`text-[8px] px-1 rounded ${
                        ind.status === 'ok' ? 'bg-[#22c55e]/15 text-[#22c55e]'
                          : ind.status === 'warn' ? 'bg-[#e5c07b]/15 text-[#e5c07b]'
                          : 'bg-[#ef4444]/15 text-[#ef4444]'
                      }`}>
                        {ind.status.toUpperCase()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Cpu className="w-3 h-3" />
        <span>vllm-mlx · Qwen3-14B · Native {'<think>'} reasoning</span>
      </div>
    </div>
  );
}
