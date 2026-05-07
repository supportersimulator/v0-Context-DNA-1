'use client';

// =============================================================================
// CampaignTheater — IDE panel for the v6 Competition Research Director
// (Round-X / Phase-1 sprint, 2026-05-04, S3)
//
// Sister panel to SurgeonTheater. Where SurgeonTheater renders the LIVE
// 3-surgeon cross-examination phase strip, CampaignTheater renders the LIVE
// state of an active Kaggle/competition campaign:
//
//   ┌─ Header: competition name · platform · metric · last refresh ──────────┐
//   ├─ Metric grid: top-score · experiments · evidence · ready submissions  │
//   ├─ Chief decision card  +  Next-best-actions list                       │
//   ├─ Submission candidates table (top 8)                                  │
//   └─ Risk strip + fleet packet/evidence counts                            │
//
// Both panels can be open simultaneously in dockview — they listen on
// different namespaces (surgeon:* vs evidence:*/fleet:*) and share zero state.
//
// Data flow:
//   - Pulls `/api/competition/status` every `refreshMs` (default 5s).
//   - ALSO subscribes to `evidence:event` and `fleet:event` via the existing
//     EventBridge SSE consumer (lib/ide/event-bridge.ts). Any incoming event
//     triggers a faster-than-poll refresh, so live ledger writes amplify
//     visibility immediately.
//   - On fetch error → falls back to last-known state and surfaces a
//     dismissable inline banner. ZSF: `console.warn` + monotonic counter on
//     `window._campaign_theater_errors` so background failures stay
//     observable (no silent `except: pass` equivalents).
//
// Reversibility: pure component, no global side-effects beyond the error
// counter; one `git revert` removes it cleanly.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  Cpu,
  FileCheck,
  Flag,
  Gauge,
  ListChecks,
  ShieldAlert,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useIDEEvent } from '@/lib/ide/event-bus';
import {
  EMPTY_STATUS,
  type CompetitionStatus,
  type LedgerSummaryEntry,
  type SubmissionCandidate,
} from '@/lib/ide/campaign-types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const DEFAULT_REFRESH_MS = 5000;
const DEFAULT_ENDPOINT = '/api/competition/status';
const ERROR_COUNTER_KEY = '_campaign_theater_errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(value > 1 ? 3 : 4);
  }
  return String(value);
}

function bumpErrorCounter(): void {
  if (typeof window === 'undefined') return;
  // ZSF: every fetch failure increments an observable counter so QA / cardio
  // sentinels can see "is the panel quietly broken?" without diff-ing logs.
  const w = window as unknown as Record<string, number>;
  w[ERROR_COUNTER_KEY] = (w[ERROR_COUNTER_KEY] ?? 0) + 1;
}

function getErrorCounter(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as unknown as Record<string, number>;
  return w[ERROR_COUNTER_KEY] ?? 0;
}

async function fetchStatus(endpoint: string): Promise<CompetitionStatus> {
  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(
      `competition/status request failed: HTTP ${response.status}`,
    );
  }
  const body = (await response.json()) as Partial<CompetitionStatus>;
  // Defensive merge — backend may evolve faster than this client.
  return { ...EMPTY_STATUS, ...body };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/30 px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className={cn('w-3 h-3', accent)} />
        <span>{label}</span>
      </div>
      <div className="font-mono text-base text-foreground/90 tabular-nums">{value}</div>
    </div>
  );
}

function CandidateRow({
  candidate,
  index,
}: {
  candidate: SubmissionCandidate;
  index: number;
}) {
  const trust = Number(candidate.validation_trust_score ?? 0);
  const trustClass =
    trust >= 0.8
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
      : trust >= 0.65
        ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
        : 'text-rose-300 bg-rose-500/10 border-rose-500/30';
  const statusClass = candidate.submission_allowed
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
    : 'text-amber-300 bg-amber-500/10 border-amber-500/30';
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-background/40">
      <td className="py-1.5 px-2 text-muted-foreground tabular-nums">{index + 1}</td>
      <td
        className="py-1.5 px-2 truncate max-w-[140px] text-foreground/80"
        title={candidate.experiment_id}
      >
        {candidate.experiment_id ?? '—'}
      </td>
      <td className="py-1.5 px-2 truncate max-w-[120px] text-foreground/80">
        {candidate.model_family ?? candidate.strategy_id ?? '—'}
      </td>
      <td className="py-1.5 px-2 tabular-nums font-mono text-foreground/90">
        {fmt(candidate.score)}
      </td>
      <td className="py-1.5 px-2">
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] border tabular-nums font-mono',
            trustClass,
          )}
        >
          {fmt(candidate.validation_trust_score)}
        </span>
      </td>
      <td className="py-1.5 px-2">
        <span
          className={cn(
            'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] border uppercase tracking-wide',
            statusClass,
          )}
        >
          {candidate.submission_allowed ? 'ready' : 'blocked'}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CampaignTheaterProps {
  /** Initial state — useful for Storybook / tests. */
  initialStatus?: CompetitionStatus;
  /** Override endpoint. Defaults to '/api/competition/status'. */
  endpoint?: string;
  /** Polling interval in ms. Defaults to 5000. Set to 0 to disable polling. */
  refreshMs?: number;
  /** Tailwind className passthrough. */
  className?: string;
}

export function CampaignTheater({
  initialStatus,
  endpoint = DEFAULT_ENDPOINT,
  refreshMs = DEFAULT_REFRESH_MS,
  className,
}: CampaignTheaterProps) {
  const [status, setStatus] = useState<CompetitionStatus | undefined>(
    initialStatus,
  );
  const [error, setError] = useState<string | undefined>();
  const [lastRefresh, setLastRefresh] = useState<Date | undefined>();
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const next = await fetchStatus(endpoint);
      if (cancelledRef.current) return;
      setStatus(next);
      setError(undefined);
      setLastRefresh(new Date());
    } catch (err) {
      if (cancelledRef.current) return;
      const msg = err instanceof Error ? err.message : 'unknown fetch error';
      bumpErrorCounter();
      // ZSF: every failure is observable — no silent swallow.
      console.warn(
        '[CampaignTheater] fetch failed (errors=%d): %s',
        getErrorCounter(),
        msg,
      );
      setError(msg);
    }
  }, [endpoint]);

  // Poll loop — independent of SSE so the panel renders even when the bridge
  // is offline. The first load is scheduled via setTimeout so the effect
  // body itself never triggers a synchronous setState (react-hooks/
  // set-state-in-effect).
  useEffect(() => {
    cancelledRef.current = false;
    const initial = window.setTimeout(load, 0);
    const timer =
      refreshMs > 0 ? window.setInterval(load, refreshMs) : null;
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(initial);
      if (timer !== null) window.clearInterval(timer);
    };
  }, [load, refreshMs]);

  // Live amplification: any evidence/fleet event triggers an immediate
  // refresh (debounced by the in-flight fetch). The SSE consumer is the
  // existing `EventBridge` singleton — we do NOT open a second connection.
  useIDEEvent('evidence:event', () => {
    void load();
  });
  useIDEEvent('fleet:event', () => {
    void load();
  });

  // Initial render: never crash on missing data.
  const summary = status?.campaign_summary;
  const topCandidates = useMemo<SubmissionCandidate[]>(
    () => status?.submission_candidates?.slice(0, 8) ?? [],
    [status],
  );
  const ledgerSummary = status?.ledger_summary ?? null;
  const ledgerEntries = useMemo<LedgerSummaryEntry[]>(
    () => ledgerSummary?.records?.slice(0, 6) ?? [],
    [ledgerSummary],
  );
  const ledgerAvailable = status?.ledger_available === true;
  const nextActions = status?.next_best_actions ?? [];
  const competitionName =
    (typeof status?.competition?.name === 'string'
      ? (status.competition.name as string)
      : undefined) ??
    (typeof status?.competition?.id === 'string'
      ? (status.competition.id as string)
      : undefined) ??
    'No active campaign';
  const competitionPlatform =
    (typeof status?.competition?.platform === 'string'
      ? (status.competition.platform as string)
      : undefined) ?? 'manual';
  const competitionProblemType =
    (typeof status?.competition?.problem_type === 'string'
      ? (status.competition.problem_type as string)
      : undefined) ?? 'unknown';
  const metric = status?.competition?.metric;
  const metricLabel =
    typeof metric === 'string'
      ? metric
      : metric && typeof (metric as Record<string, unknown>).name === 'string'
        ? ((metric as Record<string, unknown>).name as string)
        : 'metric unknown';

  const noStatus = !status;
  const isFailedOnly = status?.source === 'error';

  return (
    <div
      data-testid="campaign-theater"
      className={cn(
        'rounded-lg border border-border/60 bg-background/40 p-3 transition-colors',
        error && 'border-amber-500/50',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <h3 className="text-xs font-semibold tracking-wide uppercase truncate">
            {competitionName}
          </h3>
          <span className="text-[10px] text-muted-foreground truncate">
            {competitionPlatform} · {competitionProblemType} · {metricLabel}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Live'}
        </span>
      </div>

      {/* Empty / loading state */}
      {noStatus && !error && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground italic px-1 py-2">
          <Activity className="w-3 h-3 animate-pulse" />
          Loading competition state…
        </div>
      )}

      {/* Error banner — fallback UI; never silent */}
      {error && (
        <div className="flex items-center gap-2 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="truncate">
            Showing last known state · {error}
          </span>
        </div>
      )}

      {/* Audit-only / empty banner */}
      {status && (status.source === 'empty' || isFailedOnly) && !error && (
        <div className="flex items-center gap-2 mb-2 rounded border border-border/60 bg-background/30 px-2 py-1 text-[11px] text-muted-foreground italic">
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="truncate">
            No active campaign — run <code className="font-mono">cdna-comp harden-demo</code> to populate.
          </span>
        </div>
      )}

      {/* Metric grid */}
      {status && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          <MetricCard
            icon={Award}
            label="Top score"
            value={fmt(summary?.top_score)}
            accent="text-emerald-400"
          />
          <MetricCard
            icon={Cpu}
            label="Experiments"
            value={fmt(summary?.node_result_count)}
            accent="text-sky-400"
          />
          <MetricCard
            icon={FileCheck}
            label="Evidence"
            value={fmt(summary?.evidence_count)}
            accent="text-fuchsia-400"
          />
          <MetricCard
            icon={Flag}
            label="Ready"
            value={fmt(summary?.ready_submission_count)}
            accent="text-amber-400"
          />
        </div>
      )}

      {/* Chief decision + next actions */}
      {status && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="rounded border border-border/60 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <Gauge className="w-3 h-3 text-sky-400" />
              <span>Chief decision</span>
            </div>
            <div className="font-mono text-[12px] text-foreground/90 break-words">
              {status.chief_decision?.decision ?? 'No chief decision yet'}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug break-words">
              {status.chief_decision?.reasoning ??
                'Run a hardening campaign or synthesize candidates to populate this.'}
            </p>
            {status.chief_decision?.confidence !== undefined && (
              <span className="inline-flex mt-1 items-center rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 text-[10px] font-mono tabular-nums">
                confidence {fmt(status.chief_decision.confidence)}
              </span>
            )}
          </div>
          <div className="rounded border border-border/60 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <ListChecks className="w-3 h-3 text-fuchsia-400" />
              <span>Next best actions</span>
            </div>
            {nextActions.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">No actions queued.</div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {nextActions.slice(0, 4).map((a, idx) => {
                  const pillClass =
                    a.priority === 'high'
                      ? 'text-rose-300 bg-rose-500/10 border-rose-500/30'
                      : a.priority === 'medium'
                        ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                        : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
                  return (
                    <li key={idx} className="text-[11px] leading-snug">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'inline-flex rounded px-1.5 py-0.5 text-[9px] border uppercase tracking-wide',
                            pillClass,
                          )}
                        >
                          {a.priority}
                        </span>
                        <span className="font-mono text-foreground/90 truncate">
                          {a.action}
                        </span>
                      </div>
                      {a.why && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 ml-1 truncate">
                          {a.why}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Submission candidates */}
      {status && topCandidates.length > 0 && (
        <div className="rounded border border-border/60 bg-background/30 p-2 mb-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>Submission candidates</span>
          </div>
          <table className="w-full text-[11px] font-sans">
            <thead>
              <tr className="text-left text-[10px] text-muted-foreground border-b border-border/60">
                <th className="py-1 px-2 font-medium">#</th>
                <th className="py-1 px-2 font-medium">Experiment</th>
                <th className="py-1 px-2 font-medium">Strategy</th>
                <th className="py-1 px-2 font-medium">Score</th>
                <th className="py-1 px-2 font-medium">Trust</th>
                <th className="py-1 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {topCandidates.map((c, i) => (
                <CandidateRow
                  key={`${c.experiment_id ?? 'cand'}-${i}`}
                  candidate={c}
                  index={i}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Risk + fleet strip */}
      {status && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border/60 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              <span>Risks</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">low-trust</span>
                <strong className="font-mono tabular-nums text-foreground/90">
                  {(status.risks?.validation_low_trust ?? []).length}
                </strong>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">blocked</span>
                <strong className="font-mono tabular-nums text-foreground/90">
                  {(status.risks?.submission_blocked ?? []).length}
                </strong>
              </div>
            </div>
          </div>
          <div className="rounded border border-border/60 bg-background/30 p-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>Fleet queue</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">packets</span>
                <strong className="font-mono tabular-nums text-foreground/90">
                  {summary?.strategy_packet_count ?? 0}
                </strong>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">evidence</span>
                <strong className="font-mono tabular-nums text-foreground/90">
                  {(status.recent_evidence ?? []).length}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Ledger panel — additive amplification of S2's
          memory/evidence_ledger.db. Only renders when the dump-helper has
          produced a snapshot; otherwise the existing recent_evidence row
          above is the source of truth. */}
      {status && (
        <div
          data-testid="campaign-theater-ledger"
          className="mt-2 rounded border border-border/60 bg-background/30 p-2"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <BookOpen className="w-3 h-3 text-violet-400" />
              <span>Evidence ledger</span>
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[9px] border uppercase tracking-wide font-mono tabular-nums',
                ledgerAvailable
                  ? 'text-violet-200 bg-violet-500/10 border-violet-500/30'
                  : 'text-muted-foreground bg-background/40 border-border/60',
              )}
            >
              {ledgerAvailable
                ? `${ledgerSummary?.total_records ?? ledgerEntries.length} records`
                : ledgerSummary?.reason ?? 'no snapshot'}
            </span>
          </div>
          {ledgerAvailable ? (
            ledgerEntries.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">
                Ledger empty — no records yet.
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {ledgerEntries.map((entry) => (
                  <li
                    key={entry.record_id}
                    className="flex items-baseline gap-2 text-[11px] leading-snug"
                  >
                    <span className="inline-flex shrink-0 rounded px-1 py-0.5 text-[9px] border border-violet-500/30 bg-violet-500/10 text-violet-200 uppercase tracking-wide">
                      {entry.kind}
                    </span>
                    <span
                      className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0"
                      title={entry.record_id}
                    >
                      {entry.record_id.slice(0, 8)}
                    </span>
                    <span className="text-foreground/80 truncate" title={entry.summary}>
                      {entry.summary || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="text-[11px] text-muted-foreground italic">
              Ledger snapshot unavailable — falling back to audit pipeline.
              Run <code className="font-mono">python3 scripts/dump-evidence-ledger-summary.py</code> to populate.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CampaignTheater;
