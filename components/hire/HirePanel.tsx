'use client';

// =============================================================================
// HirePanel — CLIENT-FACING engagement view (EE1 Phase-12 scaffold, 2026-05-07).
//
// This component is INTENTIONALLY OUTSIDE `components/dashboard/` to make
// it visually obvious that it's NOT an internal panel. It renders at
// `app/hire/[engagement_id]/page.tsx` — clients who hire Aaron get a URL
// like `https://admin.contextdna.io/hire/<engagement_id>` and see only:
//
//   - Banner with `client_name`
//   - Status pill (scoping / coding / reviewing / shipping / complete)
//   - One-line current task
//   - Last 5 milestones (timestamp + description)
//   - Deliverables list
//   - "Last updated" relative time
//
// NO admin internals — no surgeon panels, no permissions, no cluster
// status, no race ledger. The Python redactor strips internal fields
// before they reach this component; the route enforces the allowlist a
// second time. This component then renders only what the wire shape
// declares.
//
// ZSF: every fetch failure increments `_hire_panel_fetch_errors` on
// `window` so cardio sentinels can spot quiet breakage. The counter is
// monotonic for the lifetime of the page session.
//
// Reversibility: pure presentational + a 30s poll. No global side-effects
// beyond the window error counter; one `git revert` removes it cleanly.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  EMPTY_HIRE_RESPONSE,
  HIRE_STATUS_COLOR,
  HIRE_STATUS_LABEL,
  type HireEngagementResponse,
  type HireStatus,
} from '@/lib/ide/hire-panel-types';

const POLL_INTERVAL_MS = 30_000;

declare global {
  interface Window {
    _hire_panel_fetch_errors?: number;
  }
}

function bumpHirePanelFetchErrors(): void {
  if (typeof window === 'undefined') return;
  const cur = typeof window._hire_panel_fetch_errors === 'number'
    ? window._hire_panel_fetch_errors
    : 0;
  window._hire_panel_fetch_errors = cur + 1;
}

function statusPillClasses(status: HireStatus): string {
  const color = HIRE_STATUS_COLOR[status] ?? 'slate';
  // Tailwind classes intentionally listed explicitly so the JIT picks them up.
  switch (color) {
    case 'sky':
      return 'bg-sky-500/15 text-sky-300 ring-sky-400/40';
    case 'emerald':
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/40';
    case 'amber':
      return 'bg-amber-500/15 text-amber-300 ring-amber-400/40';
    case 'violet':
      return 'bg-violet-500/15 text-violet-300 ring-violet-400/40';
    case 'slate':
    default:
      return 'bg-slate-500/15 text-slate-300 ring-slate-400/40';
  }
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'no activity yet';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type HirePanelProps = {
  engagementId: string;
};

export function HirePanel({ engagementId }: HirePanelProps) {
  const [data, setData] = useState<HireEngagementResponse>(EMPTY_HIRE_RESPONSE);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/hire/${encodeURIComponent(engagementId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        bumpHirePanelFetchErrors();
        return;
      }
      const json = (await res.json()) as HireEngagementResponse;
      if (mountedRef.current) {
        setData(json);
      }
    } catch {
      bumpHirePanelFetchErrors();
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load]);

  const engagement = data.engagement;

  if (loading && !engagement) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-6 text-slate-300">
        Loading engagement...
      </div>
    );
  }

  if (!engagement) {
    return (
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-6 text-slate-300">
        <h2 className="text-lg font-semibold text-slate-100">
          No active engagement
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Atlas has not started work on this engagement yet, or the
          engagement id is unknown. If you believe this is a mistake,
          please reach out to support@ersimulator.com.
        </p>
      </div>
    );
  }

  // Last 5 milestones, newest first.
  const recentMilestones = [...engagement.milestones]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Engagement
            </p>
            <h1 className="text-2xl font-semibold text-slate-100">
              {engagement.atlas_actor} is working on{' '}
              <span className="text-emerald-300">{engagement.client_name}</span>
              {"'s engagement"}
            </h1>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${statusPillClasses(
              engagement.status,
            )}`}
          >
            {HIRE_STATUS_LABEL[engagement.status]}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Current task:</span>{' '}
          {engagement.current_task || '(no task description yet)'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Last updated: {formatRelativeTime(engagement.last_updated_at)}
        </p>
      </header>

      <section className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Recent milestones
        </h2>
        {recentMilestones.length === 0 ? (
          <p className="text-sm text-slate-400">
            No milestones recorded yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {recentMilestones.map((m, i) => (
              <li
                key={`${m.timestamp}-${i}`}
                className="border-l-2 border-emerald-500/40 pl-4"
              >
                <p className="text-sm text-slate-200">{m.description}</p>
                <p className="text-xs text-slate-500">
                  {formatRelativeTime(m.timestamp)} ({m.timestamp})
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Deliverables
        </h2>
        {engagement.deliverables.length === 0 ? (
          <p className="text-sm text-slate-400">No deliverables defined yet.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm text-slate-200">
            {engagement.deliverables.map((d, i) => (
              <li key={`${d}-${i}`}>{d}</li>
            ))}
          </ul>
        )}
      </section>

      <footer className="text-xs text-slate-500">
        This is a read-only view. Internal tooling, model details, and
        cost metrics are intentionally not displayed.
      </footer>
    </div>
  );
}

export default HirePanel;
