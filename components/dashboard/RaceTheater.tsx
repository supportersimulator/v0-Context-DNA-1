'use client';

// =============================================================================
// RaceTheater — Competitive Branch Racing IDE panel (X5 scaffold, 2026-05-07)
//
// Sister to SurgeonTheater + CampaignTheater. Renders the "10x feature" from
// `project_competitive_branch_racing.md`: 3 machines race in isolated
// worktrees on the same problem, propose → rebut → converge, chief synthesis
// picks the winner. 45min single-machine task → 12min parallel.
//
//   ┌─ Header: "Race Theater" · active_count · demo toggle ───────────────────┐
//   ├─ Empty state ("No active races") OR list of RaceEntry rows             │
//   └─ For each race: topic, status pill, participant pills (one per racer)  │
//
// SCAFFOLD ONLY: this wave (X5) wires NOTHING to real fleet data. The panel
// renders either:
//   (a) the empty state ("No active races — kick one off with `fleet_race`"),
//   (b) three hardcoded demo races when the operator flips the demo toggle.
//
// Y-batch (next wave) will:
//   - subscribe to `race:participant` / `race:status` / `race:rebuttal` /
//     `race:winner` via the existing EventBridge SSE consumer
//     (lib/ide/event-bridge.ts — same path SurgeonTheater + CampaignTheater
//     already use),
//   - replace the demo data with `GET /api/race/status` polling at 5s,
//   - add per-race expand/collapse + rebuttal stream + chief decision card.
//
// ZSF: any future fetch path MUST increment a window counter the same way
// CampaignTheater does (`_campaign_theater_errors`); this scaffold has no
// fetch path so no counter is needed yet — Y-batch adds it.
//
// Reversibility: pure component, zero global side-effects, one `git revert`
// removes it cleanly.
// =============================================================================

import { useMemo, useState } from 'react';
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
import {
  EMPTY_RACE_STATUS,
  type RaceEntry,
  type RaceParticipant,
  type RaceParticipantPhase,
  type RaceStatus,
  type RaceStatusResponse,
} from '@/lib/ide/race-types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

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
  complete: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  aborted: 'border-rose-500/50 bg-rose-500/10 text-rose-200',
};

const PARTICIPANT_ACCENT: Record<RaceParticipantPhase, string> = {
  idle: 'border-border/60 bg-background/30 text-muted-foreground',
  proposing: 'border-amber-500/50 bg-amber-500/5 text-amber-100',
  rebutting: 'border-fuchsia-500/50 bg-fuchsia-500/5 text-fuchsia-100',
  converging: 'border-sky-500/50 bg-sky-500/5 text-sky-100',
  done: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-100',
  error: 'border-rose-500/50 bg-rose-500/5 text-rose-100',
};

// ---------------------------------------------------------------------------
// Demo data — three hardcoded races for the "Demo" toggle. NOT real data.
// Used so reviewers (and 3-surgeons satisfaction check) can see the intended
// shape without waiting for Y-batch fleet wiring.
// ---------------------------------------------------------------------------

const DEMO_RACES: RaceEntry[] = [
  {
    race_id: 'demo-001',
    topic: 'Fix flaky NATS reconnect on mac3 (race demo)',
    status: 'racing',
    started_at: '2026-05-07T09:00:00Z',
    updated_at: '2026-05-07T09:04:00Z',
    participants: [
      {
        node_id: 'mac1',
        branch: 'race/2026-05-07-nats-reconnect-A',
        phase: 'rebutting',
        score: 0.62,
        preview: 'Rebutting mac2: backoff window too short',
      },
      {
        node_id: 'mac2',
        branch: 'race/2026-05-07-nats-reconnect-B',
        phase: 'proposing',
        score: 0.71,
        preview: 'Adds jitter to reconnect loop (proposed diff +18 / -4)',
      },
      {
        node_id: 'mac3',
        branch: 'race/2026-05-07-nats-reconnect-C',
        phase: 'converging',
        score: 0.68,
        preview: 'Folding mac1 rebuttal: extending window to 30s',
      },
    ],
  },
  {
    race_id: 'demo-002',
    topic: 'EvidenceLedger append latency regression (race demo)',
    status: 'synthesizing',
    started_at: '2026-05-07T08:30:00Z',
    updated_at: '2026-05-07T09:05:00Z',
    participants: [
      {
        node_id: 'mac1',
        branch: 'race/2026-05-07-ledger-A',
        phase: 'done',
        score: 0.81,
        preview: 'Batched flush, p99 = 12ms',
      },
      {
        node_id: 'mac2',
        branch: 'race/2026-05-07-ledger-B',
        phase: 'done',
        score: 0.74,
        preview: 'Async writer, p99 = 18ms',
      },
      {
        node_id: 'mac3',
        branch: 'race/2026-05-07-ledger-C',
        phase: 'done',
        score: 0.79,
        preview: 'mmap-backed log, p99 = 14ms',
      },
    ],
  },
  {
    race_id: 'demo-003',
    topic: 'IDE panel render cost on cold open (race demo)',
    status: 'complete',
    started_at: '2026-05-07T07:00:00Z',
    updated_at: '2026-05-07T07:12:00Z',
    winner_node_id: 'mac2',
    outcome_summary: 'mac2 won — diff merged, evidence chain intact',
    participants: [
      {
        node_id: 'mac1',
        branch: 'race/2026-05-07-coldopen-A',
        phase: 'done',
        score: 0.55,
        preview: 'Memoised heavy components',
      },
      {
        node_id: 'mac2',
        branch: 'race/2026-05-07-coldopen-B',
        phase: 'done',
        score: 0.84,
        preview: 'Defer non-critical theaters via dynamic import',
      },
      {
        node_id: 'mac3',
        branch: 'race/2026-05-07-coldopen-C',
        phase: 'done',
        score: 0.72,
        preview: 'Trim panel-loader manifest',
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

function ParticipantPill({
  p,
  isWinner,
}: {
  p: RaceParticipant;
  isWinner: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-[160px] flex-col gap-0.5 rounded-md border px-2 py-1.5 font-mono',
        PARTICIPANT_ACCENT[p.phase],
        isWinner && 'ring-1 ring-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.4)]',
      )}
      title={p.branch ?? p.node_id}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          <span className="text-[11px] font-semibold tracking-wide">{p.node_id}</span>
          {isWinner && <Trophy className="h-3 w-3 text-emerald-300" />}
        </span>
        <span className="text-[9px] uppercase">{PARTICIPANT_PHASE_LABEL[p.phase]}</span>
      </div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        {p.score != null ? `score ${p.score.toFixed(2)}` : '—'}
      </div>
      {p.preview && (
        <div className="text-[10px] leading-snug text-foreground/80 line-clamp-2">
          {p.preview}
        </div>
      )}
    </div>
  );
}

function RaceRow({ race }: { race: RaceEntry }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/30 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold">{race.topic}</div>
          <div className="text-[10px] text-muted-foreground">
            id: {race.race_id}
            {race.started_at && (
              <span className="ml-2">started: {race.started_at}</span>
            )}
          </div>
        </div>
        <StatusPill status={race.status} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {race.participants.map((p) => (
          <ParticipantPill
            key={`${race.race_id}:${p.node_id}`}
            p={p}
            isWinner={race.winner_node_id === p.node_id}
          />
        ))}
      </div>
      {race.outcome_summary && (
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
   * Optional pre-seeded status for tests / demo mode. When omitted the panel
   * uses `EMPTY_RACE_STATUS` and exposes a Demo toggle that swaps in three
   * hardcoded sample races (mac1 / mac2 / mac3 racing a fictional bug fix).
   *
   * Y-batch will replace this prop with a `useEffect` that polls
   * `/api/race/status` + subscribes to `race:*` events.
   */
  initialStatus?: RaceStatusResponse;
}

export function RaceTheater({ className, initialStatus }: RaceTheaterProps) {
  const [demo, setDemo] = useState(false);

  // Source resolution:
  //   - if caller passed `initialStatus`, honor it (test / storybook path),
  //   - else when demo mode is on, render `DEMO_STATUS`,
  //   - else render the empty state.
  const status = useMemo<RaceStatusResponse>(() => {
    if (initialStatus) return initialStatus;
    return demo ? DEMO_STATUS : EMPTY_RACE_STATUS;
  }, [initialStatus, demo]);

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
        {/* Demo toggle — visible until Y-batch ships real wiring. Operators can
            see the intended layout without waiting for the fleet bridge. */}
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
          >
            {demo ? 'Demo: on' : 'Demo'}
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="rounded border border-dashed border-border/50 bg-background/20 p-4 text-center">
          <div className="text-[12px] font-semibold text-foreground/80">No active races</div>
          <div className="mt-1 text-[10px] italic text-muted-foreground">
            Kick one off with{' '}
            <code className="rounded bg-background/40 px-1 py-0.5 font-mono">
              fleet_race &lt;topic&gt;
            </code>{' '}
            (Y-batch will wire live data via the fleet bridge).
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {status.races.map((race) => (
            <RaceRow key={race.race_id} race={race} />
          ))}
        </div>
      )}

      <div className="mt-2 text-[9px] uppercase tracking-wider text-muted-foreground">
        scaffold · X5 · race:* namespace · live wiring lands in Y-batch
      </div>
    </div>
  );
}

export default RaceTheater;
