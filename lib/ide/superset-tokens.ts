// =============================================================================
// superset-tokens.ts — Apache-Superset-inspired UX vocabulary
//
// Aaron memory `feedback_superset_ux_inspiration.md`: Superset is the UX bar
// for the Context DNA IDE. This file is the *reference* set of design tokens
// applied first in `surgeon-theater-panel.tsx` (per BBB5 audit move #2).
//
// Pattern vocabulary (mapped from Superset's React UI):
//   • slice    — Superset's chart-card chrome: thin header bar (icon + title +
//                status pill + action slot), framed body, hover affordance.
//   • rail     — Superset's persistent left rail tabs (Datasets / Charts /
//                Dashboards). We translate to vertical icon+label tabs.
//   • chip     — Superset's inline metric chip in slice headers (numeric
//                value + colored indicator + units).
//
// Why not pull a CSS library? The IDE is dark-mode, slate-950, Radix +
// Tailwind. We only need the *vocabulary*, not the runtime. Token names
// match Superset so reviewers can cross-reference the upstream UI.
// =============================================================================

// ─── Slice card chrome (Superset chart-card analogue) ───────────────────────
export const SLICE = {
  container:
    'rounded-md border border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 transition-colors',
  header:
    'flex items-center justify-between gap-2 border-b border-zinc-800/80 px-2 py-1.5 bg-zinc-900/60',
  title: 'flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-200',
  body: 'p-2 space-y-1.5',
  footer: 'flex items-center justify-between border-t border-zinc-800/60 px-2 py-1 text-[10px] text-zinc-400',
} as const;

// ─── Left/top rail tabs (Superset nav analogue) ──────────────────────────────
export const RAIL = {
  bar: 'flex items-center gap-0.5 border-b border-zinc-800 bg-zinc-950/95 px-2 py-1',
  tabBase:
    'flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors',
  tabActive: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
  tabIdle: 'text-zinc-500 hover:text-zinc-200 border border-transparent',
} as const;

// ─── Metric chip (Superset slice-header metric analogue) ─────────────────────
// Three semantic intents — `agree`, `dissent`, `neutral` — map to consensus
// states. Numeric leading, label trailing, colored dot indicator.
export type ChipIntent = 'agree' | 'dissent' | 'neutral' | 'warn';

export const CHIP_INTENT: Record<ChipIntent, { wrap: string; dot: string }> = {
  agree: {
    wrap: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  dissent: {
    wrap: 'bg-rose-500/10 text-rose-200 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  neutral: {
    wrap: 'bg-zinc-800/70 text-zinc-300 border-zinc-700/60',
    dot: 'bg-zinc-500',
  },
  warn: {
    wrap: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    dot: 'bg-amber-400',
  },
};

export const CHIP_BASE =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium tabular-nums';
