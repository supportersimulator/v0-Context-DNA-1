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
import { SurgeonPhaseDetail, type PhaseDetailData } from './SurgeonPhaseDetail';
import { SurgeonMetricsRibbon } from './SurgeonMetricsRibbon';

type PhaseId = 'probe' | 'cardio' | 'neuro' | 'consensus' | 'verdict';
type PhaseStatus = 'idle' | 'active' | 'done' | 'error';

interface PhaseState {
  id: PhaseId;
  status: PhaseStatus;
  surgeon?: string;
  model?: string;
  latencyMs?: number;
  preview?: string;
  systemPrompt?: string;
  userPrompt?: string;
  response?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  timestamp?: string;
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

function PhasePill({ p, dim, onClick }: { p: PhaseState; dim: boolean; onClick: () => void }) {
  const Icon = ICON[p.id];
  const { status } = p;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${LABEL[p.id]} phase detail`}
      className={cn(
        'flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 min-w-[124px] text-left',
        'transition-colors duration-300 font-mono',
        'hover:ring-1 hover:ring-amber-400/60 hover:bg-amber-400/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/80 cursor-pointer',
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
    </button>
  );
}

export function SurgeonTheater({ className }: { className?: string }) {
  const [phases, setPhases] = useState<Record<PhaseId, PhaseState>>(initial);
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [dis, setDis] = useState<{ topic?: string; cardio?: string; neuro?: string; severity?: string } | null>(null);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<PhaseId | null>(null);

  useIDEEvent('surgeon:phase', (d) => {
    setCount((n) => n + 1);
    if (!d?.phase) return;
    const extra = d as Record<string, unknown>;
    const num = (k: string): number | undefined => (typeof extra[k] === 'number' ? (extra[k] as number) : undefined);
    const str = (k: string): string | undefined => (typeof extra[k] === 'string' ? (extra[k] as string) : undefined);
    setPhases((prev) => ({
      ...prev,
      [d.phase]: {
        ...prev[d.phase],
        id: d.phase,
        status: d.status ?? 'active',
        surgeon: d.surgeon ?? prev[d.phase]?.surgeon,
        model: d.model ?? prev[d.phase]?.model,
        latencyMs: d.latency_ms ?? prev[d.phase]?.latencyMs,
        preview: d.preview ?? prev[d.phase]?.preview,
        systemPrompt: str('system_prompt') ?? prev[d.phase]?.systemPrompt,
        userPrompt: str('user_prompt') ?? prev[d.phase]?.userPrompt,
        response: str('response') ?? prev[d.phase]?.response,
        costUsd: num('cost_usd') ?? prev[d.phase]?.costUsd,
        tokensIn: num('tokens_in') ?? prev[d.phase]?.tokensIn,
        tokensOut: num('tokens_out') ?? prev[d.phase]?.tokensOut,
        timestamp: str('timestamp') ?? prev[d.phase]?.timestamp ?? new Date().toISOString(),
      },
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
            <PhasePill p={phases[id]} dim={allIdle} onClick={() => setSelected(id)} />
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

      <SurgeonMetricsRibbon className="mt-2 -mx-3 -mb-3 rounded-b-lg" />

      <SurgeonPhaseDetail
        data={selected ? buildDetail(phases[selected], verdicts) : null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function buildDetail(p: PhaseState, verdicts: Record<string, string>): PhaseDetailData {
  const cardio = verdicts.cardiologist ?? verdicts.cardio;
  const neuro = verdicts.neurologist ?? verdicts.neuro;
  const agreement = cardio && neuro ? (cardio === neuro ? 1 : 0) : undefined;
  return {
    phase: LABEL[p.id],
    status: p.status,
    surgeon: p.surgeon,
    model: p.model,
    latencyMs: p.latencyMs,
    preview: p.preview,
    systemPrompt: p.systemPrompt,
    userPrompt: p.userPrompt,
    response: p.response,
    cardioVerdict: cardio,
    neuroVerdict: neuro,
    agreementScore: agreement,
    costUsd: p.costUsd,
    tokensIn: p.tokensIn,
    tokensOut: p.tokensOut,
    timestamp: p.timestamp,
  };
}

export default SurgeonTheater;
