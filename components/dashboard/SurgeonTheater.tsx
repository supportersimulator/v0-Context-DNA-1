'use client';

// =============================================================================
// SurgeonTheater — Tier-1 phased timeline (Round-5 E2, 2026-05-04)
//
// Phase strip [Probe -> Cardio -> Neuro -> Consensus -> Verdict] for the live
// 3-surgeon cross-examination, fed by EventBridge SSE (Round-3 C2). Cardio !=
// Neuro verdict → red glow + DISAGREEMENT badge, surfacing the corrigibility
// moat as a first-class visible artifact. See vision-alignment-2026-04-26 §I1.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Brain, CheckCircle2, Heart, Search, Sparkles, XCircle,
} from 'lucide-react';
import { useIDEEvent } from '@/lib/ide/event-bus';
import { cn } from '@/lib/utils';

type PhaseId = 'probe' | 'cardio' | 'neuro' | 'consensus' | 'verdict';
type PhaseStatus = 'idle' | 'active' | 'done' | 'error';

interface PhaseState {
  id: PhaseId;
  status: PhaseStatus;
  surgeon?: string;
  model?: string;
  latencyMs?: number;
  preview?: string;
}

const PHASES: PhaseId[] = ['probe', 'cardio', 'neuro', 'consensus', 'verdict'];
const LABEL: Record<PhaseId, string> = {
  probe: 'Probe', cardio: 'Cardio', neuro: 'Neuro', consensus: 'Consensus', verdict: 'Verdict',
};
const ICON: Record<PhaseId, typeof Activity> = {
  probe: Search, cardio: Heart, neuro: Sparkles, consensus: Brain, verdict: CheckCircle2,
};
const ACCENT: Record<PhaseId, string> = {
  probe: 'text-zinc-300', cardio: 'text-rose-400', neuro: 'text-fuchsia-400',
  consensus: 'text-sky-400', verdict: 'text-emerald-400',
};

const initial = (): Record<PhaseId, PhaseState> =>
  PHASES.reduce((a, id) => { a[id] = { id, status: 'idle' }; return a; }, {} as Record<PhaseId, PhaseState>);

function PhasePill({ p, dim }: { p: PhaseState; dim: boolean }) {
  const Icon = ICON[p.id];
  const { status } = p;
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 min-w-[124px]',
        'transition-colors duration-300 font-mono',
        dim && 'opacity-50',
        status === 'error' ? 'border-rose-500/60 bg-rose-500/10'
          : status === 'done' ? 'border-emerald-500/40 bg-emerald-500/5'
          : status === 'active' ? 'border-amber-500/60 bg-amber-500/10 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
          : 'border-border/60 bg-background/30',
      )}
      title={p.preview ?? LABEL[p.id]}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1">
          <Icon className={cn('w-3 h-3', ACCENT[p.id], status === 'active' && 'animate-pulse')} />
          <span className="text-[11px] font-semibold tracking-wide">{LABEL[p.id]}</span>
        </span>
        {status === 'error' ? <XCircle className="w-3 h-3 text-rose-400" />
          : status === 'done' ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          : status === 'active' ? <span className="text-[9px] uppercase text-amber-300">thinking…</span>
          : <span className="text-[9px] uppercase text-muted-foreground">idle</span>}
      </div>
      <div className="text-[10px] text-muted-foreground truncate">
        {p.model ?? p.surgeon ?? '—'}
        {p.latencyMs != null && <span className="ml-1 tabular-nums">{p.latencyMs}ms</span>}
      </div>
      {p.preview && <div className="text-[10px] text-foreground/80 truncate">{p.preview}</div>}
    </div>
  );
}

export function SurgeonTheater({ className }: { className?: string }) {
  const [phases, setPhases] = useState<Record<PhaseId, PhaseState>>(initial);
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [dis, setDis] = useState<{ topic?: string; cardio?: string; neuro?: string; severity?: string } | null>(null);
  const [count, setCount] = useState(0);

  useIDEEvent('surgeon:phase', (d) => {
    setCount((n) => n + 1);
    if (!d?.phase) return;
    setPhases((prev) => ({
      ...prev,
      [d.phase]: { id: d.phase, status: d.status ?? 'active', surgeon: d.surgeon, model: d.model, latencyMs: d.latency_ms, preview: d.preview },
    }));
  });

  useIDEEvent('surgeon:verdict', (d) => {
    setCount((n) => n + 1);
    if (!d?.surgeon || !d?.verdict) return;
    setVerdicts((prev) => ({ ...prev, [d.surgeon]: d.verdict }));
  });

  useIDEEvent('surgeon:disagreement', (d) => {
    setCount((n) => n + 1);
    setDis({ topic: d?.topic, cardio: d?.cardio, neuro: d?.neuro, severity: d?.severity });
  });

  const derived = useMemo(() => {
    const c = verdicts.cardiologist ?? verdicts.cardio;
    const n = verdicts.neurologist ?? verdicts.neuro;
    return c && n && c !== n ? { topic: 'verdict mismatch', cardio: c, neuro: n, severity: 'high' } : null;
  }, [verdicts]);

  const active = dis ?? derived;

  useEffect(() => {
    if (!dis) return;
    const t = setTimeout(() => setDis(null), 30_000);
    return () => clearTimeout(t);
  }, [dis]);

  const allIdle = PHASES.every((id) => phases[id].status === 'idle');

  return (
    <div
      data-testid="surgeon-theater"
      className={cn(
        'rounded-lg border bg-background/40 p-3 transition-colors',
        active ? 'border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.4)]' : 'border-border/60',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-xs font-semibold tracking-wide uppercase">Surgeon Theater</h3>
          <span className="text-[10px] text-muted-foreground" title="Disagreements ARE the feature">
            cross-examination · {count} events
          </span>
        </div>
        {active && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-200 border border-rose-500/50 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Disagreement
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {PHASES.map((id, i) => (
          <div key={id} className="flex items-center gap-1.5 shrink-0">
            <PhasePill p={phases[id]} dim={allIdle} />
            {i < PHASES.length - 1 && <span className="text-muted-foreground/60 text-xs">→</span>}
          </div>
        ))}
      </div>

      {active && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-mono">
          <div className="rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wider text-rose-300/70 mb-0.5">Cardio</div>
            <div className="text-rose-100 leading-snug break-words">{active.cardio ?? '—'}</div>
          </div>
          <div className="rounded border border-fuchsia-500/30 bg-fuchsia-500/5 px-2 py-1">
            <div className="text-[9px] uppercase tracking-wider text-fuchsia-300/70 mb-0.5">Neuro</div>
            <div className="text-fuchsia-100 leading-snug break-words">{active.neuro ?? '—'}</div>
          </div>
          {active.topic && (
            <div className="col-span-2 text-[10px] text-muted-foreground italic">
              topic: {active.topic}{active.severity && ` · severity: ${active.severity}`}
            </div>
          )}
        </div>
      )}

      {allIdle && !active && (
        <div className="mt-2 text-[10px] text-muted-foreground italic">
          Awaiting first cross-examination event.
        </div>
      )}
    </div>
  );
}

export default SurgeonTheater;
