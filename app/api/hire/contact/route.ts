/**
 * Hire Contact — capture inbound engagement requests (KK3, 2026-05-08).
 *
 * POST /api/hire/contact
 *
 * Body: HireContactRequest = { name, email, scope_or_budget, engagement_id? }
 * Returns: HireContactResponse = { recorded, error?, validation? }
 *
 * Why this route exists
 * ---------------------
 * The hire panel is currently read-only. This route is the first
 * monetization surface — when a client lands on `/hire/<id>` (or the
 * future public marketing variant) and clicks "Get in touch", their
 * payload lands as a JSON line in `.fleet-hire-contacts.jsonl` at the
 * admin app root. The file is gitignored; cron / a future ETL can ship
 * leads into a CRM without this route knowing or caring.
 *
 * The route is feature-flag-gated CLIENT-SIDE (the panel only renders
 * the form when `NEXT_PUBLIC_HIRE_MONETIZATION` is truthy). The server
 * accepts requests unconditionally so that a feature-flagged staging
 * preview can post against production-shaped state. If you need to
 * fully gate the server too, set `HIRE_CONTACT_DISABLED=1` and the
 * route returns 503 with `recorded: false` (still ZSF — the rejection
 * counter increments).
 *
 * Storage
 * -------
 * One JSON document per line. Schema:
 *   { ts: ISO-8601, name, email, scope_or_budget, engagement_id?,
 *     ip?, user_agent? }
 * Append-only. No reads from this route. The admin operator (Aaron)
 * tails the file or pipes it through `jq`.
 *
 * ZSF
 * ---
 * Every failure path bumps a counter and writes a structured line to
 * `/tmp/hire-contact.err` (best-effort — a failure to log the failure
 * is itself swallowed but increments `error_log_failures`). Counters
 * are exposed via `__hireContactCountersForTests()` for unit assertions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
  HIRE_CONTACT_LIMITS,
  type HireContactRequest,
  type HireContactResponse,
} from '@/lib/ide/hire-panel-types';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Storage path resolution
// ---------------------------------------------------------------------------

const APP_ROOT = process.cwd();

function jsonlPath(): string {
  if (process.env.HIRE_CONTACT_JSONL) {
    return path.resolve(process.env.HIRE_CONTACT_JSONL);
  }
  return path.join(APP_ROOT, '.fleet-hire-contacts.jsonl');
}

function errorLogPath(): string {
  if (process.env.HIRE_CONTACT_ERR_LOG) {
    return path.resolve(process.env.HIRE_CONTACT_ERR_LOG);
  }
  return '/tmp/hire-contact.err';
}

// ---------------------------------------------------------------------------
// ZSF counters — process-local, monotonic. Mirrors the arbiter/verdict shape.
// ---------------------------------------------------------------------------

const HIRE_CONTACT_COUNTERS = {
  recorded_ok: 0,
  reject_disabled: 0,
  reject_parse: 0,
  reject_validation: 0,
  reject_method: 0,
  io_failures: 0,
  error_log_failures: 0,
  error: 0,
};

/** Test-only accessor — exposes a snapshot of the counter table. */
export function __hireContactCountersForTests(): typeof HIRE_CONTACT_COUNTERS {
  return { ...HIRE_CONTACT_COUNTERS };
}

// ---------------------------------------------------------------------------
// Validation — plain-if so we don't pull zod into a route the project's other
// API routes don't currently use it in. The package has zod available; future
// callers can swap in `z.object(...)` without changing the wire shape.
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ValidationOutcome =
  | { ok: true; value: HireContactRequest }
  | { ok: false; validation: NonNullable<HireContactResponse['validation']>; error: string };

function validate(raw: unknown): ValidationOutcome {
  const validation: NonNullable<HireContactResponse['validation']> = {};
  if (!raw || typeof raw !== 'object') {
    return { ok: false, validation, error: 'body must be a JSON object' };
  }
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const email = typeof r.email === 'string' ? r.email.trim() : '';
  const scope = typeof r.scope_or_budget === 'string' ? r.scope_or_budget.trim() : '';
  const engagementId =
    typeof r.engagement_id === 'string' && r.engagement_id.trim().length > 0
      ? r.engagement_id.trim().slice(0, 80)
      : undefined;

  if (name.length === 0) {
    validation.name = 'name is required';
  } else if (name.length > HIRE_CONTACT_LIMITS.NAME_MAX) {
    validation.name = `name must be ≤ ${HIRE_CONTACT_LIMITS.NAME_MAX} chars`;
  }

  if (email.length === 0) {
    validation.email = 'email is required';
  } else if (email.length > HIRE_CONTACT_LIMITS.EMAIL_MAX) {
    validation.email = `email must be ≤ ${HIRE_CONTACT_LIMITS.EMAIL_MAX} chars`;
  } else if (!EMAIL_RE.test(email)) {
    validation.email = 'email looks malformed';
  }

  if (scope.length === 0) {
    validation.scope_or_budget = 'please describe the scope or budget';
  } else if (scope.length > HIRE_CONTACT_LIMITS.SCOPE_OR_BUDGET_MAX) {
    validation.scope_or_budget = `must be ≤ ${HIRE_CONTACT_LIMITS.SCOPE_OR_BUDGET_MAX} chars`;
  }

  if (Object.keys(validation).length > 0) {
    return { ok: false, validation, error: 'validation failed' };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      scope_or_budget: scope,
      ...(engagementId ? { engagement_id: engagementId } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Best-effort error log — writing to /tmp/hire-contact.err. If THIS fails,
// we increment `error_log_failures` and move on (no infinite loop).
// ---------------------------------------------------------------------------

async function logError(reason: string, detail: unknown): Promise<void> {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    reason,
    detail: detail instanceof Error ? detail.message : String(detail),
  }) + '\n';
  try {
    await appendFile(errorLogPath(), line, 'utf8');
  } catch {
    HIRE_CONTACT_COUNTERS.error_log_failures += 1;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function reqHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v ? v.slice(0, 400) : undefined;
}

function clientIp(req: NextRequest): string | undefined {
  // Next.js runtime exposes neither remoteAddress nor x-real-ip uniformly,
  // so fall back to common upstream headers. Best-effort only.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim().slice(0, 64);
  const real = req.headers.get('x-real-ip');
  if (real) return real.slice(0, 64);
  return undefined;
}

export async function POST(req: NextRequest): Promise<NextResponse<HireContactResponse>> {
  if (process.env.HIRE_CONTACT_DISABLED === '1') {
    HIRE_CONTACT_COUNTERS.reject_disabled += 1;
    return NextResponse.json(
      { recorded: false, error: 'hire contact intake is disabled' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    HIRE_CONTACT_COUNTERS.reject_parse += 1;
    HIRE_CONTACT_COUNTERS.error += 1;
    void logError('body_parse_failed', err);
    return NextResponse.json(
      { recorded: false, error: 'body must be valid JSON' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const v = validate(body);
  if (!v.ok) {
    HIRE_CONTACT_COUNTERS.reject_validation += 1;
    return NextResponse.json(
      { recorded: false, error: v.error, validation: v.validation },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const record = {
    ts: new Date().toISOString(),
    ...v.value,
    ip: clientIp(req),
    user_agent: reqHeader(req, 'user-agent'),
  };
  const line = JSON.stringify(record) + '\n';

  try {
    const target = jsonlPath();
    // Ensure parent dir exists (no-op when targeting app root).
    await mkdir(path.dirname(target), { recursive: true });
    await appendFile(target, line, 'utf8');
  } catch (err) {
    HIRE_CONTACT_COUNTERS.io_failures += 1;
    HIRE_CONTACT_COUNTERS.error += 1;
    void logError('jsonl_append_failed', err);
    return NextResponse.json(
      { recorded: false, error: 'could not record contact request' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  HIRE_CONTACT_COUNTERS.recorded_ok += 1;
  return NextResponse.json(
    { recorded: true },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}

// Block other verbs explicitly — keeps the ZSF table honest.
export async function GET(): Promise<NextResponse<HireContactResponse>> {
  HIRE_CONTACT_COUNTERS.reject_method += 1;
  return NextResponse.json(
    { recorded: false, error: 'POST only' },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } },
  );
}
