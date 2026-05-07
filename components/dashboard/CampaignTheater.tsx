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
  CheckCircle2,
  Cpu,
  EyeOff,
  FileCheck,
  Flag,
  Gauge,
  ListChecks,
  PlusCircle,
  ShieldAlert,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useIDEEvent } from '@/lib/ide/event-bus';
import {
  EMPTY_STATUS,
  type CompetitionStatus,
  type EvidenceLedgerAppendResponse,
  type EvidenceLedgerEventType,
  type EvidenceLedgerRedactResponse,
  type LedgerSummaryEntry,
  type SubmissionCandidate,
} from '@/lib/ide/campaign-types';
import {
  EMPTY_PERMISSION_MAP,
  topDeniedCapabilities,
  type PermissionMap,
  type PermissionStatus,
} from '@/lib/ide/permission-types';
import {
  EMPTY_TRIBUNAL_RESPONSE,
  TRIBUNAL_VERDICT_COLOR,
  type TribunalCasesResponse,
  type TribunalEntry,
  type TribunalVerdictKind,
} from '@/lib/ide/tribunal-types';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const DEFAULT_REFRESH_MS = 5000;
const DEFAULT_ENDPOINT = '/api/competition/status';
const ERROR_COUNTER_KEY = '_campaign_theater_errors';
const APPEND_ENDPOINT = '/api/evidence-ledger/append';
const APPEND_ERROR_COUNTER_KEY = '_evidence_append_form_errors';
const APPEND_HISTORY_LIMIT = 5;

// W1.b — post-hoc redact endpoint (Phase-5).
const REDACT_ENDPOINT = '/api/evidence-ledger/redact';
const REDACT_ERROR_COUNTER_KEY = '_evidence_redact_errors';

// Z2 — permission map indicator (read-only pill row).
// SCAFFOLD: shows the top 3 capabilities by deny-count from the latest
// PermissionGovernor snapshot. Z3+ will add a write/grant UI; here we render
// nothing more than a read-only signal so operators can see "is the governor
// gating anything?" at a glance.
const PERMISSION_ENDPOINT = '/api/permissions/current';
const PERMISSION_REFRESH_MS = 15000; // permissions move slowly; polling fast wastes cycles
const PERMISSION_INDICATOR_ERROR_COUNTER_KEY = '_permission_indicator_errors';
const PERMISSION_INDICATOR_TOP_N = 3;

// W1.b — restricted vocabulary mirrors V1's `EVENT_TYPE_TO_KIND` map in
// `scripts/append-evidence-ledger.py`. Expanding this list is a coordinated
// change between the route + the form.
const APPEND_EVENT_TYPES: readonly EvidenceLedgerEventType[] = [
  'experiment',
  'competition',
  'trial',
  'decision',
  'audit',
  'outcome',
] as const;

// Branch labels for the ZSF counter — every failure path picks one.
type AppendErrorBranch = 'validation' | 'network' | 'server-5xx';

interface AppendHistoryItem {
  record_id: string;
  sha256: string;
  redacted_count: number;
  event_type: EvidenceLedgerEventType;
  subject: string;
  actor: string;
  appended_at: string;
  /** Set when V1's stub responded (parallel-build sentinel only). */
  stub?: boolean;
}

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

function bumpAppendErrorCounter(branch: AppendErrorBranch): void {
  if (typeof window === 'undefined') return;
  // ZSF: every append failure increments BOTH a global counter and a
  // per-branch sub-counter so cardio sentinels can see "is the form
  // failing on the network or on the server?" without re-reading logs.
  const w = window as unknown as Record<string, unknown>;
  const total = (w[APPEND_ERROR_COUNTER_KEY] as number | undefined) ?? 0;
  w[APPEND_ERROR_COUNTER_KEY] = total + 1;
  const subKey = `${APPEND_ERROR_COUNTER_KEY}_${branch}`;
  const sub = (w[subKey] as number | undefined) ?? 0;
  w[subKey] = sub + 1;
}

function getAppendErrorCounter(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as unknown as Record<string, number>;
  return w[APPEND_ERROR_COUNTER_KEY] ?? 0;
}

function bumpRedactErrorCounter(branch: AppendErrorBranch): void {
  if (typeof window === 'undefined') return;
  // ZSF: every redact failure increments BOTH a global counter and a
  // per-branch sub-counter so cardio sentinels can see "is the redact
  // failing on the network or on the server?" without re-reading logs.
  const w = window as unknown as Record<string, unknown>;
  const total = (w[REDACT_ERROR_COUNTER_KEY] as number | undefined) ?? 0;
  w[REDACT_ERROR_COUNTER_KEY] = total + 1;
  const subKey = `${REDACT_ERROR_COUNTER_KEY}_${branch}`;
  const sub = (w[subKey] as number | undefined) ?? 0;
  w[subKey] = sub + 1;
}

function getRedactErrorCounter(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as unknown as Record<string, number>;
  return w[REDACT_ERROR_COUNTER_KEY] ?? 0;
}

// Z2 — ZSF: every permission fetch failure increments a window-scoped counter
// so cardio sentinels can see "is the indicator quietly broken?" without
// reading network logs.
function bumpPermissionIndicatorError(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, number>;
  w[PERMISSION_INDICATOR_ERROR_COUNTER_KEY] =
    (w[PERMISSION_INDICATOR_ERROR_COUNTER_KEY] ?? 0) + 1;
}

function getPermissionIndicatorErrorCount(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as unknown as Record<string, number>;
  return w[PERMISSION_INDICATOR_ERROR_COUNTER_KEY] ?? 0;
}

// Best-effort POST into the IDE log buffer. Server-side ring buffer lives
// behind /api/logs/append; this is the same channel used by the rest of the
// dashboard so cardio + log viewers see append failures inline. The fetch is
// fire-and-forget — errors here MUST NOT cascade back into the caller.
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
      source: 'evidence-append-form',
      msg,
      detail,
    }),
  }).catch((err) => {
    // ZSF: don't silently swallow — surface in console with append counter.
    console.warn(
      '[CampaignTheater] logToIDE failed (append_errors=%d): %s',
      getAppendErrorCounter(),
      err instanceof Error ? err.message : String(err),
    );
  });
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
// Append-Evidence form (W1.b)
//
// Small admin WRITE surface for the EvidenceLedger. Lives UNDER the existing
// ledger summary block — never replaces it. POSTs to V1's
// `/api/evidence-ledger/append` route; renders a success card with the
// returned `record_id`, truncated `sha256`, and `redacted_count` badge.
// Failures render inline with full reason and bump the ZSF append counter
// with a branch label (validation / network / server-5xx).
// ---------------------------------------------------------------------------

interface AppendEvidenceFormProps {
  onAppended: (item: AppendHistoryItem) => void;
}

function AppendEvidenceForm({ onAppended }: AppendEvidenceFormProps) {
  const [eventType, setEventType] =
    useState<EvidenceLedgerEventType>('audit');
  const [subject, setSubject] = useState<string>('');
  const [actor, setActor] = useState<string>('atlas');
  const [payloadText, setPayloadText] = useState<string>('{\n  \n}');
  const [parentRecordId, setParentRecordId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [successItem, setSuccessItem] = useState<AppendHistoryItem | undefined>();

  const reset = useCallback(() => {
    setSubject('');
    setPayloadText('{\n  \n}');
    setParentRecordId('');
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSuccessItem(undefined);
      setErrorMsg(undefined);

      // ---- Client-side validation (branch: validation) -------------------
      const trimmedSubject = subject.trim();
      const trimmedActor = actor.trim();
      const trimmedParent = parentRecordId.trim();
      if (trimmedSubject === '') {
        bumpAppendErrorCounter('validation');
        const msg = 'subject is required';
        setErrorMsg(msg);
        logToIDE('warn', 'append form validation failed', { reason: msg });
        return;
      }
      if (trimmedActor === '') {
        bumpAppendErrorCounter('validation');
        const msg = 'actor is required';
        setErrorMsg(msg);
        logToIDE('warn', 'append form validation failed', { reason: msg });
        return;
      }
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(payloadText);
      } catch (err) {
        bumpAppendErrorCounter('validation');
        const msg = `payload is not valid JSON: ${
          err instanceof Error ? err.message : 'parse error'
        }`;
        setErrorMsg(msg);
        logToIDE('warn', 'append form validation failed', { reason: msg });
        return;
      }

      // ---- POST to V1 (branches: network, server-5xx) --------------------
      setSubmitting(true);
      try {
        const response = await fetch(APPEND_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: eventType,
            subject: trimmedSubject,
            actor: trimmedActor,
            payload: parsedPayload,
            parent_record_id: trimmedParent === '' ? undefined : trimmedParent,
          }),
        });

        // V1's route returns `EvidenceLedgerAppendResponse` (a tagged union)
        // with HTTP 200 on ok=true, 400 on validation/parent errors, 500 on
        // exec errors. We branch on ok flag rather than HTTP status alone so
        // future route revs that move things around still parse correctly.
        let parsedBody: EvidenceLedgerAppendResponse | null = null;
        try {
          parsedBody = (await response.json()) as EvidenceLedgerAppendResponse;
        } catch {
          // Body might not be JSON — fall through to HTTP-status-based handling.
        }

        if (!response.ok || !parsedBody || parsedBody.ok !== true) {
          const message =
            parsedBody && parsedBody.ok === false && parsedBody.message
              ? parsedBody.message
              : `HTTP ${response.status}`;
          const errorKind =
            parsedBody && parsedBody.ok === false
              ? parsedBody.error_kind
              : undefined;
          const branch: AppendErrorBranch =
            response.status >= 500 || errorKind === 'exec_error'
              ? 'server-5xx'
              : 'validation';
          bumpAppendErrorCounter(branch);
          setErrorMsg(
            errorKind ? `[${errorKind}] ${message}` : message,
          );
          logToIDE('error', 'append POST failed', {
            branch,
            status: response.status,
            errorKind,
            message,
          });
          return;
        }

        const ok = parsedBody;
        if (
          typeof ok.record_id !== 'string' ||
          typeof ok.sha256 !== 'string'
        ) {
          bumpAppendErrorCounter('server-5xx');
          const msg = 'malformed success response (missing record_id/sha256)';
          setErrorMsg(msg);
          logToIDE('error', 'append POST malformed', { body: ok });
          return;
        }
        const item: AppendHistoryItem = {
          record_id: ok.record_id,
          sha256: ok.sha256,
          redacted_count:
            typeof ok.redacted_count === 'number' ? ok.redacted_count : 0,
          event_type: eventType,
          subject: trimmedSubject,
          actor: trimmedActor,
          appended_at:
            typeof ok.created_at === 'string'
              ? ok.created_at
              : new Date().toISOString(),
        };
        setSuccessItem(item);
        onAppended(item);
        reset();
        logToIDE('info', 'append POST ok', {
          record_id: ok.record_id,
          kind: ok.kind,
          redacted_count: ok.redacted_count,
        });
      } catch (err) {
        bumpAppendErrorCounter('network');
        const msg = err instanceof Error ? err.message : 'network failure';
        setErrorMsg(msg);
        logToIDE('error', 'append POST network failure', { msg });
      } finally {
        setSubmitting(false);
      }
    },
    [eventType, subject, actor, payloadText, parentRecordId, onAppended, reset],
  );

  const inputClass =
    'w-full rounded border border-border/60 bg-background/40 px-2 py-1 text-[11px] font-mono text-foreground/90 focus:outline-none focus:border-violet-400/60';

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={onSubmit} className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Event type
            </span>
            <select
              className={inputClass}
              value={eventType}
              onChange={(e) =>
                setEventType(e.target.value as EvidenceLedgerEventType)
              }
              disabled={submitting}
            >
              {APPEND_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Actor
            </span>
            <input
              type="text"
              className={inputClass}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              disabled={submitting}
              placeholder="atlas"
            />
          </label>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Subject
          </span>
          <input
            type="text"
            className={inputClass}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={submitting}
            placeholder="e.g. submission #42 gate verdict"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Payload (JSON)
          </span>
          <textarea
            className={cn(inputClass, 'font-mono leading-snug')}
            rows={4}
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            disabled={submitting}
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Parent record id (optional)
          </span>
          <input
            type="text"
            className={inputClass}
            value={parentRecordId}
            onChange={(e) => setParentRecordId(e.target.value)}
            disabled={submitting}
            placeholder="—"
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] uppercase tracking-wide font-medium transition-colors',
              submitting
                ? 'border-border/60 bg-background/30 text-muted-foreground cursor-not-allowed'
                : 'border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20',
            )}
          >
            <PlusCircle className="w-3 h-3" />
            {submitting ? 'Appending…' : 'Append evidence'}
          </button>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            errors: {getAppendErrorCounter()}
          </span>
        </div>
      </form>

      {errorMsg && (
        <div
          data-testid="append-error"
          className="flex items-start gap-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200"
        >
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span className="break-words">{errorMsg}</span>
        </div>
      )}

      {successItem && (
        <div
          data-testid="append-success"
          className="flex flex-col gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-100"
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span className="font-mono">record {successItem.record_id}</span>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <span className="font-mono text-[10px] text-emerald-200/80">
              sha256 {successItem.sha256.slice(0, 12)}…
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] border font-mono tabular-nums',
                successItem.redacted_count > 0
                  ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                  : 'text-muted-foreground bg-background/40 border-border/60',
              )}
            >
              redacted {successItem.redacted_count}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Z2 SCAFFOLD — Permissions pill row
// ---------------------------------------------------------------------------
//
// Read-only indicator showing the top 3 capabilities by deny-count from the
// latest PermissionGovernor snapshot. Renders nothing when there are no
// capabilities to surface (no-snapshot, empty entries) — silent on idle so
// it doesn't fight for header real estate. Fetches every PERMISSION_REFRESH_MS
// independently of the campaign poll loop; ZSF counter on every failure path.

function permissionStatusClass(status: PermissionStatus): string {
  switch (status) {
    case 'denied':
      return 'text-rose-300 bg-rose-500/10 border-rose-500/30';
    case 'degraded':
      return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    case 'granted':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  }
}

function PermissionsPillRow() {
  const [pmap, setPmap] = useState<PermissionMap>(EMPTY_PERMISSION_MAP);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: number | null = null;

    const load = async () => {
      try {
        const response = await fetch(PERMISSION_ENDPOINT, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const body = (await response.json()) as PermissionMap;
        if (cancelledRef.current) return;
        setPmap(body);
      } catch (err) {
        if (cancelledRef.current) return;
        bumpPermissionIndicatorError();
        // ZSF: surface in console for sentinels without re-reading server logs.
        console.warn(
          '[CampaignTheater] permission indicator fetch failed (errors=%d): %s',
          getPermissionIndicatorErrorCount(),
          err instanceof Error ? err.message : String(err),
        );
      }
    };

    const initial = window.setTimeout(load, 0);
    if (PERMISSION_REFRESH_MS > 0) {
      timer = window.setInterval(load, PERMISSION_REFRESH_MS);
    }
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(initial);
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);

  const top = useMemo(
    () => topDeniedCapabilities(pmap, PERMISSION_INDICATOR_TOP_N),
    [pmap],
  );

  if (top.length === 0) return null;

  return (
    <div
      data-testid="permissions-pill-row"
      className="flex items-center gap-1.5 mb-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground"
    >
      <span className="shrink-0 flex items-center gap-1">
        <ShieldAlert className="w-3 h-3 text-fuchsia-400" />
        Permissions
      </span>
      <div className="flex flex-wrap gap-1">
        {top.map((row) => (
          <span
            key={`${row.capability}:${row.status}`}
            title={
              row.deny_count > 0
                ? `${row.capability}: ${row.status} (${row.deny_count} deny)`
                : `${row.capability}: ${row.status}`
            }
            className={cn(
              'inline-flex items-center rounded px-1.5 py-0.5 border tabular-nums font-mono text-[10px]',
              permissionStatusClass(row.status),
            )}
          >
            <span className="truncate max-w-[140px]">{row.capability}</span>
            <span className="opacity-60 ml-1">{row.status}</span>
          </span>
        ))}
      </div>
    </div>
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
  const [appendHistory, setAppendHistory] = useState<AppendHistoryItem[]>([]);
  // W1.b — set of record_ids that have been redacted in this session, plus
  // an in-flight set so the Redact button shows pending state and rejects
  // double-clicks. Persistence comes from the next status refresh which
  // re-reads the dump-summary snapshot.
  const [redactedIds, setRedactedIds] = useState<Set<string>>(() => new Set());
  const [redactingId, setRedactingId] = useState<string | null>(null);
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

  // After a successful append, prepend the entry to the local history (cap
  // at 5) and trigger a status reload so the existing ledger summary block
  // re-reads the snapshot. The reload is best-effort — failure here is
  // already counted by `bumpErrorCounter` inside `load`.
  const handleAppended = useCallback((item: AppendHistoryItem) => {
    setAppendHistory((prev) => [item, ...prev].slice(0, APPEND_HISTORY_LIMIT));
    void load();
  }, [load]);

  // W1.b — Redact handler. Wired into the small "Redact" button next to each
  // record in the existing ledger summary list. Uses window.confirm so the
  // operator can't tombstone a record on a single misclick. POSTs to the
  // new /api/evidence-ledger/redact route with reason="manual" + actor="atlas-ui"
  // per the W1.b spec; counters bump on every failure branch (ZSF).
  const handleRedact = useCallback(
    async (recordId: string) => {
      if (typeof window === 'undefined' || !recordId) return;
      if (redactingId !== null) return; // single-flight per panel
      if (redactedIds.has(recordId)) return; // already tombstoned this session

      // Confirmation dialog — explicit, irreversible-looking copy.
      const ok = window.confirm(
        'Redact this record? Tombstone permanent.',
      );
      if (!ok) return;

      setRedactingId(recordId);
      try {
        const response = await fetch(REDACT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record_id: recordId,
            reason: 'manual',
            actor: 'atlas-ui',
          }),
        });

        let parsed: EvidenceLedgerRedactResponse | null = null;
        try {
          parsed = (await response.json()) as EvidenceLedgerRedactResponse;
        } catch {
          parsed = null;
        }

        if (!response.ok || !parsed || parsed.ok !== true) {
          const branch: AppendErrorBranch = response.ok
            ? 'server-5xx'
            : response.status >= 500
              ? 'server-5xx'
              : 'validation';
          bumpRedactErrorCounter(branch);
          const message =
            parsed && parsed.ok === false
              ? parsed.message
              : `redact failed (HTTP ${response.status})`;
          console.warn(
            '[CampaignTheater] redact failed (errors=%d): %s',
            getRedactErrorCounter(),
            message,
          );
          logToIDE('warn', 'redact failed', {
            record_id: recordId,
            message,
            http_status: response.status,
          });
          window.alert(`Redact failed: ${message}`);
          return;
        }

        // Success — mark redacted in local state and refresh status so the
        // dump-summary snapshot re-reads the canonical ledger.
        setRedactedIds((prev) => {
          const next = new Set(prev);
          next.add(recordId);
          return next;
        });
        logToIDE('info', 'evidence redacted', {
          record_id: recordId,
          tombstone_record_id: parsed.tombstone_record_id,
          already_redacted: parsed.already_redacted,
        });
        void load();
      } catch (err) {
        bumpRedactErrorCounter('network');
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          '[CampaignTheater] redact network error (errors=%d): %s',
          getRedactErrorCounter(),
          msg,
        );
        logToIDE('error', 'redact network error', {
          record_id: recordId,
          error: msg,
        });
        if (typeof window !== 'undefined') {
          window.alert(`Redact failed (network): ${msg}`);
        }
      } finally {
        setRedactingId(null);
      }
    },
    [load, redactingId, redactedIds],
  );

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
      {/* Z2 — Permissions pill row (read-only indicator from PermissionGovernor) */}
      <PermissionsPillRow />

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
                {ledgerEntries.map((entry) => {
                  const isRedacted =
                    redactedIds.has(entry.record_id) ||
                    entry.kind === 'redaction';
                  const isPending = redactingId === entry.record_id;
                  const buttonDisabled =
                    isRedacted || isPending || redactingId !== null;
                  return (
                    <li
                      key={entry.record_id}
                      data-testid="ledger-entry"
                      data-record-id={entry.record_id}
                      data-redacted={isRedacted ? 'true' : 'false'}
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
                      <span
                        className={cn(
                          'truncate',
                          isRedacted
                            ? 'italic text-muted-foreground line-through'
                            : 'text-foreground/80',
                        )}
                        title={entry.summary}
                      >
                        {isRedacted ? '[REDACTED]' : entry.summary || '—'}
                      </span>
                      {entry.kind !== 'redaction' && (
                        <button
                          type="button"
                          data-testid="redact-button"
                          aria-label={
                            isRedacted
                              ? `Record ${entry.record_id.slice(0, 8)} already redacted`
                              : `Redact record ${entry.record_id.slice(0, 8)}`
                          }
                          disabled={buttonDisabled}
                          onClick={() => {
                            void handleRedact(entry.record_id);
                          }}
                          className={cn(
                            'ml-auto shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide border transition-colors',
                            isRedacted
                              ? 'text-muted-foreground border-border/40 bg-background/30 cursor-not-allowed'
                              : isPending
                                ? 'text-amber-300 border-amber-500/40 bg-amber-500/10 animate-pulse cursor-wait'
                                : 'text-rose-300 border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20',
                            buttonDisabled && !isPending && 'opacity-60',
                          )}
                        >
                          <EyeOff className="w-3 h-3" />
                          {isRedacted
                            ? 'Redacted'
                            : isPending
                              ? 'Redacting…'
                              : 'Redact'}
                        </button>
                      )}
                    </li>
                  );
                })}
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

      {/* W1.b — Append-Evidence admin WRITE surface.
          Placed UNDER the read-only ledger summary; never replaces it.
          Last-5-appends log renders ABOVE the form for at-a-glance audit. */}
      {status && (
        <div
          data-testid="campaign-theater-append"
          className="mt-2 rounded border border-violet-500/30 bg-background/30 p-2"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <PlusCircle className="w-3 h-3 text-violet-300" />
              <span>Append evidence</span>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              session {appendHistory.length}/{APPEND_HISTORY_LIMIT}
            </span>
          </div>

          {appendHistory.length > 0 && (
            <div
              data-testid="append-history"
              className="mb-2 rounded border border-border/60 bg-background/40 p-1.5"
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Last {appendHistory.length} appends (session)
              </div>
              <ul className="flex flex-col gap-0.5">
                {appendHistory.map((item) => (
                  <li
                    key={item.record_id}
                    className="flex items-baseline gap-2 text-[11px] leading-snug"
                  >
                    <span className="inline-flex shrink-0 rounded px-1 py-0.5 text-[9px] border border-violet-500/30 bg-violet-500/10 text-violet-200 uppercase tracking-wide">
                      {item.event_type}
                    </span>
                    <span
                      className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0"
                      title={item.record_id}
                    >
                      {item.record_id.slice(0, 8)}
                    </span>
                    <span
                      className="font-mono text-[10px] text-muted-foreground/70 tabular-nums shrink-0"
                      title={item.sha256}
                    >
                      {item.sha256.slice(0, 12)}
                    </span>
                    <span
                      className="text-foreground/80 truncate"
                      title={item.subject}
                    >
                      {item.subject}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AppendEvidenceForm onAppended={handleAppended} />
        </div>
      )}
    </div>
  );
}


export default CampaignTheater;
