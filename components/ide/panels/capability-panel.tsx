'use client';

// =============================================================================
// CapabilityPanel — IDE Posture HUD
//
// Renders a compact grid of capability tiles with L1 / L2 / L3 badges, the
// reason for the current level, and a recovery hint when degraded. Probes
// every 10 s via the IDE-side CapabilityRegistry singleton.
//
// Visual contract:
//   - Green dot   — L3 (full suite)
//   - Cyan dot    — L2 (enhanced)
//   - Amber dot   — L1 (standalone fallback active)
//   - Red banner  — overall posture is SAFE_MODE
//
// This is the single panel surface the user can glance at to know "is my
// stack healthy?" before kicking off an ER Sim build.
// =============================================================================

import { useEffect } from 'react';
import { Activity, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  CAPABILITY_LABELS,
  type CapabilityId,
  type CapabilityLevel,
  type CapabilityState,
  getCapabilityRegistry,
  useCapabilitySnapshot,
} from '@/lib/ide/capability-registry';

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

function levelColor(level: CapabilityLevel): string {
  switch (level) {
    case 3:
      return 'bg-emerald-500';
    case 2:
      return 'bg-cyan-500';
    case 1:
      return 'bg-amber-500';
    default:
      return 'bg-zinc-500';
  }
}

function levelLabel(level: CapabilityLevel): string {
  switch (level) {
    case 3:
      return 'L3 Full Suite';
    case 2:
      return 'L2 Enhanced';
    case 1:
      return 'L1 Standalone';
    default:
      return 'Unknown';
  }
}

function PostureBanner({ posture, online }: { posture: string; online: boolean }) {
  if (posture === 'SAFE_MODE') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-700/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
        <ShieldAlert size={14} />
        <span className="font-medium">Safe Mode</span>
        <span className="text-red-300/70">A critical capability has degraded — see tiles below.</span>
      </div>
    );
  }
  if (posture === 'DEGRADED') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
        <ShieldQuestion size={14} />
        <span className="font-medium">Degraded</span>
        <span className="text-amber-300/70">One or more capabilities are running on L1 fallback.</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
      <ShieldCheck size={14} />
      <span className="font-medium">Nominal</span>
      <span className="text-emerald-300/70">{online ? 'All capabilities healthy.' : 'Showing last-known posture (probe offline).'}</span>
    </div>
  );
}

function CapabilityTile({ state }: { state: CapabilityState }) {
  const isFallback = state.level === 1;
  return (
    <div
      className={cn(
        'rounded-md border bg-zinc-950/40 px-3 py-2',
        isFallback ? 'border-amber-800/60' : 'border-zinc-800/80',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <span
            className={cn('h-2 w-2 rounded-full', levelColor(state.level))}
            aria-hidden
          />
          {state.label}
        </div>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[10px]',
            state.level === 3 && 'bg-emerald-950/60 text-emerald-300',
            state.level === 2 && 'bg-cyan-950/60 text-cyan-300',
            state.level === 1 && 'bg-amber-950/60 text-amber-300',
          )}
        >
          {levelLabel(state.level)}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{state.user_summary}</p>
      {state.reason && (
        <p className="mt-1 font-mono text-[10px] text-zinc-500">reason: {state.reason}</p>
      )}
      {state.recovery_hint && (
        <p className="mt-1 text-[11px] text-amber-400/90">→ {state.recovery_hint}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function CapabilityPanel() {
  const snapshot = useCapabilitySnapshot();

  useEffect(() => {
    const registry = getCapabilityRegistry();
    registry.startAutoProbe(10_000);
    return () => {
      // Don't stop on unmount — other panels may still want the snapshot.
      // The interval is process-lived; getCapabilityRegistry().stopAutoProbe()
      // can be called explicitly from a settings toggle if desired.
    };
  }, []);

  const ordered: CapabilityId[] = [
    'evidence_store',
    'cross_examination',
    'llm_backend',
    'project_memory',
    'state_backend',
    'event_bus',
    'health_monitoring',
    'fleet_transport',
  ];

  const lastProbed = new Date(snapshot.ts).toLocaleTimeString();

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <Activity size={14} />
          Capability Posture
        </div>
        <button
          type="button"
          onClick={() => {
            void getCapabilityRegistry().probe();
          }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          aria-label="Probe capabilities now"
        >
          <RefreshCw size={11} />
          Probe
        </button>
      </div>

      <div className="space-y-2 overflow-auto p-3">
        <PostureBanner posture={snapshot.posture} online={snapshot.online} />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {ordered.map((id) => (
            <CapabilityTile key={id} state={snapshot.states[id]} />
          ))}
        </div>
        <div className="pt-1 text-right font-mono text-[10px] text-zinc-600">
          last probe {lastProbed} · names per registry: {Object.keys(CAPABILITY_LABELS).length}
        </div>
      </div>
    </div>
  );
}
