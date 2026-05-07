'use client';

// =============================================================================
// RaceTheater — Competitive Branch Racing IDE panel (Y2 wave, 2026-05-07)
//
// Sister to SurgeonTheater + CampaignTheater. Renders the "10x feature" from
// `project_competitive_branch_racing.md`: 3 machines race in isolated
// worktrees on the same problem, propose → rebut → converge, judge synthesis
// picks the winner. 45min single-machine task → 12min parallel.
//
//   ┌─ Header: "Race Theater" · active_count · demo toggle ───────────────────┐
//   ├─ Empty state ("No active races") OR list of RaceEntry cards            │
//   └─ For each race: header (id + status + round X/Y) → 3-card participants │
//       (cardio / neuro / judge with phase badge + score + last_proposal     │
//        preview + tooltip with full text) → verdict footer when complete    │
//
// Y2 mission (replaces X5 scaffold):
//   - PART A: SSE consumer subscribes to `race:event` via the existing
//     event-bridge prefix listener. Maintains an in-memory map of races.
//   - PART B: Initial GET /api/race/status populates the map. Demo toggle
//     stays for offline preview but is OFF by default; live data wins.
//   - PART C: ZSF counters + IDE log buffer entries on every failure path.
//
// ZSF counters (window-scoped, observable to QA / cardio sentinels):
//   _race_theater_sse_errors                       (rolling total)
//   _race_theater_sse_errors_connect               (transport open failed)
//   _race_theater_sse_errors_parse                 (envelope JSON / shape)
//   _race_theater_sse_errors_server-5xx            (status route 5xx)
//   _race_theater_render_errors                    (participant shape mismatch)
//
// Disjoint event namespace `race:*` — does NOT collide with `surgeon:*`,
// `evidence:*`, `fleet:*`, `quorum:*`, or `gold:*`. Bridge wiring landed in
// `lib/ide/event-bridge.ts` (FLEET_NAMESPACES + namespaceToGeneric).
//
// Reversibility: pure component, zero global side-effects beyond the window
// counters above. One `git revert` removes it cleanly.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Flag,
  GitBranch,
  Sparkles,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import { useIDEEvent } from '@/lib/ide/event-bus';
import {
  EMPTY_RACE_STATUS,
  type RaceEntry,
  type RaceParticipant,
  type RaceParticipantPhase,
  type RaceParticipantRole,
  type RaceStatus,
  type RaceStatusResponse,
  type RaceVerdict,
} from '@/lib/ide/race-types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const STATUS_ENDPOINT = '/api/race/status';
const SSE_ERROR_COUNTER_KEY = '_race_theater_sse_errors';
const RENDER_ERROR_COUNTER_KEY = '_race_theater_render_errors';

type SseErrorBranch = 'connect' | 'parse' | 'server-5xx';

const PARTICIPANT_PHASE_LABEL: Record<RaceParticipantPhase, string> = {
  idle: 'idle',
  proposing: 'proposing',
  rebutting: 'rebutting',
  converging: 'converging',
  done: 'done',
  error: 'error',
};

const STATUS_LABEL: Record<RaceStatus, string> = {
  pending: 'Pending',
  racing: 'Racing',
  synthesizing: 'Synthesizing',
  complete: 'Complete',
  aborted: 'Aborted',
};

const STATUS_ACCENT: Record<RaceStatus, string> = {
  pending: 'border-zinc-500/40 bg-zinc-500/5 text-zinc-200',
  racing: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  synthesizing: 'border-sky-500/50 bg-sky-500/10 text-sky-200',
  complete: 'border-slate-500/50 bg-slate-500/10 text-slate-200',
  aborted: 'border-rose-500/50 bg-rose-500/10 text-rose-200',
};

// Mission-specified phase colours: proposing=amber, rebutting=amber, converging=
// emerald, complete=slate, plus violet for an explicit `proposing` highlight to
// keep the propose/rebut/converge palette legible.
const PARTICIPANT_ACCENT: Record<RaceParticipantPhase, string> = {
  idle: 'border-border/60 bg-background/30 text-muted-foreground',
  proposing: 'border-violet-500/50 bg-violet-500/5 text-violet-100',
  rebutting: 'border-amber-500/50 bg-amber-500/5 text-amber-100',
  converging: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-100',
  done: 'border-slate-500/50 bg-slate-500/5 text-slate-100',
  error: 'border-rose-500/50 bg-rose-500/5 text-rose-100',
};

const VERDICT_ACCENT: Record<RaceVerdict, string> = {
  PROCEED: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
  SPLIT: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  DEFER: 'border-sky-500/60 bg-sky-500/10 text-sky-200',
  DROP: 'border-rose-500/60 bg-rose-500/10 text-rose-200',
  UNRESOLVED: 'border-zinc-500/60 bg-zinc-500/10 text-zinc-200',
};

const ROLE_LABEL: Record<RaceParticipantRole, string> = {
  cardio: 'Cardio',
  neuro: 'Neuro',
  judge: 'Judge',
};

// Fixed left-to-right ordering for the 3-card participant row.
const ROLE_ORDER: RaceParticipantRole[] = ['cardio', 'neuro', 'judge'];

// ---------------------------------------------------------------------------
// Demo data — three hardcoded races for the "Demo" toggle. NOT real data.
// Used so reviewers (and 3-surgeons satisfaction check) can see the intended
// shape without waiting for backend wiring.
// ---------------------------------------------------------------------------

const DEMO_RACES: RaceEntry[] = [
  {
    race_id: 'demo-001',
    topic: 'Fix flaky NATS reconnect on mac3 (race demo)',
    status: 'racing',
    started_at: '2026-05-07T09:00:00Z',
    updated_at: '2026-05-07T09:04:00Z',
    current_round: 2,
    max_rounds: 3,
    participants: [
      {
        node_id: 'mac1',
        role: 'cardio',
        branch: 'race/2026-05-07-nats-reconnect-A',
        phase: 'rebutting',
        score: 0.62,
        preview: 'Rebutting neuro: backoff window too short',
        last_proposal:
          'Cardio rebuts neuro: jitter alone leaves the 5s window too tight. Reconnect storms still cluster on the second attempt; recommend extending base backoff to 10s + jitter.',
      },
      {
        node_id: 'mac2',
        role: 'neuro',
        branch: 'race/2026-05-07-nats-reconnect-B',
        phase: 'proposing',
        score: 0.71,
        preview: 'Adds jitter to reconnect loop (proposed diff +18 / -4)',
        last_proposal:
          'Neuro proposes adding ±20% jitter to the reconnect loop. Diff +18/-4 in nats_client.py; preserves base backoff. p99 reconnect latency drops from 4.8s → 1.2s in local sim.',
      },
      {
        node_id: 'mac3',
        role: 'judge',
        branch: 'race/2026-05-07-nats-reconnect-C',
        phase: 'converging',
        score: 0.68,
        preview: 'Folding cardio rebuttal: extending window to 30s',
        last_proposal:
          'Judge: cardio rebuttal accepted in part. Final synthesis extends base backoff to 10s + neuro jitter. Decision pending one more round.',
      },
    ],
  },
  {
    race_id: 'demo-002',
    topic: 'EvidenceLedger append latency regression (race demo)',
    status: 'synthesizing',
    started_at: '2026-05-07T08:30:00Z',
    updated_at: '2026-05-07T09:05:00Z',
    current_round: 3,
    max_rounds: 3,
    participants: [
      {
        node_id: 'mac1',
        role: 'cardio',
        branch: 'race/2026-05-07-ledger-A',
        phase: 'done',
        score: 0.81,
        preview: 'Batched flush, p99 = 12ms',
        last_proposal:
          'Cardio: batch flush every 25 records. p99 12ms, p50 4ms. No correctness impact — fsync still per-batch.',
      },
      {
        node_id: 'mac2',
        role: 'neuro',
        branch: 'race/2026-05-07-ledger-B',
        phase: 'done',
        score: 0.74,
        preview: 'Async writer, p99 = 18ms',
        last_proposal:
          'Neuro: dedicated async writer thread. p99 18ms but isolates the hot path. Risk: writer crash drops in-flight batch.',
      },
      {
        node_id: 'mac3',
        role: 'judge',
        branch: 'race/2026-05-07-ledger-C',
        phase: 'done',
        score: 0.79,
        preview: 'Synthesising — leaning cardio',
        last_proposal:
          'Judge: cardio batch-flush dominates p99 by 33%. Neuro isolation is nice but not load-bearing. Recommend PROCEED with cardio diff.',
      },
    ],
  },
  {
    race_id: 'demo-003',
    topic: 'IDE panel render cost on cold open (race demo)',
    status: 'complete',
    started_at: '2026-05-07T07:00:00Z',
    updated_at: '2026-05-07T07:12:00Z',
    current_round: 2,
    max_rounds: 3,
    winner_node_id: 'mac2',
    verdict: 'PROCEED',
    outcome_summary: 'Neuro won — diff merged, evidence chain intact',
    participants: [
      {
        node_id: 'mac1',
        role: 'cardio',
        branch: 'race/2026-05-07-coldopen-A',
        phase: 'done',
        score: 0.55,
        preview: 'Memoised heavy components',
        last_proposal:
          'Cardio: memoise heavy components. 8% cold-open improvement. Memory cost negligible.',
      },
      {
        node_id: 'mac2',
        role: 'neuro',
        branch: 'race/2026-05-07-coldopen-B',
        phase: 'done',
        score: 0.84,
        preview: 'Defer non-critical theaters via dynamic import',
        last_proposal:
          'Neuro: dynamic-import non-critical theaters (RaceTheater + ProfessorView). 31% cold-open improvement; first paint < 200ms.',
      },
      {
        node_id: 'mac3',
        role: 'judge',
        branch: 'race/2026-05-07-coldopen-C',
        phase: 'done',
        score: 0.72,
        preview: 'Synthesised — neuro wins',
        last_proposal:
          'Judge verdict: PROCEED. Neuro candidate dominates cold-open metric. Cardio approach folded as a follow-up nice-to-have.',
      },
    ],
  },
];

const DEMO_STATUS: RaceStatusResponse = {
  races: DEMO_RACES,
  active_count: DEMO_RACES.filter(
    (r) => r.status === 'racing' || r.status === 'synthesizing',
  ).length,
  source: 'demo',
};

// ---------------------------------------------------------------------------
// ZSF counters & log buffer — mirror CampaignTheater pattern
// ---------------------------------------------------------------------------

function bumpSseErrorCounter(branch: SseErrorBranch): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  const total = (w[SSE_ERROR_COUNTER_KEY] as number | undefined) ?? 0;
  w[SSE_ERROR_COUNTER_KEY] = total + 1;
  const subKey = `${SSE_ERROR_COUNTER_KEY}_${branch}`;
  const sub = (w[subKey] as number | undefined) ?? 0;
  w[subKey] = sub + 1;
}

function getSseErrorCounter(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as unknown as Record<string, number>;
  return w[SSE_ERROR_COUNTER_KEY] ?? 0;
}

function bumpRenderErrorCounter(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[RENDER_ERROR_COUNTER_KEY] = (w[RENDER_ERROR_COUNTER_KEY] ?? 0) + 1;
}

function getRenderErrorCounter(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as unknown as Record<string, number>;
  return w[RENDER_ERROR_COUNTER_KEY] ?? 0;
}

/**
 * Best-effort POST into the IDE log buffer. Same channel CampaignTheater uses
 * — fire-and-forget; failures here MUST NOT cascade back into the caller.
 */
function logToIDE(
  level: 'info' | 'warn' | 'error',
  msg: string,
  detail: unknown,
): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/logs/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level,
      source: 'race-theater',
      msg,
      detail,
    }),
  }).catch((err) => {
    // ZSF: don't silently swallow — surface in console with the running
    // SSE error count so the failure is observable from devtools.
    console.warn(
      '[RaceTheater] logToIDE failed (sse_errors=%d): %s',
      getSseErrorCounter(),
      err instanceof Error ? err.message : String(err),
    );
  });
}

// ---------------------------------------------------------------------------
// Initial fetch — mirrors CampaignTheater.fetchStatus
// ---------------------------------------------------------------------------

async function fetchRaceStatus(): Promise<RaceStatusResponse> {
  const response = await fetch(STATUS_ENDPOINT, { cache: 'no-store' });
  if (!response.ok) {
    if (response.status >= 500) {
      bumpSseErrorCounter('server-5xx');
      logToIDE('error', 'race/status 5xx', { status: response.status });
    } else {
      bumpSseErrorCounter('parse');
      logToIDE('warn', 'race/status non-ok', { status: response.status });
    }
    throw new Error(`race/status request failed: HTTP ${response.status}`);
  }
  let body: Partial<RaceStatusResponse>;
  try {
    body = (await response.json()) as Partial<RaceStatusResponse>;
  } catch (err) {
    bumpSseErrorCounter('parse');
    logToIDE('warn', 'race/status JSON parse failed', {
      msg: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return { ...EMPTY_RACE_STATUS, ...body };
}

// ---------------------------------------------------------------------------
// Defensive shape coercion — never throw past the component boundary.
// ---------------------------------------------------------------------------

function coerceParticipant(raw: unknown): RaceParticipant | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.node_id !== 'string') return null;
  const phase = (typeof r.phase === 'string' ? r.phase : 'idle') as RaceParticipantPhase;
  const valid: ReadonlyArray<RaceParticipantPhase> = [
    'idle',
    'proposing',
    'rebutting',
    'converging',
    'done',
    'error',
  ];
  if (!valid.includes(phase)) return null;
  const role =
    typeof r.role === 'string' &&
    (r.role === 'cardio' || r.role === 'neuro' || r.role === 'judge')
      ? (r.role as RaceParticipantRole)
      : undefined;
  return {
    node_id: r.node_id,
    role,
    branch: typeof r.branch === 'string' ? r.branch : undefined,
    phase,
    score: typeof r.score === 'number' ? r.score : undefined,
    preview: typeof r.preview === 'string' ? r.preview : undefined,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
    last_proposal:
      typeof r.last_proposal === 'string' ? r.last_proposal : undefined,
  };
}

function coerceRace(raw: unknown): RaceEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.race_id !== 'string' || typeof r.topic !== 'string') return null;
  const status = (typeof r.status === 'string' ? r.status : 'pending') as RaceStatus;
  const validStatus: ReadonlyArray<RaceStatus> = [
    'pending',
    'racing',
    'synthesizing',
    'complete',
    'aborted',
  ];
  if (!validStatus.includes(status)) return null;
  const partsRaw = Array.isArray(r.participants) ? r.participants : [];
  const participants: RaceParticipant[] = [];
  for (const p of partsRaw) {
    const c = coerceParticipant(p);
    if (c) participants.push(c);
    else {
      bumpRenderErrorCounter();
      logToIDE('warn', 'participant shape mismatch', { race_id: r.race_id });
    }
  }
  const verdictRaw = typeof r.verdict === 'string' ? r.verdict : undefined;
  const validVerdict: ReadonlyArray<RaceVerdict> = [
    'PROCEED',
    'SPLIT',
    'DEFER',
    'DROP',
    'UNRESOLVED',
  ];
  const verdict =
    verdictRaw && validVerdict.includes(verdictRaw as RaceVerdict)
      ? (verdictRaw as RaceVerdict)
      : undefined;
  return {
    race_id: r.race_id,
    topic: r.topic,
    status,
    started_at: typeof r.started_at === 'string' ? r.started_at : undefined,
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
    participants,
    winner_node_id:
      typeof r.winner_node_id === 'string' ? r.winner_node_id : undefined,
    outcome_summary:
      typeof r.outcome_summary === 'string' ? r.outcome_summary : undefined,
    current_round:
      typeof r.current_round === 'number' ? r.current_round : undefined,
    max_rounds: typeof r.max_rounds === 'number' ? r.max_rounds : undefined,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: RaceStatus }) {
  const Icon =
    status === 'complete'
      ? CheckCircle2
      : status === 'aborted'
        ? XCircle
        : status === 'synthesizing'
          ? Sparkles
          : status === 'racing'
            ? Zap
            : Flag;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        STATUS_ACCENT[status],
      )}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function ParticipantCard({
  p,
  isWinner,
  fallbackLabel,
}: {
  p: RaceParticipant | null;
  isWinner: boolean;
  fallbackLabel: string;
}) {
  if (!p) {
    return (
      <div className="flex min-h-[88px] flex-1 flex-col gap-0.5 rounded-md border border-border/40 bg-background/20 px-2 py-1.5 font-mono text-muted-foreground">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide">{fallbackLabel}</span>
          <span className="text-[9px] uppercase">empty</span>
        </div>
        <div className="text-[10px] italic">awaiting racer</div>
      </div>
    );
  }
  const phaseClass = PARTICIPANT_ACCENT[p.phase];
  const tooltip = p.last_proposal ?? p.preview ?? p.branch ?? p.node_id;
  return (
    <div
      className={cn(
        'flex min-h-[88px] flex-1 flex-col gap-0.5 rounded-md border px-2 py-1.5 font-mono',
        phaseClass,
        isWinner && 'ring-1 ring-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.4)]',
      )}
      title={tooltip}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          <span className="text-[11px] font-semibold tracking-wide">
            {p.role ? ROLE_LABEL[p.role] : p.node_id}
          </span>
          {isWinner && <Trophy className="h-3 w-3 text-emerald-300" />}
        </span>
        <span
          className={cn(
            'rounded border px-1 py-0.5 text-[9px] uppercase tracking-wide',
            phaseClass,
          )}
        >
          {PARTICIPANT_PHASE_LABEL[p.phase]}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{p.role ? p.node_id : ''}</span>
        <span>{p.score != null ? `score ${p.score.toFixed(2)}` : '—'}</span>
      </div>
      {p.preview && (
        <div className="text-[10px] leading-snug text-foreground/80 line-clamp-2">
          {p.preview}
        </div>
      )}
    </div>
  );
}

function VerdictFooter({ verdict, summary }: { verdict: RaceVerdict; summary?: string }) {
  return (
    <div
      className={cn(
        'mt-2 flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] font-mono',
        VERDICT_ACCENT[verdict],
      )}
    >
      <span className="rounded border border-current/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        {verdict}
      </span>
      {summary && <span className="leading-snug">{summary}</span>}
    </div>
  );
}

function RaceCard({ race }: { race: RaceEntry }) {
  // Participants by role — fixed cardio/neuro/judge ordering when roles are
  // present. Falls back to source order when no roles set (legacy demo /
  // X5-shape races) so we never drop racers from the render.
  const byRole = useMemo(() => {
    const map: Partial<Record<RaceParticipantRole, RaceParticipant>> = {};
    for (const p of race.participants) {
      if (p.role && !map[p.role]) map[p.role] = p;
    }
    return map;
  }, [race.participants]);

  const hasRoles = ROLE_ORDER.some((r) => byRole[r]);

  return (
    <div className="rounded-md border border-border/60 bg-background/30 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">{race.topic}</div>
          <div className="text-[10px] text-muted-foreground">
            id: {race.race_id}
            {race.current_round != null && (
              <span className="ml-2">
                round {race.current_round}
                {race.max_rounds != null ? ` / ${race.max_rounds}` : ''}
              </span>
            )}
            {race.started_at && (
              <span className="ml-2">started: {race.started_at}</span>
            )}
          </div>
        </div>
        <StatusPill status={race.status} />
      </div>
      {hasRoles ? (
        <div className="flex gap-1.5">
          {ROLE_ORDER.map((role) => {
            const p = byRole[role] ?? null;
            const isWinner =
              p?.node_id != null && race.winner_node_id === p.node_id;
            return (
              <ParticipantCard
                key={`${race.race_id}:${role}`}
                p={p}
                isWinner={isWinner}
                fallbackLabel={ROLE_LABEL[role]}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {race.participants.map((p) => (
            <ParticipantCard
              key={`${race.race_id}:${p.node_id}`}
              p={p}
              isWinner={race.winner_node_id === p.node_id}
              fallbackLabel={p.node_id}
            />
          ))}
        </div>
      )}
      {race.status === 'complete' && race.verdict && (
        <VerdictFooter verdict={race.verdict} summary={race.outcome_summary} />
      )}
      {race.status === 'complete' && !race.verdict && race.outcome_summary && (
        <div className="mt-1.5 text-[10px] italic text-muted-foreground">
          {race.outcome_summary}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface RaceTheaterProps {
  className?: string;
  /**
   * Optional pre-seeded status for tests / Storybook. When omitted the panel
   * fetches `/api/race/status` once and then live-updates from `race:event`.
   * Demo mode is OFF by default — flip it on only when the backend is empty
   * and the operator wants to see the intended layout.
   */
  initialStatus?: RaceStatusResponse;
}

export function RaceTheater({ className, initialStatus }: RaceTheaterProps) {
  const [demo, setDemo] = useState(false);
  // Live race table — keyed by race_id so SSE updates merge in O(1).
  const [races, setRaces] = useState<Record<string, RaceEntry>>(() => {
    if (!initialStatus) return {};
    const m: Record<string, RaceEntry> = {};
    for (const r of initialStatus.races) m[r.race_id] = r;
    return m;
  });
  const [loaded, setLoaded] = useState<boolean>(Boolean(initialStatus));

  // ---- Initial fetch ------------------------------------------------------
  // Skip if the caller already supplied a snapshot (test path). Failure
  // tolerated — demo toggle remains usable so the panel still renders.
  useEffect(() => {
    if (initialStatus) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchRaceStatus();
        if (cancelled) return;
        const m: Record<string, RaceEntry> = {};
        for (const raw of next.races) {
          const c = coerceRace(raw);
          if (c) m[c.race_id] = c;
        }
        setRaces(m);
        setLoaded(true);
      } catch (err) {
        // bumpSseErrorCounter is already called inside fetchRaceStatus for
        // 5xx + parse branches; here we only catch the network fail-fast.
        if (cancelled) return;
        bumpSseErrorCounter('connect');
        const msg = err instanceof Error ? err.message : 'unknown fetch error';
        console.warn(
          '[RaceTheater] initial fetch failed (sse_errors=%d): %s',
          getSseErrorCounter(),
          msg,
        );
        logToIDE('warn', 'initial fetch failed', { msg });
        // Render path stays alive — `loaded` flips so the empty/demo path
        // renders instead of an indefinite skeleton.
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialStatus]);

  // ---- SSE consumer -------------------------------------------------------
  // Race events come off the existing event-bridge as `race:event` envelopes.
  // We discriminate by the inner `type`:
  //   race.snapshot   → full table refresh
  //   race.participant→ participant phase / score / preview update
  //   race.status     → race lifecycle transition
  //   race.winner     → winner_node_id + verdict + outcome_summary
  //   race.rebuttal   → ignored at the table level (preview already updated
  //                     by the participant event that follows)
  //   race.removed    → race_id pruned from the table
  const handleRaceEvent = useCallback((envelope: {
    type: string;
    payload: Record<string, unknown>;
    source?: string;
    timestamp?: string | number;
    correlation_id?: string;
    session_id?: string;
  }) => {
    try {
      if (!envelope || typeof envelope.type !== 'string') {
        bumpSseErrorCounter('parse');
        logToIDE('warn', 'race envelope missing type', { envelope });
        return;
      }
      const inner = envelope.payload ?? {};
      switch (envelope.type) {
        case 'race.snapshot': {
          const racesRaw = Array.isArray((inner as { races?: unknown[] }).races)
            ? ((inner as { races: unknown[] }).races as unknown[])
            : [];
          const m: Record<string, RaceEntry> = {};
          for (const raw of racesRaw) {
            const c = coerceRace(raw);
            if (c) m[c.race_id] = c;
          }
          setRaces(m);
          setLoaded(true);
          return;
        }
        case 'race.participant': {
          const race_id = String((inner as { race_id?: unknown }).race_id ?? '');
          const node_id = String((inner as { node_id?: unknown }).node_id ?? '');
          if (!race_id || !node_id) {
            bumpRenderErrorCounter();
            logToIDE('warn', 'race.participant missing ids', { inner });
            return;
          }
          setRaces((prev) => {
            const existing = prev[race_id];
            if (!existing) {
              // No parent race yet — build a minimal stub so the participant
              // is still visible. A subsequent race.status will fill in topic.
              const stub: RaceEntry = {
                race_id,
                topic: race_id,
                status: 'pending',
                participants: [],
              };
              const partial = coerceParticipant({ ...inner, node_id });
              if (partial) stub.participants.push(partial);
              return { ...prev, [race_id]: stub };
            }
            const partial = coerceParticipant({ ...inner, node_id });
            if (!partial) return prev;
            const others = existing.participants.filter(
              (p) => p.node_id !== node_id,
            );
            return {
              ...prev,
              [race_id]: {
                ...existing,
                participants: [...others, partial],
                updated_at:
                  typeof envelope.timestamp === 'string'
                    ? envelope.timestamp
                    : existing.updated_at,
              },
            };
          });
          return;
        }
        case 'race.status': {
          const race_id = String((inner as { race_id?: unknown }).race_id ?? '');
          if (!race_id) {
            bumpRenderErrorCounter();
            logToIDE('warn', 'race.status missing race_id', { inner });
            return;
          }
          setRaces((prev) => {
            const existing = prev[race_id] ?? {
              race_id,
              topic: race_id,
              status: 'pending',
              participants: [],
            };
            const merged = coerceRace({ ...existing, ...inner, race_id });
            return { ...prev, [race_id]: merged ?? existing };
          });
          return;
        }
        case 'race.winner': {
          const race_id = String((inner as { race_id?: unknown }).race_id ?? '');
          if (!race_id) {
            bumpRenderErrorCounter();
            logToIDE('warn', 'race.winner missing race_id', { inner });
            return;
          }
          setRaces((prev) => {
            const existing = prev[race_id];
            if (!existing) return prev;
            const winner = (inner as { winner_node_id?: unknown }).winner_node_id;
            const verdictRaw = (inner as { verdict?: unknown }).verdict;
            const summary = (inner as { outcome_summary?: unknown }).outcome_summary;
            const validVerdict: ReadonlyArray<RaceVerdict> = [
              'PROCEED',
              'SPLIT',
              'DEFER',
              'DROP',
              'UNRESOLVED',
            ];
            const verdict =
              typeof verdictRaw === 'string' &&
              validVerdict.includes(verdictRaw as RaceVerdict)
                ? (verdictRaw as RaceVerdict)
                : existing.verdict;
            return {
              ...prev,
              [race_id]: {
                ...existing,
                winner_node_id:
                  typeof winner === 'string' ? winner : existing.winner_node_id,
                verdict,
                outcome_summary:
                  typeof summary === 'string' ? summary : existing.outcome_summary,
                status: 'complete',
              },
            };
          });
          return;
        }
        case 'race.removed': {
          const race_id = String((inner as { race_id?: unknown }).race_id ?? '');
          if (!race_id) return;
          setRaces((prev) => {
            if (!prev[race_id]) return prev;
            const next = { ...prev };
            delete next[race_id];
            return next;
          });
          return;
        }
        default:
          // Unknown subtype — count as parse error so we see the gap, but
          // don't throw past the boundary.
          bumpSseErrorCounter('parse');
          logToIDE('warn', 'unknown race.* subtype', { type: envelope.type });
          return;
      }
    } catch (err) {
      // ZSF: any unexpected exception in the event handler is observable.
      bumpRenderErrorCounter();
      console.warn(
        '[RaceTheater] event handler threw (render_errors=%d): %s',
        getRenderErrorCounter(),
        err instanceof Error ? err.message : String(err),
      );
      logToIDE('error', 'event handler threw', {
        type: envelope?.type,
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useIDEEvent('race:event', handleRaceEvent);

  // ---- Source resolution --------------------------------------------------
  // Backend takes precedence; demo only when toggle is on AND backend is
  // empty (graceful empty-state otherwise). initialStatus prop wins over both.
  const liveList = useMemo<RaceEntry[]>(() => Object.values(races), [races]);

  const status: RaceStatusResponse = useMemo(() => {
    if (initialStatus) return initialStatus;
    if (liveList.length > 0) {
      return {
        races: liveList,
        active_count: liveList.filter(
          (r) => r.status === 'racing' || r.status === 'synthesizing',
        ).length,
        source: 'fleet',
      };
    }
    if (demo) return DEMO_STATUS;
    return EMPTY_RACE_STATUS;
  }, [initialStatus, liveList, demo]);

  const isEmpty = status.races.length === 0;

  return (
    <div
      data-testid="race-theater"
      className={cn(
        'rounded-lg border border-border/60 bg-background/40 p-3 transition-colors',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wide">Race Theater</h3>
          <span
            className="text-[10px] text-muted-foreground"
            title="Competitive Branch Racing — 3 machines, propose/rebut/converge"
          >
            {status.active_count} active · {status.races.length} total
          </span>
        </div>
        {/* Demo toggle — visible whenever there's no live backend data so the
            operator can preview the intended layout. Hidden when the caller
            forces a snapshot (test / storybook path). */}
        {!initialStatus && (
          <button
            type="button"
            onClick={() => setDemo((v) => !v)}
            className={cn(
              'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
              demo
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                : 'border-border/60 bg-background/30 text-muted-foreground hover:bg-amber-500/5 hover:text-amber-200',
            )}
            aria-pressed={demo}
            aria-label="Toggle race theater demo data"
            disabled={liveList.length > 0}
            title={
              liveList.length > 0
                ? 'Demo disabled while live races are present'
                : 'Toggle hardcoded demo races'
            }
          >
            {demo ? 'Demo: on' : 'Demo'}
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="rounded border border-dashed border-border/50 bg-background/20 p-4 text-center">
          <div className="text-[12px] font-semibold text-foreground/80">
            {loaded ? 'No active races' : 'Loading…'}
          </div>
          <div className="mt-1 text-[10px] italic text-muted-foreground">
            Kick one off with{' '}
            <code className="rounded bg-background/40 px-1 py-0.5 font-mono">
              fleet_race &lt;topic&gt;
            </code>{' '}
            or flip the Demo toggle to preview the layout.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {status.races.map((race) => (
            <RaceCard key={race.race_id} race={race} />
          ))}
        </div>
      )}

      <div className="mt-2 text-[9px] uppercase tracking-wider text-muted-foreground">
        Y2 · race:* namespace · live SSE consumer
      </div>
    </div>
  );
}

export default RaceTheater;
