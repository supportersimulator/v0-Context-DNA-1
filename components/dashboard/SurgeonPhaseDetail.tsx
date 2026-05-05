'use client';

// SurgeonPhaseDetail — Tier-2 drill-down (Round-6 F1, 2026-05-04).
// Slide-out panel: transcript + consensus delta + cost. Esc / X / backdrop close.

import { useEffect } from 'react';
import { X, AlertTriangle, Clock, Coins, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PhaseDetailData {
  phase: string;
  status?: string;
  surgeon?: string;
  model?: string;
  latencyMs?: number;
  preview?: string;
  systemPrompt?: string;
  userPrompt?: string;
  response?: string;
  cardioVerdict?: string;
  neuroVerdict?: string;
  agreementScore?: number;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
  timestamp?: string;
}

interface Props {
  data: PhaseDetailData | null;
  onClose: () => void;
}

const fmtUsd = (n?: number) => (n == null ? '—' : `$${n.toFixed(4)}`);

const Row = ({ label, value, mono = true }: { label: string; value?: string | number; mono?: boolean }) => (
  <div className="flex items-baseline gap-2 text-[11px]">
    <span className="text-[9px] uppercase tracking-wider text-muted-foreground w-20 shrink-0">{label}</span>
    <span className={cn('text-foreground/90 break-words', mono && 'font-mono tabular-nums')}>{value ?? '—'}</span>
  </div>
);

const Block = ({ title, body, accent }: { title: string; body?: string; accent: string }) => (
  <div className={cn('rounded border px-2 py-1.5', accent)}>
    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
    <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words font-mono text-foreground/85">
      {body && body.trim().length ? body : '—'}
    </pre>
  </div>
);

export function SurgeonPhaseDetail({ data, onClose }: Props) {
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, onClose]);

  const open = !!data;
  const disagreement =
    data?.cardioVerdict && data?.neuroVerdict && data.cardioVerdict !== data.neuroVerdict;

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Surgeon phase detail"
        data-testid="surgeon-phase-detail"
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-full sm:w-[440px] md:w-[520px]',
          'bg-background border-l border-border/80 shadow-2xl',
          'flex flex-col transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between px-3 py-2 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide">
              Phase · {data?.phase ?? '—'}
            </h3>
            {disagreement && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-500/20 text-rose-200 border border-rose-500/50">
                <AlertTriangle className="w-2.5 h-2.5" /> Disagree
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <section className="space-y-1">
            <Row label="Surgeon" value={data?.surgeon} />
            <Row label="Model" value={data?.model} />
            <Row label="Status" value={data?.status} />
            <Row label="Timestamp" value={data?.timestamp} mono={false} />
          </section>

          <section className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
            {([
              [Clock, 'Latency', data?.latencyMs != null ? `${data.latencyMs}ms` : '—'],
              [Coins, 'Cost', fmtUsd(data?.costUsd)],
              [Cpu, 'Tokens', `${data?.tokensIn ?? '—'} / ${data?.tokensOut ?? '—'}`],
            ] as const).map(([Icon, lbl, val]) => (
              <div key={lbl} className="rounded border border-border/60 bg-background/40 px-2 py-1.5">
                <div className="flex items-center gap-1 text-muted-foreground text-[9px] uppercase mb-0.5">
                  <Icon className="w-2.5 h-2.5" /> {lbl}
                </div>
                <div className="tabular-nums">{val}</div>
              </div>
            ))}
          </section>

          <section
            className={cn(
              'rounded border px-2 py-1.5 space-y-1',
              disagreement ? 'border-rose-500/40 bg-rose-500/5' : 'border-border/60 bg-background/40',
            )}
          >
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Consensus delta</div>
            <Row label="Cardio" value={data?.cardioVerdict} />
            <Row label="Neuro" value={data?.neuroVerdict} />
            <Row label="Agreement" value={data?.agreementScore != null ? data.agreementScore.toFixed(2) : undefined} />
          </section>

          <Block title="System prompt" body={data?.systemPrompt} accent="border-zinc-500/30 bg-zinc-500/5" />
          <Block title="User prompt" body={data?.userPrompt} accent="border-sky-500/30 bg-sky-500/5" />
          <Block title="Response" body={data?.response ?? data?.preview} accent="border-emerald-500/30 bg-emerald-500/5" />
        </div>
      </aside>
    </>
  );
}

export default SurgeonPhaseDetail;
