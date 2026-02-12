// =============================================================================
// permission-guard.ts — Safety Tier Permission Enforcement
//
// Single enforcement point for all MCP / DesktopCommander actions.
// Called from CapabilityBus.dispatchAction() as middleware.
//
// 3-Layer Defense:
//   Layer 1: This guard (IDE-level, tier-based, per-action)
//   Layer 2: DesktopCommanderMCP config (blockedCommands, allowedDirectories)
//   Layer 3: OS permissions (user-level file system access)
// =============================================================================

import { getSettingsStore } from './settings-store';

// ---------------------------------------------------------------------------
// Safety Tiers
// ---------------------------------------------------------------------------

export type SafetyTier = 'full' | 'standard' | 'limited' | 'locked';

export const TIER_LABELS: Record<SafetyTier, string> = {
  full: 'Full Access',
  standard: 'Standard',
  limited: 'Limited',
  locked: 'Locked Down',
};

export const TIER_DESCRIPTIONS: Record<SafetyTier, string> = {
  full: 'All 26 MCP tools available. Destructive actions still require confirmation.',
  standard: 'Read, write, search, terminal. No kill_process or config writes.',
  limited: 'Read-only + search. No writes, no terminal execution.',
  locked: 'All MCP access disabled. Nuclear Reset sets this tier.',
};

// ---------------------------------------------------------------------------
// Per-Tier Permissions
// ---------------------------------------------------------------------------

export interface TierPermissions {
  readFiles: boolean;
  writeFiles: boolean;
  editFiles: boolean;
  searchFiles: boolean;
  execCommand: boolean;
  listProcesses: boolean;
  killProcess: boolean;
  getConfig: boolean;
  setConfig: boolean;
}

export const TIER_PERMISSIONS: Record<SafetyTier, TierPermissions> = {
  full: {
    readFiles: true,
    writeFiles: true,
    editFiles: true,
    searchFiles: true,
    execCommand: true,
    listProcesses: true,
    killProcess: true,
    getConfig: true,
    setConfig: true,
  },
  standard: {
    readFiles: true,
    writeFiles: true,
    editFiles: true,
    searchFiles: true,
    execCommand: true,
    listProcesses: true,
    killProcess: false,
    getConfig: true,
    setConfig: false,
  },
  limited: {
    readFiles: true,
    writeFiles: false,
    editFiles: false,
    searchFiles: true,
    execCommand: false,
    listProcesses: true,
    killProcess: false,
    getConfig: true,
    setConfig: false,
  },
  locked: {
    readFiles: false,
    writeFiles: false,
    editFiles: false,
    searchFiles: false,
    execCommand: false,
    listProcesses: false,
    killProcess: false,
    getConfig: false,
    setConfig: false,
  },
};

// ---------------------------------------------------------------------------
// MCP Action → Permission Key mapping
// ---------------------------------------------------------------------------

const ACTION_PERMISSION_MAP: Record<string, keyof TierPermissions> = {
  // File read
  read_file: 'readFiles',
  read_multiple_files: 'readFiles',
  list_directory: 'readFiles',
  get_file_info: 'readFiles',

  // File write
  write_file: 'writeFiles',
  write_pdf: 'writeFiles',
  create_directory: 'writeFiles',
  move_file: 'writeFiles',

  // Code edit
  edit_block: 'editFiles',

  // Search
  start_search: 'searchFiles',
  get_more_search_results: 'searchFiles',
  stop_search: 'searchFiles',
  list_searches: 'searchFiles',

  // Terminal
  start_process: 'execCommand',
  read_process_output: 'execCommand',
  interact_with_process: 'execCommand',

  // Process management
  list_processes: 'listProcesses',
  list_sessions: 'listProcesses',
  kill_process: 'killProcess',
  force_terminate: 'killProcess',

  // Config
  get_config: 'getConfig',
  set_config_value: 'setConfig',
};

// ---------------------------------------------------------------------------
// Permission Check
// ---------------------------------------------------------------------------

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  tier: SafetyTier;
}

/**
 * Check whether an action is permitted under the current safety tier.
 *
 * - Reads user tier from `security.permissionTier`
 * - Reads Synaptic tier from `security.synapticTier` when source is 'synaptic'
 * - ALL destructive actions require confirmation regardless of tier
 * - Non-MCP actions (no mapping) pass through unchecked
 */
export function checkPermission(
  actionId: string,
  sourcePanel: string,
  destructive: boolean,
): PermissionCheckResult {
  const store = getSettingsStore();

  // Determine which tier applies
  const isSynaptic = sourcePanel === 'synaptic' || sourcePanel.startsWith('synaptic-');
  const tier: SafetyTier = isSynaptic
    ? (store.get('security.synapticTier' as any) ?? 'limited')
    : (store.get('security.permissionTier' as any) ?? 'standard');

  // Non-MCP actions pass through (other providers handle their own logic)
  const permKey = ACTION_PERMISSION_MAP[actionId];
  if (!permKey) {
    return { allowed: true, requiresConfirmation: false, tier };
  }

  // Check tier permissions
  const permissions = TIER_PERMISSIONS[tier];
  if (!permissions[permKey]) {
    return {
      allowed: false,
      reason: `Action "${actionId}" blocked by ${TIER_LABELS[tier]} safety tier${isSynaptic ? ' (Synaptic)' : ''}`,
      requiresConfirmation: false,
      tier,
    };
  }

  // Destructive actions ALWAYS require confirmation regardless of tier
  return {
    allowed: true,
    requiresConfirmation: destructive,
    tier,
  };
}

/**
 * Get human-readable permission matrix for display in Settings UI.
 */
export function getPermissionMatrix(): Array<{
  action: string;
  label: string;
  permissions: Record<SafetyTier, boolean>;
}> {
  const labels: Record<keyof TierPermissions, string> = {
    readFiles: 'Read Files',
    writeFiles: 'Write Files',
    editFiles: 'Edit Files',
    searchFiles: 'Search Files',
    execCommand: 'Execute Commands',
    listProcesses: 'List Processes',
    killProcess: 'Kill Processes',
    getConfig: 'Read Config',
    setConfig: 'Write Config',
  };

  return Object.entries(labels).map(([key, label]) => ({
    action: key,
    label,
    permissions: {
      full: TIER_PERMISSIONS.full[key as keyof TierPermissions],
      standard: TIER_PERMISSIONS.standard[key as keyof TierPermissions],
      limited: TIER_PERMISSIONS.limited[key as keyof TierPermissions],
      locked: TIER_PERMISSIONS.locked[key as keyof TierPermissions],
    },
  }));
}
