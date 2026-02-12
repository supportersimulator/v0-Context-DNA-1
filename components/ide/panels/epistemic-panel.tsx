'use client';

import { useState, useEffect } from 'react';
import {
  FlaskConical,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Scale,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  BarChart3,
  Eye,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EvidenceFunnel {
  quarantine: number;
  claims: number;
  outcomes: number;
  promotions: number;
  appliedWisdom: number;
}

interface SOPReliability {
  title: string;
  reliability: number;
  sampleSize: number;
  effectSize: number;
  lastUsed: number;
}

interface HindsightStatus {
  pendingWins: number;
  verified: number;
  suspect: number;
  miswirings: number;
  lastRun: number;
}

interface EpistemicWeights {
  corrigibility: number;
  outcomeGrounding: number;
  minimalAuthority: number;
  transparentReasoning: number;
  safetyFirst: number;
  reversibility: number;
}

interface NegativeSignal {
  source: string;
  message: string;
  reward: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockData() {
  return {
    funnel: { quarantine: 12, claims: 2, outcomes: 57, promotions: 4, appliedWisdom: 2 } as EvidenceFunnel,
    sops: [
      { title: 'FD exhaustion repair SOP', reliability: 0.95, sampleSize: 8, effectSize: 0.82, lastUsed: Date.now() - 3600000 },
      { title: 'SQLite WAL checkpoint', reliability: 0.88, sampleSize: 12, effectSize: 0.45, lastUsed: Date.now() - 7200000 },
      { title: 'Docker env reload', reliability: 0.92, sampleSize: 6, effectSize: 0.71, lastUsed: Date.now() - 14400000 },
      { title: 'IPv6 → 127.0.0.1 fix', reliability: 0.97, sampleSize: 15, effectSize: 0.93, lastUsed: Date.now() - 86400000 },
    ] as SOPReliability[],
    hindsight: { pendingWins: 115, verified: 95, suspect: 7, miswirings: 1, lastRun: Date.now() - 600000 } as HindsightStatus,
    weights: { corrigibility: 0.22, outcomeGrounding: 0.18, minimalAuthority: 0.16, transparentReasoning: 0.15, safetyFirst: 0.15, reversibility: 0.14 } as EpistemicWeights,
    negativeSignals: [
      { source: 'hindsight_validator', message: 'Miswiring: session_historian called record_quarantine()', reward: -0.3, timestamp: Date.now() - 1800000 },
      { source: 'scheduler', message: 'Job failure: failure_pattern_analysis', reward: -0.3, timestamp: Date.now() - 3600000 },
      { source: 'mmotw_miner', message: 'Dead import: objective_success_detector', reward: -0.3, timestamp: Date.now() - 7200000 },
    ] as NegativeSignal[],
  };
}

// ---------------------------------------------------------------------------
// Section component
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
// Funnel bar
// ---------------------------------------------------------------------------
function FunnelBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-24 text-[#6b6b75] text-right">{label}</span>
      <div className="flex-1 h-3 bg-[#1a1a24] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-8 text-right font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EpistemicPanel — main export
// ---------------------------------------------------------------------------
export function EpistemicPanel() {
  const [data, setData] = useState(getMockData);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/evidence/epistemic', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.funnel) setData(json);
        }
      } catch { /* keep mock */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const { funnel, sops, hindsight, weights, negativeSignals } = data;
  const maxFunnel = Math.max(funnel.quarantine, funnel.claims, funnel.outcomes, funnel.promotions, funnel.appliedWisdom, 1);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <FlaskConical className="w-3.5 h-3.5 text-[#c678dd]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Epistemic Sustainability</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Evidence Funnel */}
        <Section title="Evidence Funnel">
          <div className="px-3 py-2 space-y-1.5">
            <FunnelBar label="Quarantine" value={funnel.quarantine} max={maxFunnel} color="#e5c07b" />
            <FunnelBar label="Claims" value={funnel.claims} max={maxFunnel} color="#3b82f6" />
            <FunnelBar label="Outcomes" value={funnel.outcomes} max={maxFunnel} color="#22c55e" />
            <FunnelBar label="Promotions" value={funnel.promotions} max={maxFunnel} color="#c678dd" />
            <FunnelBar label="Applied" value={funnel.appliedWisdom} max={maxFunnel} color="#06b6d4" />
          </div>
        </Section>

        {/* Promotion Thresholds */}
        <Section title="Promotion Thresholds">
          <div className="px-3 py-2 space-y-2">
            {[
              { label: 'Sample size (n≥30)', current: Math.max(...sops.map((s) => s.sampleSize)), target: 30 },
              { label: 'Effect size (≥0.05)', current: Math.max(...sops.map((s) => s.effectSize)), target: 1.0 },
              { label: 'Confidence (≥0.7)', current: Math.max(...sops.map((s) => s.reliability)), target: 1.0 },
            ].map((t) => (
              <div key={t.label} className="text-[10px]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[#6b6b75]">{t.label}</span>
                  <span className="text-[#e5e5e5] font-mono">{t.current.toFixed(2)}</span>
                </div>
                <div className="h-1.5 bg-[#1a1a24] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#22c55e]"
                    style={{ width: `${Math.min(100, (t.current / t.target) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* SOP Reliability */}
        <Section title="SOP Reliability" count={sops.length}>
          <div className="px-3 py-1 space-y-0.5">
            {sops.sort((a, b) => b.reliability - a.reliability).map((sop) => (
              <div key={sop.title} className="flex items-center gap-2 py-1 text-[10px] hover:bg-[#1a1a24]/50 px-1 rounded">
                <ShieldCheck className="w-3 h-3 flex-shrink-0" style={{
                  color: sop.reliability >= 0.9 ? '#22c55e' : sop.reliability >= 0.7 ? '#e5c07b' : '#ef4444',
                }} />
                <span className="text-[#e5e5e5] truncate flex-1">{sop.title}</span>
                <span className="font-mono" style={{
                  color: sop.reliability >= 0.9 ? '#22c55e' : sop.reliability >= 0.7 ? '#e5c07b' : '#ef4444',
                }}>{(sop.reliability * 100).toFixed(0)}%</span>
                <span className="text-[#6b6b75]">n={sop.sampleSize}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Epistemic Weights */}
        <Section title="Epistemic Weights" defaultOpen={false}>
          <div className="px-3 py-2 space-y-1">
            {Object.entries(weights).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-[10px]">
                <span className="w-32 text-[#6b6b75] capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <div className="flex-1 h-2 bg-[#1a1a24] rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-[#c678dd]" style={{ width: `${value * 100 / 0.22 * 100 / 100}%` }} />
                </div>
                <span className="text-[#c678dd] font-mono w-8 text-right">{value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Hindsight Validator */}
        <Section title="Hindsight Validator">
          <div className="px-3 py-2 grid grid-cols-4 gap-2">
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#3b82f6]">{hindsight.pendingWins}</div>
              <div className="text-[9px] text-[#6b6b75]">pending</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#22c55e]">{hindsight.verified}</div>
              <div className="text-[9px] text-[#6b6b75]">verified</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#e5c07b]">{hindsight.suspect}</div>
              <div className="text-[9px] text-[#6b6b75]">suspect</div>
            </div>
            <div className="text-center p-1.5 rounded bg-[#1a1a24]">
              <div className="text-sm font-mono text-[#ef4444]">{hindsight.miswirings}</div>
              <div className="text-[9px] text-[#6b6b75]">miswire</div>
            </div>
          </div>
        </Section>

        {/* Negative Signals */}
        <Section title="Negative Signals" count={negativeSignals.length} defaultOpen={false}>
          <div className="px-3 py-1 space-y-1">
            {negativeSignals.map((sig, i) => (
              <div key={i} className="text-[10px] py-1 border-b border-[#2a2a35]/30 last:border-0">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-[#ef4444] flex-shrink-0" />
                  <span className="text-[#6b6b75]">{sig.source}</span>
                  <span className="text-[#ef4444] ml-auto font-mono">r={sig.reward}</span>
                </div>
                <div className="text-[#e5e5e5]/70 mt-0.5 pl-4">{sig.message}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Scale className="w-3 h-3" />
        <span>Corrigibility {'>'} Authority — nothing becomes wisdom without measured outcomes</span>
      </div>
    </div>
  );
}
