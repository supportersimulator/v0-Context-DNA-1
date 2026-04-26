/**
 * 3-Surgeons Consult Bridge
 *
 * POST /api/3s/consult
 * Body: { topic: string, file_paths?: string[] }
 * Returns: { ok: boolean, cardiologist?, neurologist?, summary?, raw?, error? }
 *
 * Spawns the 3s CLI (three_surgeons.cli.main) via execFile — never exec/eval.
 * Wraps cardiologist (DeepSeek-chat) + neurologist (DeepSeek-reasoner)
 * + atlas synthesis output for the IDE consensus panel.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileP = promisify(execFile);

const SURGEONS_DIR =
  process.env.THREE_SURGEONS_DIR ||
  path.resolve(process.cwd(), '..', '3-surgeons');
const PYTHON_BIN = process.env.THREE_SURGEONS_PYTHON || 'python3';
const TIMEOUT_MS = 60_000;
const MAX_BUFFER = 4 * 1024 * 1024;

function parseSections(stdout: string): {
  cardiologist?: string;
  neurologist?: string;
  summary?: string;
} {
  const out: { cardiologist?: string; neurologist?: string; summary?: string } = {};
  const grab = (label: string): string | undefined => {
    const re = new RegExp(`--- ${label} ---\\n([\\s\\S]*?)(?=\\n--- |\\nCost: |$)`, 'i');
    const m = stdout.match(re);
    return m ? m[1].trim() : undefined;
  };
  out.cardiologist = grab('Cardiologist');
  out.neurologist = grab('Neurologist');
  const cost = stdout.match(/Cost: \$([\d.]+) \| Latency: ([\d.]+)ms/);
  if (cost) {
    out.summary = `Consult complete — cost $${cost[1]}, latency ${cost[2]}ms`;
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const topic: unknown = body?.topic;
    const filePaths: unknown = body?.file_paths;

    if (typeof topic !== 'string' || topic.trim() === '') {
      return NextResponse.json(
        { ok: false, error: 'topic (string) is required' },
        { status: 400 },
      );
    }

    const args = ['-m', 'three_surgeons.cli.main', 'consult', topic];
    if (Array.isArray(filePaths)) {
      for (const fp of filePaths) {
        if (typeof fp === 'string' && fp.trim() !== '') {
          args.push('-f', fp);
        }
      }
    }

    const { stdout, stderr } = await execFileP(PYTHON_BIN, args, {
      cwd: SURGEONS_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    const sections = parseSections(stdout);
    return NextResponse.json({
      ok: true,
      ...sections,
      raw: stdout,
      stderr: stderr || undefined,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number; message?: string };
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || String(e),
        raw: err?.stdout,
        stderr: err?.stderr,
        code: err?.code,
      },
      { status: 500 },
    );
  }
}
