'use client';

// =============================================================================
// TribunalStrip — small read-only IDE strip for the Validation Tribunal
// (Z3 scaffold, 2026-05-07).
//
// Renders BELOW the existing CampaignTheater ledger summary as a compact
// strip of recent tribunal cases with verdict color-coded pills. NO
// open-case form (next-wave / write side). Polls /api/tribunal/cases every
// 15s; ZSF: every fetch failure increments `_tribunal_indicator_errors` on
// `window` so cardio sentinels can spot quiet breakage.
//
// Disjoint event namespace: tribunal:* (declared in
// `@/lib/ide/tribunal-types`). The next wave wires real-time push via the
// fleet event bridge; for now the 15s poll is sufficient.
//
// Reversibility: pure presentational component, no global side-effects
// beyond the error counter; one `git revert` removes it cleanly.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';

import {
  EMPTY_TRIBUNAL_RESPONSE,
  TRIBUNAL_VERDICT_COLOR,
  type TribunalCasesResponse,
  type TribunalEntry,
  type TribunalVerdictKind,
} from '@/lib/ide/tribunal-types';
import { cn } from '@/lib/utils';

const TRIBUNAL_ENDPOINT = '/api/tribunal/cases';
const TRIBUNAL_REFRESH_MS = 15000;
const TRIBUNAL_INDICATOR_ERROR_COUNTER_KEY = '_tribunal_indicator_errors';

function bumpTribunalIndicatorErrorCounter(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[TRIBUNAL_INDICATOR_ERROR_COUNTER_KEY] =
    (w[TRIBUNAL_INDICATOR_ERROR_COUNTER_KEY] ?? 0) + 1;
}

function tribunalVerdictPillClasses(verdict: TribunalVerdictKind): string {
  switch (TRIBUNAL_VERDICT_COLOR[verdict]) {
    case 'emerald':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'rose':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
    case 'amber':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    case 'slate':
      return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
    case 'violet':
    default:
      return 'border-violet-500/40 bg-violet-500/10 text-violet-200';
  }
}

export function TribunalStrip() {
  const [resp, setResp] = useState<TribunalCasesResponse>(
    EMPTY_TRIBUNAL_RESPONSE,
  );
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(TRIBUNAL_ENDPOINT, { cache: 'no-store' });
      if (!r.ok) {
        bumpTribunalIndicatorErrorCounter();
        return;
      }
      const data = (await r.json()) as TribunalCasesResponse;
      if (cancelledRef.current) return;
      setResp(data ?? EMPTY_TRIBUNAL_RESPONSE);
    } catch (err) {
      if (cancelledRef.current) return;
      bumpTribunalIndicatorErrorCounter();
      // ZSF: failure observable via counter; do NOT silent-swallow.
      console.warn('[TribunalStrip] fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    const initial = window.setTimeout(load, 0);
    const timer = window.setInterval(load, TRIBUNAL_REFRESH_MS);
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  const visibleCases: TribunalEntry[] = useMemo(
    () => (resp.cases ?? []).slice(0, 5),
    [resp.cases],
  );

  return (
    <div
      data-testid="campaign-theater-tribunal"
      className="mt-2 rounded border border-amber-500/30 bg-background/30 p-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <ShieldAlert className="w-3 h-3 text-amber-300" />
          <span>Validation Tribunal</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          open {resp.open_count} · decided {resp.decided_count}
        </span>
      </div>
      {visibleCases.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">
          No tribunal cases — disputed Race/Evidence outcomes will appear here.
          Run{' '}
          <code className="font-mono">
            python3 scripts/dump-tribunal-snapshot.py
          </code>{' '}
          to populate from the next-wave write side.
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {visibleCases.map((entry) => {
            const c = entry.case;
            const v = entry.verdict;
            return (
              <li
                key={c.case_id}
                className="flex items-baseline gap-2 text-[11px] leading-snug"
              >
                <span
                  className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0"
                  title={c.case_id}
                >
                  {c.case_id.slice(0, 14)}
                </span>
                <span
                  className="text-foreground/80 truncate flex-1"
                  title={`${c.race_id_or_evidence_id}\n${c.dispute_reason}`}
                >
                  {c.race_id_or_evidence_id.slice(0, 28)}
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground/80">
                    {c.dispute_reason.slice(0, 60)}
                  </span>
                </span>
                <span
                  className={cn(
                    'inline-flex shrink-0 rounded px-1 py-0.5 text-[9px] border uppercase tracking-wide',
                    v
                      ? tribunalVerdictPillClasses(v.verdict)
                      : 'border-border/60 bg-background/40 text-muted-foreground',
                  )}
                >
                  {v ? v.verdict : c.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default TribunalStrip;
