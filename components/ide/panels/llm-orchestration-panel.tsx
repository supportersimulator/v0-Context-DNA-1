'use client';

import { useState, useEffect } from 'react';
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

interface WatchdogStatus {
  intervalSec: number;
  strikes: number;
  maxStrikes: number;
  lastCheck: number;
  rssReady: boolean;
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
    watchdog: { intervalSec: 60, strikes: 0, maxStrikes: 3, lastCheck: Date.now() - 15000, rssReady: true } as WatchdogStatus,
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

        {/* Watchdog */}
        <Section title="Watchdog" defaultOpen={false}>
          <div className="px-3 py-2 space-y-1.5 text-[10px]">
            <div className="flex items-center gap-2">
              <Shield className="w-3 h-3 text-[#22c55e]" />
              <span className="text-[#6b6b75]">Check interval: {watchdog.intervalSec}s</span>
            </div>
            <div className="flex items-center gap-2">
              {watchdog.strikes > 0
                ? <AlertTriangle className="w-3 h-3 text-[#e5c07b]" />
                : <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
              }
              <span className="text-[#6b6b75]">Strikes: {watchdog.strikes}/{watchdog.maxStrikes}</span>
            </div>
            <div className="flex items-center gap-2">
              <Gauge className="w-3 h-3 text-[#3b82f6]" />
              <span className="text-[#6b6b75]">RSS ready: {watchdog.rssReady ? 'Yes (>2GB)' : 'No'}</span>
            </div>
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
