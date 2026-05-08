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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EMPTY_HIRE_RESPONSE,
  HIRE_CONTACT_LIMITS,
  HIRE_STATUS_COLOR,
  HIRE_STATUS_LABEL,
  type HireContactResponse,
  type HireEngagementResponse,
  type HireStatus,
} from '@/lib/ide/hire-panel-types';

const POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Monetization feature flag (KK3, 2026-05-08)
//
// `NEXT_PUBLIC_HIRE_MONETIZATION` is read at build time by Next.js and
// inlined into the client bundle. When unset / '0' / 'false' the panel
// renders byte-for-byte identical to the EE1 scaffold (no contact form,
// no Stripe button, no extra DOM nodes).
//
// `NEXT_PUBLIC_STRIPE_HIRE_PAYMENT_LINK` is the Stripe Payment Link URL.
// When absent the "Engage" button renders disabled with "Coming soon"
// — never produces a broken redirect.
// ---------------------------------------------------------------------------

function isMonetizationEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_HIRE_MONETIZATION;
  if (typeof raw !== 'string') return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function stripePaymentLink(): string | null {
  const raw = process.env.NEXT_PUBLIC_STRIPE_HIRE_PAYMENT_LINK;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Accept only https links — refuse to render a button that points
  // anywhere else, even if env-var was misconfigured.
  if (!trimmed.startsWith('https://')) return null;
  return trimmed;
}

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

// ---------------------------------------------------------------------------
// Contact form — feature-flag-gated. Renders nothing when the flag is off.
//
// On submit it POSTs to `/api/hire/contact`. Validation errors come back as
// per-field strings; success replaces the form with a thank-you state.
// ---------------------------------------------------------------------------

type ContactFieldErrors = Partial<
  Record<'name' | 'email' | 'scope_or_budget', string>
>;

type ContactFormProps = {
  engagementId: string;
};

function HireContactForm({ engagementId }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [scope, setScope] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<ContactFieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setErrors({});
      setGlobalError(null);
      try {
        const res = await fetch('/api/hire/contact', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            scope_or_budget: scope,
            engagement_id: engagementId,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | HireContactResponse
          | null;
        if (res.ok && json?.recorded) {
          setSubmitted(true);
          return;
        }
        if (json?.validation) setErrors(json.validation);
        setGlobalError(json?.error ?? `request failed (${res.status})`);
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [name, email, scope, submitting, engagementId],
  );

  if (submitted) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
        Thanks — your message is queued. Aaron will reply directly.
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit} noValidate>
      <div>
        <label
          htmlFor="hire-contact-name"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400"
        >
          Name
        </label>
        <input
          id="hire-contact-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={HIRE_CONTACT_LIMITS.NAME_MAX}
          className="w-full rounded-md border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/60"
          autoComplete="name"
        />
        {errors.name ? (
          <p className="mt-1 text-xs text-rose-300">{errors.name}</p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="hire-contact-email"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400"
        >
          Email
        </label>
        <input
          id="hire-contact-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          maxLength={HIRE_CONTACT_LIMITS.EMAIL_MAX}
          className="w-full rounded-md border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/60"
          autoComplete="email"
        />
        {errors.email ? (
          <p className="mt-1 text-xs text-rose-300">{errors.email}</p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="hire-contact-scope"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400"
        >
          Scope / budget
        </label>
        <textarea
          id="hire-contact-scope"
          value={scope}
          onChange={e => setScope(e.target.value)}
          maxLength={HIRE_CONTACT_LIMITS.SCOPE_OR_BUDGET_MAX}
          rows={5}
          className="w-full rounded-md border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400/60"
          placeholder="What you'd like Atlas to build, and a rough budget."
        />
        {errors.scope_or_budget ? (
          <p className="mt-1 text-xs text-rose-300">{errors.scope_or_budget}</p>
        ) : null}
      </div>

      {globalError ? (
        <p className="text-xs text-rose-300">{globalError}</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/40 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stripe stub — disabled "Coming soon" when the env var is unset.
// ---------------------------------------------------------------------------

function HireStripeStub() {
  const link = stripePaymentLink();
  if (!link) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Payment link not yet configured"
        className="inline-flex cursor-not-allowed items-center rounded-md bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-400 ring-1 ring-slate-600/40"
      >
        Engage — coming soon
      </button>
    );
  }
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center rounded-md bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/40 transition hover:bg-emerald-500/30"
    >
      Engage via Stripe
    </a>
  );
}

type HirePanelProps = {
  engagementId: string;
};

export function HirePanel({ engagementId }: HirePanelProps) {
  const [data, setData] = useState<HireEngagementResponse>(EMPTY_HIRE_RESPONSE);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  // Memoised so the flag is read once per render, not per JSX branch.
  const monetizationEnabled = useMemo(() => isMonetizationEnabled(), []);

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

      {monetizationEnabled ? (
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Engage Atlas
          </h2>
          <p className="mb-4 text-sm text-slate-300">
            Need a similar engagement? Send a brief or grab time directly.
          </p>
          <div className="mb-4">
            <HireStripeStub />
          </div>
          <div className="border-t border-slate-700/40 pt-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Or send a brief
            </h3>
            <HireContactForm engagementId={engagementId} />
          </div>
        </section>
      ) : null}

      <footer className="text-xs text-slate-500">
        This is a read-only view. Internal tooling, model details, and
        cost metrics are intentionally not displayed.
      </footer>
    </div>
  );
}

export default HirePanel;
