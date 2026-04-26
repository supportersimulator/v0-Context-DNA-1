'use client';

// =============================================================================
// CorrigibilityGaugePanel — visualize the highest-weight pillar (P1).
//
// Wraps multifleet/theatrical/corrigibility_gauge.py. Renders the score as
// a semicircular gauge with a sparkline trend, the three contributing
// factors, decision-change stats, and a dissent ticker. Updates on every
// fresh frame so the gauge needle visibly advances during a demo.
//
// Vision: docs/vision-alignment-2026-04-26.md P1 ("Corrigibility is the
// highest weight … CorrigibilityGate verdicts not surfaced in admin IDE.")
// This panel surfaces them.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Shield, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  useTheatricalData,
  type CorrigibilityGaugeSnapshot,
  type CorrigibilityTrendPoint,
  type SurgeonDisagreement,
} from '@/lib/hooks/use-theatrical-data';

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp01(v: number | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function scoreLabel(score: number): { label: string; color: string; ring: string } {
  if (score >= 0.8) return { label: 'High', color: 'text-emerald-400', ring: 'ring-emerald-500/40' };
  if (score >= 0.6) return { label: 'Moderate', color: 'text-amber-400', ring: 'ring-amber-500/40' };
  if (score >= 0.4) return { label: 'Low', color: 'text-orange-400', ring: 'ring-orange-500/40' };
  return { label: 'Critical', color: 'text-rose-400', ring: 'ring-rose-500/40' };
}

function gaugeStrokeColor(score: number): string {
  if (score >= 0.8) return '#22c55e';
  if (score >= 0.6) return '#eab308';
  if (score >= 0.4) return '#f97316';
  return '#ef4444';
}

function trendDirection(trend: CorrigibilityTrendPoint[]): 'up' | 'down' | 'flat' {
  if (trend.length < 2) return 'flat';
  const head = trend[0]?.score ?? 0;
  const tail = trend[trend.length - 1]?.score ?? 0;
  const delta = tail - head;
  if (delta > 0.02) return 'up';
  if (delta < -0.02) return 'down';
  return 'flat';
}

function formatRelativeTime(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  const diffS = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86_400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86_400)}d ago`;
}

// ─── Sparkline ──────────────────────────────────────────────────────────────

function TrendSparkline({ trend }: { trend: CorrigibilityTrendPoint[] }) {
  if (!trend.length) {
    return <div className="text-[10px] text-zinc-500">no trend yet</div>;
  }

  const W = 220;
  const H = 36;
  const xs = trend.map((p, i) => (i / Math.max(1, trend.length - 1)) * W);
  const ys = trend.map((p) => H - clamp01(p.score) * H);
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-9" aria-label="corrigibility trend">
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r="1" fill="#3b82f6" />
      ))}
    </svg>
  );
}

// ─── Gauge SVG ──────────────────────────────────────────────────────────────

function GaugeArc({ score, animate }: { score: number; animate: boolean }) {
  // Animate the displayed value smoothly toward the target score using a ref
  // to track the last-rendered position (avoids cascading-render lint).
  const [display, setDisplay] = useState<number>(score);
  const lastDisplayRef = useRef<number>(score);

  // Track the displayed value without triggering renders.
  useEffect(() => {
    lastDisplayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (!animate) return undefined;
    let raf = 0;
    const start = performance.now();
    const from = lastDisplayRef.current;
    const to = score;
    const duration = 600;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score, animate]);

  const safe = clamp01(animate ? display : score);
  const angle = 180 - safe * 180;
  const rad = (angle * Math.PI) / 180;
  const endX = 100 + 70 * Math.cos(rad);
  const endY = 100 - 70 * Math.sin(rad);
  const stroke = gaugeStrokeColor(safe);
  const sweep = safe > 0.5 ? 1 : 0;

  return (
    <svg viewBox="0 0 200 120" className="w-full max-h-32" aria-label="corrigibility gauge">
      <path
        d="M 30 100 A 70 70 0 0 1 170 100"
        fill="none"
        stroke="#27272a"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={`M 30 100 A 70 70 0 ${sweep} 1 ${endX.toFixed(1)} ${endY.toFixed(1)}`}
        fill="none"
        stroke={stroke}
        strokeWidth="12"
        strokeLinecap="round"
      />
      <line
        x1="100"
        y1="100"
        x2={endX.toFixed(1)}
        y2={endY.toFixed(1)}
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="100" cy="100" r="4" fill={stroke} />
      <text
        x="100"
        y="76"
        textAnchor="middle"
        fontSize="22"
        fontWeight="600"
        fill={stroke}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {(safe * 100).toFixed(0)}
      </text>
    </svg>
  );
}

// ─── Factor bar ─────────────────────────────────────────────────────────────

function FactorBar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const safe = clamp01(value);
  return (
    <div className="space-y-0.5" title={hint}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-zinc-300 font-medium">{label}</span>
        <span className="text-zinc-400 font-mono">{(safe * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded bg-sky-500 transition-all duration-500"
          style={{ width: `${safe * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── Disagreement mini-row ──────────────────────────────────────────────────

function DisagreementMini({ d }: { d: SurgeonDisagreement }) {
  const blocked = d.resolution === 'blocked';
  return (
    <div
      className={cn(
        'rounded border px-2 py-1 text-[10px]',
        blocked
          ? 'border-rose-500/40 bg-rose-500/5 text-rose-200'
          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 truncate">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate font-medium">{d.topic ?? 'untitled'}</span>
        </span>
        <span className="opacity-70 shrink-0">{formatRelativeTime(d.ts)}</span>
      </div>
      <div className="mt-0.5 truncate font-mono opacity-80">
        A: {d.surgeon_a_position ?? '—'} · B: {d.surgeon_b_position ?? '—'}
      </div>
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function CorrigibilityGaugePanel() {
  const { data, transport, tick, ageMs, error, isLoading } = useTheatricalData();
  const gauge: CorrigibilityGaugeSnapshot | undefined = data?.components?.corrigibility_gauge;

  const score = clamp01(gauge?.score);
  const { label, color, ring } = scoreLabel(score);
  const factors = gauge?.factors ?? {};
  const stats = gauge?.stats ?? {};
  const rawTrend = gauge?.trend;
  const trend = useMemo(() => rawTrend ?? [], [rawTrend]);
  const dir = useMemo(() => trendDirection(trend), [trend]);
  const recent = gauge?.recent_disagreements ?? [];

  const TrendIcon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  const trendColor =
    dir === 'up' ? 'text-emerald-400' : dir === 'down' ? 'text-rose-400' : 'text-zinc-400';

  const transportLabel =
    transport === 'sse' ? 'live · SSE' : transport === 'poll' ? 'live · poll' : 'idle';

  return (
    <div className="h-full overflow-auto bg-zinc-950/40 text-zinc-100">
      <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className={cn('h-3.5 w-3.5', color)} />
          <h2 className="text-sm font-semibold">Corrigibility</h2>
          <span
            className={cn(
              'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1',
              ring,
              color,
            )}
          >
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span
            className={cn(
              'px-1.5 py-0.5 rounded',
              transport === 'idle'
                ? 'bg-zinc-800 text-zinc-400'
                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
            )}
            title={ageMs == null ? '—' : `last frame ${Math.round(ageMs / 1000)}s ago`}
          >
            {transportLabel}
          </span>
          <span>tick {tick}</span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
            Daemon: {error}
          </div>
        )}

        {isLoading && !error && (
          <div className="text-[11px] text-zinc-500">Awaiting first frame…</div>
        )}

        {/* Gauge */}
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
          <GaugeArc score={score} animate={tick > 0} />
          <div className="flex items-center justify-between mt-1">
            <div className="text-[10px] text-zinc-500">
              last check{' '}
              <span className="font-mono text-zinc-400">
                {formatRelativeTime(gauge?.last_check)}
              </span>
            </div>
            <div className={cn('flex items-center gap-1 text-[10px]', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              <span>{dir}</span>
            </div>
          </div>
          <div className="mt-1">
            <TrendSparkline trend={trend} />
          </div>
        </div>

        {/* Factors */}
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">
            Factors
          </div>
          <FactorBar
            label="Gate pass rate"
            value={factors.gate_pass_rate ?? 0}
            hint="Fraction of CorrigibilityGate runs that passed"
          />
          <FactorBar
            label="Surgeon influence"
            value={factors.surgeon_influence ?? 0}
            hint="Fraction of decisions where surgeons changed the plan"
          />
          <FactorBar
            label="Disagreement resolution"
            value={factors.disagreement_resolution ?? 0}
            hint="Fraction of dissent that reached a resolution"
          />
        </div>

        {/* Decisions stats */}
        <div className="rounded border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
            Decisions
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-base font-semibold font-mono">
                {stats.total_decisions ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500">total</div>
            </div>
            <div>
              <div className="text-base font-semibold font-mono text-amber-300">
                {stats.changed_by_surgeon ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500">changed</div>
            </div>
            <div>
              <div className="text-base font-semibold font-mono text-rose-300">
                {stats.total_disagreements ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500">dissent</div>
            </div>
          </div>
        </div>

        {/* Recent disagreements */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
            Recent dissent
          </div>
          {recent.length === 0 ? (
            <div className="text-[11px] text-zinc-500">No recent disagreements.</div>
          ) : (
            <div className="space-y-1">
              {recent.slice(0, 5).map((d, i) => (
                <DisagreementMini key={d.id ?? `${d.ts}-${i}`} d={d} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
