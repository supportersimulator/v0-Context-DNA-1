// =============================================================================
// nuclear-reset.ts — Nuclear Reset: Lock Everything Down
//
// Emergency procedure that:
//   1. PRESERVES: settings (minus security), layout, workspace, custom panels
//   2. LOCKS: sets both permission tiers to 'locked'
//   3. DISCONNECTS: kills MCP child process, unregisters provider
//   4. CLEARS: audit log, MCP session state, cached tool results
//   5. RESTORES: preserved data (minus security settings)
//   6. EMITS: notification on CapabilityBus
//
// After Nuclear Reset, user must explicitly change tier from 'locked'
// to re-enable any system access.
// =============================================================================

import { getSettingsStore } from './settings-store';
import { getCapabilityBus } from './capability-bus';
import { getAuditLogger } from './audit-logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResetManifest {
  timestamp: number;
  preserved: string[];
  cleared: string[];
  tiersLocked: boolean;
  mcpDisconnected: boolean;
}

// ---------------------------------------------------------------------------
// Execute Nuclear Reset
// ---------------------------------------------------------------------------

export async function executeNuclearReset(): Promise<ResetManifest> {
  const manifest: ResetManifest = {
    timestamp: Date.now(),
    preserved: [],
    cleared: [],
    tiersLocked: false,
    mcpDisconnected: false,
  };

  const settings = getSettingsStore();
  const bus = getCapabilityBus();

  // --- STEP 1: PRESERVE non-security settings ---
  const preserved: Record<string, unknown> = {};
  const allSettings = settings.export();
  const parsed = JSON.parse(allSettings);

  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith('security.')) {
      preserved[key] = value;
      manifest.preserved.push(key);
    }
  }

  // --- STEP 2: LOCK both tiers ---
  settings.set('security.permissionTier', 'locked');
  settings.set('security.synapticTier', 'locked');
  manifest.tiersLocked = true;

  // --- STEP 3: DISCONNECT MCP ---
  try {
    await fetch('/api/mcp/shutdown', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });
    manifest.mcpDisconnected = true;
  } catch {
    // MCP might already be disconnected
    manifest.mcpDisconnected = false;
  }

  // --- STEP 4: CLEAR audit log and cached state ---
  const auditLogger = getAuditLogger();
  auditLogger.clear();
  manifest.cleared.push('audit-log');

  // Clear any cached MCP results from localStorage
  if (typeof window !== 'undefined') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('mcp:') || key.startsWith('capbus:'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
      manifest.cleared.push(key);
    }
  }

  // --- STEP 5: RESTORE preserved settings ---
  for (const [key, value] of Object.entries(preserved)) {
    try {
      settings.set(key as any, value as any);
    } catch {
      // Some settings may not be restorable
    }
  }

  // --- STEP 6: EMIT notification ---
  bus.emit('mcp.nuclear.reset' as any, {
    timestamp: manifest.timestamp,
    cleared: manifest.cleared,
    preserved: manifest.preserved,
  });

  // Log the reset itself
  getAuditLogger().log({
    action: 'nuclear_reset',
    provider: 'system',
    sourcePanel: 'settings',
    outcome: 'success',
    params: {
      preserved: manifest.preserved.length,
      cleared: manifest.cleared.length,
    },
  });

  return manifest;
}

// ---------------------------------------------------------------------------
// Check if system is in locked state
// ---------------------------------------------------------------------------

export function isSystemLocked(): boolean {
  const settings = getSettingsStore();
  return (
    settings.get('security.permissionTier') === 'locked' &&
    settings.get('security.synapticTier') === 'locked'
  );
}
