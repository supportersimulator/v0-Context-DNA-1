/**
 * 3-Surgeons Receipts API
 *
 * GET /api/receipts?project_dir=<path>&limit=20&format=raw|rendered
 * Reads JSONL at <project_dir>/.3-surgeons/receipts/cross-runs.jsonl.
 * Schema mirrors three_surgeons.receipts.store.ReceiptRecord.
 * format=rendered adds a `rendered` string per receipt (TS port of
 * render_receipt() in store.py — no Python spawn needed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs, createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';

import { append as logAppend } from '@/lib/log/buffer';

export const dynamic = 'force-dynamic';

const STREAM_THRESHOLD_BYTES = 1_000_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const CACHE_SAVINGS_PER_TOKEN = 2.7 / 1_000_000; // mirrors store.py

type Receipt = Record<string, unknown> & { mode?: string; timestamp?: string };

const receiptsPath = (projectDir: string) =>
  path.join(projectDir, '.3-surgeons', 'receipts', 'cross-runs.jsonl');

function tryParse(line: string): Receipt | null {
  try { return JSON.parse(line) as Receipt; } catch { return null; }
}

async function readStreaming(file: string): Promise<Receipt[]> {
  const out: Receipt[] = [];
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    const rec = tryParse(line);
    if (rec) out.push(rec);
  }
  return out;
}

async function readBuffered(file: string): Promise<Receipt[]> {
  const text = await fs.readFile(file, 'utf-8');
  const out: Receipt[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const rec = tryParse(line);
    if (rec) out.push(rec);
  }
  return out;
}

/** TS port of render_receipt() in store.py — output is byte-identical. */
function renderReceipt(rec: Receipt, phaseLabel = '3-Surgeons', stepNum = 1): string {
  const op = (rec.mode as string) || 'cross';
  const ts = String(rec.timestamp ?? '').slice(0, 19).replace('T', ' ');
  const lines: string[] = [`${phaseLabel} -- ${op} -- ${ts}`.replace(/[\s-]+$/, '')];

  const auditors = rec.auditors;
  if (Array.isArray(auditors)) {
    const ids = auditors
      .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
      .map((a) => String(a.id ?? '')).filter(Boolean).join(', ');
    if (ids) lines.push(`Step ${stepNum}.1 -- auditors: ${ids}`);
  }

  const findings = rec.findings as Record<string, unknown> | undefined;
  if (findings && typeof findings === 'object') {
    if (Array.isArray(findings.items)) {
      lines.push(`Step ${stepNum}.2 -- findings: ${findings.items.length} items`);
    } else {
      const c = Number(findings.consensus ?? 0) | 0;
      const ct = Number(findings.contested ?? 0) | 0;
      const u = Number(findings.unique ?? 0) | 0;
      lines.push(`Step ${stepNum}.2 -- findings: ${c} consensus, ${ct} contested, ${u} unique`);
    }
  }

  const dur = rec.duration_ms;
  if (typeof dur === 'number') {
    const durStr = dur < 1000 ? `${Math.round(dur)}ms` : `${Math.round(dur / 1000)}s`;
    lines.push(`Step ${stepNum}.3 -- duration: ${durStr}`);
  }

  const cs = rec.cache_stats as Record<string, unknown> | undefined;
  if (cs && typeof cs === 'object') {
    if (cs.cache_eligible === false) {
      const reason = (cs.cache_eligible_reason as string) || 'prompt < 1024 tokens';
      lines.push(`Step ${stepNum}.4 -- cache-eligible: false (${reason})`);
    } else {
      if (typeof cs.cache_creation_input_tokens === 'number') {
        lines.push(`Step ${stepNum}.4 -- cache created: ${Math.trunc(cs.cache_creation_input_tokens)} tokens`);
      }
      if (typeof cs.cache_read_input_tokens === 'number') {
        const read = cs.cache_read_input_tokens;
        const saved = read * CACHE_SAVINGS_PER_TOKEN;
        const tail = saved >= 0.01 ? ` (~$${saved.toFixed(2)} saved)` : '';
        lines.push(`Step ${stepNum}.5 -- cache read: ${Math.trunc(read)} tokens${tail}`);
      }
    }
  }
  return lines.join('\n');
}

// Default project_dir: walk up from IDE cwd until we find a .3-surgeons/
// directory; falls back to the parent of cwd. Receipts live at the
// superrepo root, not under admin.contextdna.io/.
function defaultProjectDir(): string {
  const start = process.cwd();
  let dir = start;
  for (let i = 0; i < 6; i++) {
    try {
      const probe = path.join(dir, '.3-surgeons');
      // sync test is fine — runs once per request before any IO
      const fsSync = require('fs') as typeof import('fs');
      if (fsSync.existsSync(probe)) return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(start);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectDir = searchParams.get('project_dir') || defaultProjectDir();
  const format = searchParams.get('format') === 'rendered' ? 'rendered' : 'raw';
  const limitParam = parseInt(searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const file = receiptsPath(projectDir);

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ ok: true, receipts: [], count: 0, file });
    }
    return NextResponse.json(
      { ok: false, error: `stat failed: ${(err as Error).message}`, file }, { status: 500 });
  }

  let all: Receipt[];
  try {
    all = stat.size > STREAM_THRESHOLD_BYTES ? await readStreaming(file) : await readBuffered(file);
  } catch (err) {
    try { logAppend({ ts: Date.now(), level: 'error', source: 'receipts', msg: `read failed: ${(err as Error).message}`, detail: ((err as Error).stack || '').slice(0, 500) }); } catch { /* noop */ }
    return NextResponse.json(
      { ok: false, error: `read failed: ${(err as Error).message}`, file }, { status: 500 });
  }

  const sliced = all.slice(-limit);
  const receipts = format === 'rendered'
    ? sliced.map((r, i) => ({ ...r, rendered: renderReceipt(r, '3-Surgeons', i + 1) }))
    : sliced;

  return NextResponse.json({ ok: true, receipts, count: receipts.length, file });
}
