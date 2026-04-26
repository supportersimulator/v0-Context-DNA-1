/**
 * 3-Surgeons Tool Catalog
 *
 * GET /api/3s/tools
 * Returns the static IDE-side allowlist of CLI subcommands that the
 * generic dispatcher (`POST /api/3s/tool`) can invoke.
 *
 * Source of truth: lib/api/3s/tool-catalog.ts.
 *
 * Mirrors docs/plans/2026-03-13-3surgeons-ide-versatility-design.md
 * Component 1 — "GET /tools already exists — returns full tool list with
 * schemas. Self-documenting API." but on the IDE side instead of the Python
 * HTTP bridge so the IDE can render dispatcher UIs without spawning Python.
 */

import { NextResponse } from 'next/server';

import { TOOL_CATALOG } from '@/lib/api/3s/tool-catalog';
import { append as logAppend } from '@/lib/log/buffer';

export function GET() {
  try {
    return NextResponse.json({
      ok: true,
      tools: TOOL_CATALOG.map((t) => ({
        id: t.id,
        label: t.label,
        subcommand: t.subcommand,
        dryRunSupported: t.dryRunFlag,
        timeoutMs: t.timeoutMs,
        args: t.args.map((a) => ({
          name: a.name,
          flag: a.flag,
          required: a.required,
          multi: !!a.multi,
          description: a.description,
        })),
      })),
    });
  } catch (err) {
    try {
      logAppend({
        ts: Date.now(),
        level: 'error',
        source: '3s/tools',
        msg: (err as Error)?.message ?? 'tool catalog fetch failed',
        detail: ((err as Error)?.stack ?? String(err)).slice(0, 500),
      });
    } catch {
      /* noop */
    }
    return NextResponse.json(
      { ok: false, error: (err as Error)?.message ?? 'unknown' },
      { status: 500 },
    );
  }
}
