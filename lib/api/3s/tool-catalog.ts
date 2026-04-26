/**
 * 3-Surgeons Tool Catalog
 *
 * Static manifest of which `three_surgeons.cli.main` subcommands the IDE is
 * willing to invoke from a generic dispatcher (`/api/3s/tool`). Each entry
 * maps an IDE-facing tool ID → CLI args + arg validators.
 *
 * Adding a new tool:
 *   1. Append to TOOL_CATALOG with subcommand, ARG validator, and a label.
 *   2. Choose `dryRunFlag: true` if the underlying CLI supports `--dry-run`.
 *   3. Pick a `timeoutMs` reflecting realistic worst case (kill switch).
 *
 * Why an allowlist? Free-form `python -m ... <user input>` would be a
 * shell-injection equivalent. We restrict to known-safe subcommands and
 * type-check every argument before it lands on argv.
 *
 * Mirrors docs/plans/2026-03-13-3surgeons-ide-versatility-design.md
 * "Component 1: HTTP Bridge Expansion".
 */

export interface ToolArgSpec {
  /** Argument name as exposed in JSON requests. */
  name: string;
  /** CLI flag (e.g. `-f`). Empty string => positional argument. */
  flag: string;
  /** Whether the arg is mandatory. */
  required: boolean;
  /** Allow multi-value args (passes the flag once per value). */
  multi?: boolean;
  /** Plain-language description for /tools catalog responses. */
  description: string;
}

export interface ToolEntry {
  /** Public tool ID (slug). */
  id: string;
  /** CLI subcommand under `three_surgeons.cli.main`. */
  subcommand: string;
  /** Human-readable label. */
  label: string;
  /** Whether the subcommand accepts `--dry-run`. */
  dryRunFlag: boolean;
  /** Per-tool process timeout in ms. */
  timeoutMs: number;
  /** Arg specs in CLI order. Positional args (flag === '') come first. */
  args: ToolArgSpec[];
}

// ---------------------------------------------------------------------------
// Catalog — keep in sync with three_surgeons/cli/main.py @cli.command()
// decorators. We deliberately omit destructive / interactive subcommands
// (`init`, `mode`, `weights-import`) — those should live in their own routes.
// ---------------------------------------------------------------------------

export const TOOL_CATALOG: ToolEntry[] = [
  {
    id: 'consult',
    subcommand: 'consult',
    label: 'Consult — multi-surgeon synthesis on a topic',
    dryRunFlag: true,
    timeoutMs: 60_000,
    args: [
      { name: 'topic', flag: '', required: true, description: 'Topic to consult on' },
      { name: 'files', flag: '-f', required: false, multi: true, description: 'File paths for context' },
    ],
  },
  {
    id: 'cross-exam',
    subcommand: 'cross-exam',
    label: 'Cross-examination — phased multi-surgeon review',
    dryRunFlag: true,
    timeoutMs: 180_000,
    args: [
      { name: 'topic', flag: '', required: true, description: 'Topic to cross-examine' },
      { name: 'files', flag: '--files', required: false, multi: true, description: 'File paths for context' },
      { name: 'review_mode', flag: '--review-mode', required: false, description: 'light | standard | full' },
    ],
  },
  {
    id: 'consensus',
    subcommand: 'consensus',
    label: 'Consensus — confidence-weighted vote across surgeons',
    dryRunFlag: true,
    timeoutMs: 60_000,
    args: [
      { name: 'claim', flag: '', required: true, description: 'Claim to validate' },
    ],
  },
  {
    id: 'sentinel',
    subcommand: 'sentinel',
    label: 'Sentinel — complexity / risk detection',
    dryRunFlag: true,
    timeoutMs: 90_000,
    args: [
      { name: 'content', flag: '', required: true, description: 'Content to sentinel-check' },
    ],
  },
  {
    id: 'gains-gate',
    subcommand: 'gains-gate',
    label: 'Gains Gate — 10-check post-phase verification',
    dryRunFlag: true,
    timeoutMs: 60_000,
    args: [],
  },
  {
    id: 'neurologist-pulse',
    subcommand: 'neurologist-pulse',
    label: 'Neurologist Pulse — local-model health check',
    dryRunFlag: false,
    timeoutMs: 30_000,
    args: [],
  },
  {
    id: 'neurologist-challenge',
    subcommand: 'neurologist-challenge',
    label: 'Neurologist Challenge — local-model corrigibility check',
    dryRunFlag: true,
    timeoutMs: 90_000,
    args: [
      { name: 'topic', flag: '', required: true, description: 'Topic to challenge' },
      { name: 'files', flag: '--files', required: false, multi: true, description: 'File paths for context' },
      { name: 'rounds', flag: '--rounds', required: false, description: 'Number of challenge rounds' },
    ],
  },
  {
    id: 'introspect',
    subcommand: 'introspect',
    label: 'Introspect — surgeon capability snapshot',
    dryRunFlag: false,
    timeoutMs: 15_000,
    args: [],
  },
  {
    id: 'ask-local',
    subcommand: 'ask-local',
    label: 'Ask Local — direct query to neurologist (local LLM)',
    dryRunFlag: true,
    timeoutMs: 60_000,
    args: [
      { name: 'prompt', flag: '', required: true, description: 'Prompt to send to local LLM' },
    ],
  },
  {
    id: 'probe',
    subcommand: 'probe',
    label: 'Probe — verify all surgeons are reachable',
    dryRunFlag: true,
    timeoutMs: 30_000,
    args: [],
  },
  {
    id: 'doctor',
    subcommand: 'doctor',
    label: 'Doctor — phase / integration depth diagnostic',
    dryRunFlag: false,
    timeoutMs: 30_000,
    args: [],
  },
];

export function findTool(id: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}

/**
 * Build the argv tail for a tool, applying allowlist + type validation.
 * Returns `{ ok: false, error }` on any validation failure so the caller
 * can return HTTP 400 without ever spawning a subprocess.
 */
export function buildArgs(
  tool: ToolEntry,
  args: Record<string, unknown>,
  dryRun: boolean,
): { ok: true; argv: string[] } | { ok: false; error: string } {
  const argv: string[] = [tool.subcommand];

  // Positional first
  for (const spec of tool.args.filter((a) => a.flag === '')) {
    const v = args[spec.name];
    if (spec.required && (v === undefined || v === null || v === '')) {
      return { ok: false, error: `arg "${spec.name}" is required` };
    }
    if (v !== undefined && v !== null && v !== '') {
      if (typeof v !== 'string') {
        return { ok: false, error: `arg "${spec.name}" must be a string` };
      }
      if (v.length > 4096) {
        return { ok: false, error: `arg "${spec.name}" exceeds 4096 chars` };
      }
      argv.push(v);
    }
  }

  // Flagged
  for (const spec of tool.args.filter((a) => a.flag !== '')) {
    const v = args[spec.name];
    if (v === undefined || v === null || v === '') {
      if (spec.required) {
        return { ok: false, error: `arg "${spec.name}" is required` };
      }
      continue;
    }
    if (spec.multi) {
      if (!Array.isArray(v)) {
        return { ok: false, error: `arg "${spec.name}" must be an array` };
      }
      for (const item of v) {
        if (typeof item !== 'string') {
          return { ok: false, error: `arg "${spec.name}" entries must be strings` };
        }
        if (item.length > 4096) {
          return { ok: false, error: `arg "${spec.name}" entry exceeds 4096 chars` };
        }
        argv.push(spec.flag, item);
      }
    } else {
      if (typeof v !== 'string' && typeof v !== 'number') {
        return { ok: false, error: `arg "${spec.name}" must be a scalar` };
      }
      const str = String(v);
      if (str.length > 4096) {
        return { ok: false, error: `arg "${spec.name}" exceeds 4096 chars` };
      }
      argv.push(spec.flag, str);
    }
  }

  // Dry-run gating: only attach when supported. Otherwise reject so callers
  // know we can't honour their request without real execution.
  if (dryRun) {
    if (!tool.dryRunFlag) {
      return { ok: false, error: `tool "${tool.id}" does not support --dry-run` };
    }
    argv.push('--dry-run');
  }

  return { ok: true, argv };
}
