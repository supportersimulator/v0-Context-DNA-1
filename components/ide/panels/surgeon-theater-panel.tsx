'use client';

// =============================================================================
// SurgeonTheaterPanel — live cross-examination & dissent feed.
//
// Wraps the multifleet/theatrical/surgeon_feed.py component (data shape
// preserved). Renders disagreements as first-class with surgeon_a vs
// surgeon_b positions side-by-side. Pulses on every fresh frame so the
// stranger-test ("can a 5-second screenshot tell ContextDNA apart from
// Cursor?") is satisfied.
//
// Vision: docs/vision-alignment-2026-04-26.md §I1 ("Single-shot consult
// contradicts P1 + P4. The IDE doesn't render any of [the dissent]."). This
// panel is the direct fix for the #1 inversion called out in the audit.
//
// DDD5 (2026-05-12): applies three Superset-inspired UX patterns as the
// IDE reference panel (BBB5 audit move #2):
//   1. Tab rail (Superset nav)  — Live | Decisions | Surgeons
//   2. Metric chips (Superset slice-header chips) — consensus / dissent / cost
//   3. Slice cards (Superset chart-card chrome) — DisagreementCard adopts the
//      slice header / body / footer split.
// Tokens live in `lib/ide/superset-tokens.ts`. Behavior unchanged.
// =============================================================================

import { useMemo, useState } from 'react';
import { Brain, Heart, Sparkles, AlertTriangle, Radio, RotateCw, Activity, MessageSquare, Gavel } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  CHIP_BASE,
  CHIP_INTENT,
  RAIL,
  SLICE,
  type ChipIntent,
} from '@/lib/ide/superset-tokens';
import {
  useTheatricalData,
  type SurgeonDecisionPoint,
  type SurgeonDisagreement,
  type SurgeonFeedSnapshot,
  type SurgeonStatusMap,
} from '@/lib/hooks/use-theatrical-data';

// ─── Surgeon identity ───────────────────────────────────────────────────────

const SURGEON_ICON = {
  atlas: Brain,
  cardiologist: Heart,
  neurologist: Sparkles,
} as const;

const SURGEON_COLOR = {
  atlas: 'text-sky-400',
  cardiologist: 'text-rose-400',
  neurologist: 'text-fuchsia-400',
} as const;

const SURGEON_BG = {
  atlas: 'bg-sky-500/10 border-sky-500/30',
  cardiologist: 'bg-rose-500/10 border-rose-500/30',
  neurologist: 'bg-fuchsia-500/10 border-fuchsia-500/30',
} as const;

type SurgeonName = keyof typeof SURGEON_ICON;
const SURGEON_ORDER: SurgeonName[] = ['atlas', 'cardiologist', 'neurologist'];

// ─── Superset-style tab rail ────────────────────────────────────────────────
// Translates Superset's left-rail (Datasets/Charts/Dashboards) into the
// SurgeonTheater context: Live (dissent feed) | Decisions | Surgeons.
type TabKey = 'live' | 'decisions' | 'surgeons';
const TABS: ReadonlyArray<{ key: TabKey; label: string; Icon: typeof Activity }> = [
  { key: 'live', label: 'Live', Icon: Radio },
  { key: 'decisions', label: 'Decisions', Icon: Gavel },
  { key: 'surgeons', label: 'Surgeons', Icon: MessageSquare },
];

function isLive(status: string | undefined): boolean {
  if (!status) return false;
  return ['ok', 'online', 'active', 'configured'].includes(status);
}

// ─── Superset slice-style metric chip ───────────────────────────────────────
function MetricChip({
  intent,
  value,
  label,
  pulse = false,
  title,
}: {
  intent: ChipIntent;
  value: number | string;
  label: string;
  pulse?: boolean;
  title?: string;
}) {
  const palette = CHIP_INTENT[intent];
  return (
    <span
      className={cn(CHIP_BASE, palette.wrap, pulse && 'animate-pulse')}
      title={title}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', palette.dot)} />
      <span className="font-semibold">{value}</span>
      <span className="opacity-70 uppercase tracking-wider">{label}</span>
    </span>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SurgeonBadge({ name, status }: { name: SurgeonName; status: string | undefined }) {
  const Icon = SURGEON_ICON[name];
  const live = isLive(status);
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded border text-[11px]',
        SURGEON_BG[name],
        !live && 'opacity-60',
      )}
      title={`${name}: ${status ?? 'unknown'}`}
    >
      <Icon className={cn('h-3.5 w-3.5', SURGEON_COLOR[name])} />
      <span className={cn('font-medium capitalize', SURGEON_COLOR[name])}>{name}</span>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          live ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500',
        )}
      />
    </div>
  );
}

function StatusRow({ surgeons }: { surgeons: SurgeonStatusMap | undefined }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SURGEON_ORDER.map((name) => (
        <SurgeonBadge key={name} name={name} status={surgeons?.[name]} />
      ))}
    </div>
  );
}

function formatRelativeTime(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  const diffS = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86_400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86_400)}d ago`;
}

function resolutionIntent(resolution: string | undefined): ChipIntent {
  switch (resolution) {
    case 'blocked':
      return 'dissent';
    case 'changed':
    case 'altered':
      return 'warn';
    case 'proceeded':
    case 'approved':
      return 'agree';
    default:
      return 'neutral';
  }
}

// ─── DisagreementCard — Superset slice-card chrome (header / body / footer) ─
function DisagreementCard({ d }: { d: SurgeonDisagreement }) {
  const intent = resolutionIntent(d.resolution);
  const palette = CHIP_INTENT[intent];
  return (
    <div className={cn(SLICE.container, 'border-l-2', palette.wrap.split(' ').find((c) => c.startsWith('border-')))}>
      <div className={SLICE.header}>
        <span className={SLICE.title}>
          <AlertTriangle className="h-3 w-3" />
          {d.topic ?? 'untitled'}
        </span>
        <MetricChip
          intent={intent}
          value={d.resolution ?? 'pending'}
          label="state"
          title={`Resolution: ${d.resolution ?? 'pending'}`}
        />
      </div>

      <div className={SLICE.body}>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded bg-black/30 px-1.5 py-1 border border-white/5">
            <div className="text-[9px] uppercase tracking-wider opacity-60 mb-0.5">A</div>
            <div className="text-[11px] leading-snug font-mono break-words text-zinc-200">
              {d.surgeon_a_position ?? '—'}
            </div>
          </div>
          <div className="rounded bg-black/30 px-1.5 py-1 border border-white/5">
            <div className="text-[9px] uppercase tracking-wider opacity-60 mb-0.5">B</div>
            <div className="text-[11px] leading-snug font-mono break-words text-zinc-200">
              {d.surgeon_b_position ?? '—'}
            </div>
          </div>
        </div>
      </div>

      <div className={SLICE.footer}>
        <span>{d.id != null ? `#${d.id}` : '#—'}</span>
        <span>{formatRelativeTime(d.ts)}</span>
      </div>
    </div>
  );
}

function DecisionRow({ dp }: { dp: SurgeonDecisionPoint }) {
  const changed = dp.changed === true;
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px]',
        'border',
        changed
          ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300',
      )}
    >
      <span className="flex items-center gap-1.5 truncate">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            changed ? 'bg-amber-400' : 'bg-zinc-500',
          )}
        />
        <span className="truncate font-mono">{dp.context ?? 'untitled'}</span>
      </span>
      <span className="text-[10px] opacity-70 shrink-0">
        {formatRelativeTime(dp.ts)}
      </span>
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function SurgeonTheaterPanel() {
  const { data, transport, tick, ageMs, error, isLoading } = useTheatricalData();
  const [activeTab, setActiveTab] = useState<TabKey>('live');

  const surgeonFeed: SurgeonFeedSnapshot | undefined = data?.components?.surgeon_feed;
  const surgeons = surgeonFeed?.surgeons;
  const rawDisagreements = surgeonFeed?.disagreements;
  const rawDecisionPoints = surgeonFeed?.decision_points;
  const disagreements = useMemo(() => rawDisagreements ?? [], [rawDisagreements]);
  const decisionPoints = useMemo(() => rawDecisionPoints ?? [], [rawDecisionPoints]);
  const crossExamCount = surgeonFeed?.cross_exams?.length ?? 0;
  const rebuttalCount = surgeonFeed?.rebuttals?.length ?? 0;

  const dissentCount = disagreements.length;
  const blockedCount = useMemo(
    () => disagreements.filter((d) => d.resolution === 'blocked').length,
    [disagreements],
  );
  const agreeCount = useMemo(
    () => disagreements.filter((d) => d.resolution === 'approved' || d.resolution === 'proceeded').length,
    [disagreements],
  );

  const headerPulse = tick > 0;
  const transportLabel =
    transport === 'sse' ? 'live · SSE' : transport === 'poll' ? 'live · poll' : 'idle';

  return (
    <div className="h-full overflow-auto bg-zinc-950/40 text-zinc-100">
      {/* Header — title + transport + tick */}
      <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <Radio
              className={cn(
                'h-3.5 w-3.5 text-emerald-400',
                headerPulse && 'animate-pulse',
              )}
            />
            <h2 className="text-sm font-semibold">Surgeon Theater</h2>
            <span
              className={cn(
                'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                transport === 'idle'
                  ? 'bg-zinc-800 text-zinc-400'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
              )}
              title={ageMs == null ? '—' : `last frame ${Math.round(ageMs / 1000)}s ago`}
            >
              {transportLabel}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <RotateCw className={cn('h-3 w-3', headerPulse && 'animate-spin')} />
            <span>tick {tick}</span>
          </div>
        </div>

        {/* Superset-style metric chip ribbon */}
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          <MetricChip
            intent="neutral"
            value={crossExamCount}
            label="cross-exams"
            title="Total cross-examinations this session"
          />
          <MetricChip
            intent="neutral"
            value={rebuttalCount}
            label="rebuttals"
            title="Total rebuttals exchanged"
          />
          <MetricChip
            intent={dissentCount > 0 ? 'dissent' : 'neutral'}
            value={dissentCount}
            label={blockedCount > 0 ? `dissent · ${blockedCount} blk` : 'dissent'}
            pulse={dissentCount > 0}
            title="Disagreements ARE the feature"
          />
          {agreeCount > 0 && (
            <MetricChip
              intent="agree"
              value={agreeCount}
              label="approved"
              title="Resolved by approval / proceed"
            />
          )}
        </div>

        {/* Superset-style tab rail */}
        <div className={RAIL.bar}>
          {TABS.map(({ key, label, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(RAIL.tabBase, active ? RAIL.tabActive : RAIL.tabIdle)}
                aria-pressed={active}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
                {key === 'live' && dissentCount > 0 && (
                  <span
                    className={cn(
                      'ml-1 px-1 rounded-sm text-[9px] tabular-nums',
                      'bg-rose-500/20 text-rose-200 border border-rose-500/40',
                    )}
                  >
                    {dissentCount}
                  </span>
                )}
                {key === 'decisions' && decisionPoints.length > 0 && (
                  <span className="ml-1 px-1 rounded-sm text-[9px] tabular-nums bg-zinc-700/60 text-zinc-200">
                    {decisionPoints.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200">
            Daemon: {error}
          </div>
        )}

        {isLoading && !error && (
          <div className="text-[11px] text-zinc-500">Awaiting first frame…</div>
        )}

        {activeTab === 'live' && (
          <section>
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
              Live Disagreements
            </div>
            {disagreements.length === 0 ? (
              <div className="rounded border border-dashed border-zinc-800 px-3 py-4 text-center text-[11px] text-zinc-500">
                No active dissent. (Disagreements ARE the feature — surfacing nothing
                to disagree about means the system is genuinely aligned right now.)
              </div>
            ) : (
              <div className="space-y-1.5">
                {disagreements.slice(0, 8).map((d, i) => (
                  <DisagreementCard key={d.id ?? `${d.ts}-${i}`} d={d} />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'decisions' && (
          <section>
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
              Recent Decision Points
            </div>
            {decisionPoints.length === 0 ? (
              <div className="text-[11px] text-zinc-500">No decisions yet this session.</div>
            ) : (
              <div className="space-y-1">
                {decisionPoints.slice(0, 12).map((dp, i) => (
                  <DecisionRow key={`${dp.ts}-${i}`} dp={dp} />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'surgeons' && (
          <section>
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
              Surgeon Status
            </div>
            <StatusRow surgeons={surgeons} />
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-500">
              <Activity className="h-3 w-3" />
              Live indicator: ok / online / active / configured
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
