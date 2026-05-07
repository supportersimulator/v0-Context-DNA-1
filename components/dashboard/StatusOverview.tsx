'use client';

// =============================================================================
// StatusOverview — small horizontal pill bar (CC4 Phase-10, 2026-05-07).
//
// Renders six glanceable pills at the TOP of `DashboardShell`, above the
// existing 3-panel grid (SurgeonTheater | CampaignTheater | RaceTheater) and
// the second-row grid (TruthLadder | HumanArbiter):
//
//   1. Phase             — e.g. "Phase-10 closeout"
//   2. Cluster health    — emerald=ok / amber=degraded / rose=down / slate=?
//   3. Push-freeze       — amber when active (CI=$0), emerald when thawed
//   4. Commits ahead     — total + per-repo breakdown on hover
//   5. Invariants        — N/M PASS + last-run timestamp on hover
//   6. Panels live       — count from snapshot
//
// Read-only consumer. Polls /api/cluster/status every 30s (SSE-LITE — light
// polling against the snapshot route, not real SSE) and seeds from
// EMPTY_CLUSTER_STATUS so the bar renders six slate pills immediately —
// no spinner state.
//
// ZSF: every fetch failure increments `_status_overview_fetch_errors` on
// `window` so cardio sentinels can spot quiet breakage.
//
// Reversibility: pure presentational component, no global side-effects
// beyond the error counter; one `git revert` removes it cleanly.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  GitCommit,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  EMPTY_CLUSTER_STATUS,
  type ClusterPanelInfo,
  type ClusterPillTone,
  type ClusterStatus,
} from '@/lib/ide/cluster-status-types';
import { cn } from '@/lib/utils';

const STATUS_ENDPOINT = '/api/cluster/status';
const REFRESH_MS = 30000;
const ERROR_COUNTER_KEY = '_status_overview_fetch_errors';

function bumpErrorCounter(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[ERROR_COUNTER_KEY] = (w[ERROR_COUNTER_KEY] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Tone → Tailwind palette (single source of truth, mirrors TruthLadder).
// ---------------------------------------------------------------------------

function toneClasses(tone: ClusterPillTone): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'amber':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    case 'rose':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
    case 'violet':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-200';
    case 'slate':
    default:
      return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
  }
}

// ---------------------------------------------------------------------------
// Snapshot → ClusterPanelInfo[] derivation. Pure — easy to unit-test.
// ---------------------------------------------------------------------------

function fmtAge(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function fmtLastRun(iso: string | null): string {
  if (!iso) return 'unknown';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const age = (Date.now() - t) / 1000;
  if (age < 60) return `${Math.round(age)}s ago`;
  if (age < 3600) return `${(age / 60).toFixed(1)}m ago`;
  if (age < 86400) return `${(age / 3600).toFixed(1)}h ago`;
  return `${(age / 86400).toFixed(1)}d ago`;
}

export function deriveClusterPills(s: ClusterStatus): ClusterPanelInfo[] {
  // 1. Phase — informational, violet tone (no health colour).
  const phaseLabel = s.active_phase ?? 'Phase ?';

  // 2. Cluster health — tone driven by `state`.
  let healthTone: ClusterPillTone;
  switch (s.cluster_health.state) {
    case 'ok':
      healthTone = 'emerald';
      break;
    case 'degraded':
      healthTone = 'amber';
      break;
    case 'down':
      healthTone = 'rose';
      break;
    default:
      healthTone = 'slate';
  }
  const healthValue = s.cluster_health.state.toUpperCase();
  const healthTooltip = [
    `state: ${s.cluster_health.state}`,
    `nats subs: ${s.cluster_health.nats_subs ?? '—'}`,
    `js streams ok: ${s.cluster_health.js_streams_ok ?? '—'}`,
    `webhook age: ${fmtAge(s.cluster_health.webhook_last_age_s)}`,
    `cardio: ${s.cluster_health.surgeons.cardio}`,
    `neuro: ${s.cluster_health.surgeons.neuro}`,
  ].join(' • ');

  // 3. Push-freeze — amber when active, emerald when thawed.
  const freezeTone: ClusterPillTone = s.push_freeze.active ? 'amber' : 'emerald';
  const freezeValue = s.push_freeze.active ? 'FROZEN' : 'THAWED';
  const freezeTooltip = `push-freeze ${s.push_freeze.active ? 'ACTIVE — CI cost guard $0' : 'released — pushes allowed'} (source: ${s.push_freeze.source})`;

  // 4. Commits ahead — emerald at 0, amber when > 0.
  const totalAhead = s.commits_ahead.total ?? 0;
  const commitsTone: ClusterPillTone = totalAhead === 0 ? 'emerald' : 'amber';
  const commitsValue = String(totalAhead);
  const commitsTooltip = `super: ${s.commits_ahead.super ?? '—'} • mf: ${s.commits_ahead.mf ?? '—'} • admin: ${s.commits_ahead.admin ?? '—'}`;

  // 5. Invariants — emerald N/M (passed == total), amber on partial, slate ?/M.
  let invTone: ClusterPillTone;
  let invValue: string;
  if (s.invariants.passed === null) {
    invTone = 'slate';
    invValue = `?/${s.invariants.total}`;
  } else if (s.invariants.passed === s.invariants.total) {
    invTone = 'emerald';
    invValue = `${s.invariants.passed}/${s.invariants.total}`;
  } else {
    invTone = 'amber';
    invValue = `${s.invariants.passed}/${s.invariants.total}`;
  }
  const invTooltip = `last invariants run: ${fmtLastRun(s.invariants.last_run)}`;

  // 6. Panels live — informational, slate tone.
  const panelsValue = String(s.panels_live);

  return [
    {
      id: 'phase',
      label: 'Phase',
      value: phaseLabel,
      tooltip: `active sprint phase${s.generated_at ? ` • snapshot ${fmtLastRun(s.generated_at)}` : ''}`,
      tone: 'violet',
    },
    {
      id: 'cluster-health',
      label: 'Health',
      value: healthValue,
      tooltip: healthTooltip,
      tone: healthTone,
    },
    {
      id: 'push-freeze',
      label: 'Push',
      value: freezeValue,
      tooltip: freezeTooltip,
      tone: freezeTone,
    },
    {
      id: 'commits-ahead',
      label: 'Ahead',
      value: commitsValue,
      tooltip: commitsTooltip,
      tone: commitsTone,
    },
    {
      id: 'invariants',
      label: 'Inv',
      value: invValue,
      tooltip: invTooltip,
      tone: invTone,
    },
    {
      id: 'panels-live',
      label: 'Panels',
      value: panelsValue,
      tooltip: `${s.panels_live} IDE panels live`,
      tone: 'slate',
    },
  ];
}

function pillIcon(id: ClusterPanelInfo['id']) {
  switch (id) {
    case 'phase':
      return <Sparkles className="w-3 h-3" />;
    case 'cluster-health':
      return <Activity className="w-3 h-3" />;
    case 'push-freeze':
      return <Lock className="w-3 h-3" />;
    case 'commits-ahead':
      return <GitCommit className="w-3 h-3" />;
    case 'invariants':
      return <ShieldCheck className="w-3 h-3" />;
    case 'panels-live':
    default:
      return <Layers className="w-3 h-3" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusOverview() {
  const [snap, setSnap] = useState<ClusterStatus>(EMPTY_CLUSTER_STATUS);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(STATUS_ENDPOINT, { cache: 'no-store' });
      if (!r.ok) {
        bumpErrorCounter();
        return;
      }
      const data = (await r.json()) as ClusterStatus;
      if (cancelledRef.current) return;
      setSnap(data ?? EMPTY_CLUSTER_STATUS);
    } catch (err) {
      if (cancelledRef.current) return;
      bumpErrorCounter();
      // ZSF: failure observable via counter.
      console.warn('[StatusOverview] fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    const initial = window.setTimeout(load, 0);
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const pills = useMemo(() => deriveClusterPills(snap), [snap]);

  return (
    <div
      data-testid="status-overview"
      className="flex flex-wrap gap-3 px-4 py-3 border-b border-slate-700 bg-slate-900/50"
    >
      {pills.map((pill) => (
        <div
          key={pill.id}
          data-testid={`status-overview-pill-${pill.id}`}
          title={pill.tooltip}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none cursor-default select-none',
            toneClasses(pill.tone),
          )}
        >
          <span className="opacity-70 shrink-0">{pillIcon(pill.id)}</span>
          <span className="font-medium uppercase tracking-wide opacity-80">
            {pill.label}
          </span>
          <span className="font-mono tabular-nums truncate max-w-[180px]">
            {pill.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default StatusOverview;
