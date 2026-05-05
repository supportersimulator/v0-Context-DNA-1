'use client';

// =============================================================================
// SurgeonMetricsRibbon — Tier-3 rolling-stats ribbon (Round-7 G4, 2026-05-04)
//
// Bottom-of-theater bar showing rolling 24h cross-exam stats. Subscribes to
// surgeon:verdict events; pairs cardio+neuro verdicts per case_id to compute
// agreement rate. Persists to localStorage (24h sliding window). Disagreements
// ARE the feature → red badge surfaces the corrigibility moat.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, CheckCheck, Clock, DollarSign } from 'lucide-react';
import { useIDEEvent } from '@/lib/ide/event-bus';
import { cn } from '@/lib/utils';

interface VerdictRecord {
  ts: number;
  caseId?: string;
  surgeon: string;
  verdict: string;
  costUsd?: number;
  latencyMs?: number;
}

const STORAGE_KEY = 'surgeon_metrics_24h';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

function loadInitial(): VerdictRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const arr = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as VerdictRecord[];
    const cutoff = Date.now() - WINDOW_MS;
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.ts === 'number' && r.ts >= cutoff) : [];
  } catch { return []; }
}

function persist(records: VerdictRecord[]) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
}

export function SurgeonMetricsRibbon({ className }: { className?: string }) {
  const [records, setRecords] = useState<VerdictRecord[]>(() => loadInitial());

  useIDEEvent('surgeon:verdict', (d) => {
    if (!d?.surgeon || !d?.verdict) return;
    const extra = d as Record<string, unknown>;
    const rec: VerdictRecord = {
      ts: Date.now(),
      caseId: typeof d.case_id === 'string' ? d.case_id : undefined,
      surgeon: d.surgeon, verdict: d.verdict,
      costUsd: num(extra.cost_usd), latencyMs: num(extra.latency_ms),
    };
    setRecords((prev) => {
      const cutoff = Date.now() - WINDOW_MS;
      const next = [...prev.filter((r) => r.ts >= cutoff), rec];
      persist(next);
      return next;
    });
  });

  // Periodic eviction so stats stay fresh even when idle.
  useEffect(() => {
    const t = setInterval(() => setRecords((prev) => {
      const cutoff = Date.now() - WINDOW_MS;
      const filtered = prev.filter((r) => r.ts >= cutoff);
      if (filtered.length === prev.length) return prev;
      persist(filtered);
      return filtered;
    }), 60_000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const total = records.length;
    const lats = records.map((r) => r.latencyMs).filter((v): v is number => typeof v === 'number');
    const avgLatencyMs = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
    const totalCostUsd = records.reduce((a, r) => a + (r.costUsd ?? 0), 0);
    const byCase = new Map<string, { cardio?: string; neuro?: string }>();
    for (const r of records) {
      if (!r.caseId) continue;
      const slot = byCase.get(r.caseId) ?? {};
      const role = r.surgeon.toLowerCase();
      if (role.startsWith('cardio')) slot.cardio = r.verdict;
      else if (role.startsWith('neuro')) slot.neuro = r.verdict;
      byCase.set(r.caseId, slot);
    }
    let agree = 0, disagree = 0;
    byCase.forEach(({ cardio, neuro }) => { if (cardio && neuro) (cardio === neuro ? agree++ : disagree++); });
    const paired = agree + disagree;
    return {
      total, avgLatencyMs, totalCostUsd,
      agreementPct: paired ? Math.round((agree / paired) * 100) : null,
      disagreementCount: disagree,
    };
  }, [records]);

  return (
    <div
      data-testid="surgeon-metrics-ribbon"
      className={cn('flex items-center gap-4 px-4 py-2 border-t border-border/60 text-xs text-muted-foreground font-mono', className)}
    >
      <span className="flex items-center gap-1" title="Cross-exams in last 24h">
        <BarChart3 className="w-3 h-3 text-emerald-400" />
        <span className="tabular-nums text-foreground/80">{stats.total}</span> cross-exams
      </span>
      <span className="flex items-center gap-1" title="Average latency">
        <Clock className="w-3 h-3 text-sky-400" />
        <span className="tabular-nums text-foreground/80">{stats.avgLatencyMs}ms</span> avg
      </span>
      <span className="flex items-center gap-1" title="Total cost (USD)">
        <DollarSign className="w-3 h-3 text-amber-400" />
        <span className="tabular-nums text-foreground/80">${stats.totalCostUsd.toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-1" title="Cardio = Neuro verdict rate">
        <CheckCheck className="w-3 h-3 text-fuchsia-400" />
        <span className="tabular-nums text-foreground/80">{stats.agreementPct == null ? '—' : `${stats.agreementPct}%`}</span> agree
      </span>
      {stats.disagreementCount > 0 && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-200" title="Cardio vs Neuro verdict mismatches">
          <AlertCircle className="w-3 h-3" />
          <span className="tabular-nums font-semibold">{stats.disagreementCount}</span> disagreements
        </span>
      )}
    </div>
  );
}

export default SurgeonMetricsRibbon;
