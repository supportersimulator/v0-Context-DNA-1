'use client';

// =============================================================================
// TruthLadder — vertical 6-rung evidence column (AA3 scaffold, 2026-05-07).
//
// Renders the Truth Ladder: a vertical stack of rungs running invariant (top)
// → speculation (bottom). Each rung is a small card showing the rung label,
// confidence floor, item count, and a no-op "View" link (next-wave wires the
// click through to the EvidenceLedger drilldown).
//
// Read-only consumer. Polls /api/truth-ladder/snapshot every 15s and seeds
// from EMPTY_TRUTH_LADDER_SNAPSHOT so the panel renders the 6-rung skeleton
// immediately — no spinner state.
//
// ZSF: every fetch failure increments `_truth_ladder_indicator_errors` on
// `window` so cardio sentinels can spot quiet breakage.
//
// Reversibility: pure presentational component, no global side-effects
// beyond the error counter; one `git revert` removes it cleanly.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';

import {
  EMPTY_TRUTH_LADDER_SNAPSHOT,
  TRUTH_RUNG_COLOR,
  TRUTH_RUNG_DISPLAY,
  type TruthLadderSnapshot,
  type TruthRung,
  type TruthRungLabel,
} from '@/lib/ide/truth-ladder-types';
import { cn } from '@/lib/utils';

const SNAPSHOT_ENDPOINT = '/api/truth-ladder/snapshot';
const REFRESH_MS = 15000;
const ERROR_COUNTER_KEY = '_truth_ladder_indicator_errors';

function bumpErrorCounter(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[ERROR_COUNTER_KEY] = (w[ERROR_COUNTER_KEY] ?? 0) + 1;
}

function rungBadgeClasses(label: TruthRungLabel): string {
  switch (TRUTH_RUNG_COLOR[label]) {
    case 'slate':
      return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
    case 'sky':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-200';
    case 'cyan':
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
    case 'emerald':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'amber':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    case 'violet':
    default:
      return 'border-violet-500/40 bg-violet-500/10 text-violet-200';
  }
}

export function TruthLadder() {
  const [snap, setSnap] = useState<TruthLadderSnapshot>(
    EMPTY_TRUTH_LADDER_SNAPSHOT,
  );
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(SNAPSHOT_ENDPOINT, { cache: 'no-store' });
      if (!r.ok) {
        bumpErrorCounter();
        return;
      }
      const data = (await r.json()) as TruthLadderSnapshot;
      if (cancelledRef.current) return;
      setSnap(data ?? EMPTY_TRUTH_LADDER_SNAPSHOT);
    } catch (err) {
      if (cancelledRef.current) return;
      bumpErrorCounter();
      // ZSF: failure observable via counter.
      console.warn('[TruthLadder] fetch failed:', err);
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

  // Render top→bottom: invariant first (highest), speculation last.
  const orderedTopDown: TruthRung[] = useMemo(
    () => [...(snap.rungs ?? [])].reverse(),
    [snap.rungs],
  );

  const totalItems = useMemo(
    () => orderedTopDown.reduce((acc, r) => acc + (r.item_count ?? 0), 0),
    [orderedTopDown],
  );

  return (
    <div
      data-testid="truth-ladder"
      className="rounded border border-violet-500/30 bg-background/30 p-3 flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Layers className="w-3.5 h-3.5 text-violet-300" />
          <span>Truth Ladder</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {totalItems === 0
            ? snap.source === 'no-snapshot'
              ? 'no snapshot'
              : 'empty'
            : `${totalItems} items`}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {orderedTopDown.map((rung) => (
          <li
            key={rung.label}
            className={cn(
              'flex items-center justify-between gap-2 rounded border px-2.5 py-1.5',
              rungBadgeClasses(rung.label),
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono opacity-70 tabular-nums shrink-0">
                #{rung.rung_index}
              </span>
              <span className="text-[12px] font-semibold truncate">
                {TRUTH_RUNG_DISPLAY[rung.label]}
              </span>
              <span className="text-[10px] opacity-60 tabular-nums shrink-0">
                ≥ {rung.confidence_floor.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono tabular-nums opacity-90">
                {rung.item_count}
              </span>
              <button
                type="button"
                disabled
                title="Drilldown wired in next wave"
                className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 border border-current/30 bg-background/30 opacity-60 cursor-not-allowed"
              >
                View
              </button>
            </div>
          </li>
        ))}
      </ul>

      {totalItems === 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground italic">
          No evidence on the ladder yet — promotions will appear as records
          accumulate redundancy and cross-model agreement.
        </div>
      )}
    </div>
  );
}

export default TruthLadder;
