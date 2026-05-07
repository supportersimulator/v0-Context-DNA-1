'use client';

// =============================================================================
// HumanArbiter — Aaron's tiebreak panel for unresolved disputes
// (AA3 scaffold, 2026-05-07).
//
// Renders the list of OPEN arbiter cases needing Aaron's input. Each case is
// a card with the dispute summary plus 5 verdict buttons:
//   APPROVE / OVERTURN / REMAND / DISMISS / DEFER
//
// On click, the panel POSTs to `/api/arbiter/verdict`. The route is a stub
// in this slot — it returns `{recorded: true, evidence_record_id: null,
// note: "wiring next wave"}`. The IDE renders the "wiring next wave"
// indicator and clears the case from the open list optimistically until the
// next /api/arbiter/cases poll arrives.
//
// Read side: polls /api/arbiter/cases every 15s. Empty state: "No cases
// needing arbitration." — disjoint from the no-snapshot path.
//
// ZSF: every fetch failure increments `_arbiter_indicator_errors`; every
// verdict POST failure increments `_arbiter_verdict_post_errors`.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Gavel } from 'lucide-react';

import {
  ARBITER_VERDICT_COLOR,
  ARBITER_VERDICT_ORDER,
  EMPTY_ARBITER_CASES_RESPONSE,
  type ArbiterCase,
  type ArbiterCasesResponse,
  type ArbiterVerdict,
  type ArbiterVerdictRequest,
  type ArbiterVerdictResponse,
} from '@/lib/ide/human-arbiter-types';
import { cn } from '@/lib/utils';

const CASES_ENDPOINT = '/api/arbiter/cases';
const VERDICT_ENDPOINT = '/api/arbiter/verdict';
const REFRESH_MS = 15000;
const FETCH_ERROR_COUNTER_KEY = '_arbiter_indicator_errors';
const POST_ERROR_COUNTER_KEY = '_arbiter_verdict_post_errors';

function bumpFetchErrorCounter(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[FETCH_ERROR_COUNTER_KEY] = (w[FETCH_ERROR_COUNTER_KEY] ?? 0) + 1;
}

function bumpPostErrorCounter(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[POST_ERROR_COUNTER_KEY] = (w[POST_ERROR_COUNTER_KEY] ?? 0) + 1;
}

function verdictButtonClasses(v: ArbiterVerdict, busy: boolean): string {
  const palette = ARBITER_VERDICT_COLOR[v];
  const base =
    'rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors';
  switch (palette) {
    case 'emerald':
      return cn(
        base,
        'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
        busy && 'opacity-50 cursor-wait',
      );
    case 'rose':
      return cn(
        base,
        'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
        busy && 'opacity-50 cursor-wait',
      );
    case 'amber':
      return cn(
        base,
        'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
        busy && 'opacity-50 cursor-wait',
      );
    case 'sky':
      return cn(
        base,
        'border-sky-500/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20',
        busy && 'opacity-50 cursor-wait',
      );
    case 'slate':
    default:
      return cn(
        base,
        'border-slate-500/40 bg-slate-500/10 text-slate-200 hover:bg-slate-500/20',
        busy && 'opacity-50 cursor-wait',
      );
  }
}

export function HumanArbiter() {
  const [resp, setResp] = useState<ArbiterCasesResponse>(
    EMPTY_ARBITER_CASES_RESPONSE,
  );
  const [busyCaseId, setBusyCaseId] = useState<string | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(CASES_ENDPOINT, { cache: 'no-store' });
      if (!r.ok) {
        bumpFetchErrorCounter();
        return;
      }
      const data = (await r.json()) as ArbiterCasesResponse;
      if (cancelledRef.current) return;
      setResp(data ?? EMPTY_ARBITER_CASES_RESPONSE);
    } catch (err) {
      if (cancelledRef.current) return;
      bumpFetchErrorCounter();
      console.warn('[HumanArbiter] fetch failed:', err);
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

  const openCases = useMemo<ArbiterCase[]>(
    () => (resp.cases ?? []).filter((c) => c.status === 'open'),
    [resp.cases],
  );

  const submitVerdict = useCallback(
    async (caseId: string, verdict: ArbiterVerdict) => {
      if (busyCaseId) return;
      setBusyCaseId(caseId);
      setLastNote(null);
      try {
        const body: ArbiterVerdictRequest = { case_id: caseId, verdict };
        const r = await fetch(VERDICT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        const data = (await r.json()) as ArbiterVerdictResponse;
        if (!r.ok || !data.recorded) {
          bumpPostErrorCounter();
          setLastNote(data.error ?? `verdict POST failed (HTTP ${r.status})`);
          return;
        }
        setLastNote(data.note ?? 'verdict recorded');
        // Optimistic — drop the case until the next poll repopulates.
        setResp((prev) => ({
          ...prev,
          cases: (prev.cases ?? []).filter((c) => c.case_id !== caseId),
          open_count: Math.max(0, (prev.open_count ?? 1) - 1),
        }));
      } catch (err) {
        bumpPostErrorCounter();
        setLastNote(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelledRef.current) setBusyCaseId(null);
      }
    },
    [busyCaseId],
  );

  return (
    <div
      data-testid="human-arbiter"
      className="rounded border border-amber-500/30 bg-background/30 p-3 flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Gavel className="w-3.5 h-3.5 text-amber-300" />
          <span>Human Arbiter</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          open {resp.open_count} · decided {resp.decided_count}
        </span>
      </div>

      {openCases.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">
          No cases needing arbitration. Disputes that go UNRESOLVED at the
          tribunal escalate here for Aaron&apos;s tiebreak.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {openCases.map((c) => {
            const busy = busyCaseId === c.case_id;
            return (
              <li
                key={c.case_id}
                className="rounded border border-border/60 bg-background/40 p-2 flex flex-col gap-1.5"
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0"
                    title={c.case_id}
                  >
                    {c.case_id.slice(0, 18)}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
                    {c.source}:{c.source_id.slice(0, 14)}
                  </span>
                </div>
                <div
                  className="text-[12px] leading-snug text-foreground/90"
                  title={c.dispute_summary}
                >
                  {c.dispute_summary}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ARBITER_VERDICT_ORDER.map((v) => (
                    <button
                      key={v}
                      type="button"
                      disabled={busy}
                      onClick={() => submitVerdict(c.case_id, v)}
                      className={verdictButtonClasses(v, busy)}
                      title={`Record verdict: ${v}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lastNote && (
        <div className="mt-2 text-[10px] text-muted-foreground italic">
          {lastNote}
        </div>
      )}
    </div>
  );
}

export default HumanArbiter;
