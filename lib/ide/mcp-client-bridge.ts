// =============================================================================
// mcp-client-bridge.ts — DesktopCommanderMCP Integration Provider
//
// Wraps the DesktopCommanderMCP server (running as a child process via the
// /api/mcp/call API route) as a first-class IntegrationProvider.
//
// Each MCP tool is exposed as an IntegrationAction, registered with the
// CapabilityBus for cross-panel invocation. The PermissionGuard in
// capability-bus.ts enforces safety tiers before any action executes.
//
// Architecture:
//   Browser (this file) → HTTP → /api/mcp/call → stdio → DesktopCommanderMCP
// =============================================================================

import type {
  IntegrationProvider,
  IntegrationAction,
  IntegrationResource,
  CapabilityEventType,
} from './integration-manifest';
import { getCapabilityBus } from './capability-bus';
import { getServiceUrl } from './service-registry';

// ---------------------------------------------------------------------------
// MCP Tool → IntegrationAction mapping
// ---------------------------------------------------------------------------

const MCP_ACTIONS: IntegrationAction[] = [
  // File Read (non-destructive)
  { id: 'read_file', label: 'Read File', description: 'Read file contents with offset/length pagination', destructive: false },
  { id: 'read_multiple_files', label: 'Read Multiple Files', description: 'Batch read multiple files simultaneously', destructive: false },
  { id: 'list_directory', label: 'List Directory', description: 'Directory listing with depth control', destructive: false },
  { id: 'get_file_info', label: 'Get File Info', description: 'Retrieve file metadata including line counts', destructive: false },

  // File Write (destructive)
  { id: 'write_file', label: 'Write File', description: 'Create or overwrite file contents', destructive: true },
  { id: 'write_pdf', label: 'Write PDF', description: 'Create or modify PDF documents', destructive: true },
  { id: 'create_directory', label: 'Create Directory', description: 'Create nested directories', destructive: true },
  { id: 'move_file', label: 'Move File', description: 'Rename or relocate files', destructive: true },

  // Code Edit (destructive)
  { id: 'edit_block', label: 'Edit Block', description: 'Surgical text replacements in files', destructive: true },

  // Search (non-destructive)
  { id: 'start_search', label: 'Start Search', description: 'Initiate background file/content search with streaming', destructive: false },
  { id: 'get_more_search_results', label: 'Get More Results', description: 'Paginate active search results', destructive: false },
  { id: 'stop_search', label: 'Stop Search', description: 'Terminate background search', destructive: false },
  { id: 'list_searches', label: 'List Searches', description: 'Show all active searches', destructive: false },

  // Terminal (destructive — executes arbitrary commands)
  { id: 'start_process', label: 'Start Process', description: 'Launch terminal session with REPL detection', destructive: true },
  { id: 'read_process_output', label: 'Read Output', description: 'Stream output from running process', destructive: false },
  { id: 'interact_with_process', label: 'Send Input', description: 'Send commands to running REPL', destructive: true },

  // Process Management
  { id: 'list_processes', label: 'List Processes', description: 'Show all running processes', destructive: false },
  { id: 'list_sessions', label: 'List Sessions', description: 'Display active terminal sessions', destructive: false },
  { id: 'kill_process', label: 'Kill Process', description: 'Terminate process by PID', destructive: true },
  { id: 'force_terminate', label: 'Force Terminate', description: 'Forcefully kill a process', destructive: true },

  // Config
  { id: 'get_config', label: 'Get Config', description: 'Retrieve MCP server configuration', destructive: false },
  { id: 'set_config_value', label: 'Set Config', description: 'Update MCP server configuration', destructive: true },

  // Analytics (non-destructive)
  { id: 'get_usage_stats', label: 'Usage Stats', description: 'Tool usage metrics and success rates', destructive: false },
  { id: 'get_recent_tool_calls', label: 'Recent Calls', description: 'Chronological call history', destructive: false },
];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function getMCPApiBase(): string {
  return getServiceUrl('desktop_commander') || '/api/mcp';
}

async function callMCPTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const res = await fetch(`${getMCPApiBase()}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, arguments: args }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { ok: data.ok, result: data.result, error: data.error };
  } catch (e) {
    return { ok: false, error: `MCP call failed: ${String(e)}` };
  }
}

// ---------------------------------------------------------------------------
// MCPClientBridge — IntegrationProvider
// ---------------------------------------------------------------------------

export const MCPClientBridge: IntegrationProvider = {
  id: 'desktop-commander',
  name: 'Desktop Commander',
  icon: 'Terminal',
  category: 'system',
  description: 'File system, terminal, and process management via DesktopCommanderMCP',

  auth: { type: 'local_socket', socketPath: '/api/mcp' },

  async checkAuth() {
    try {
      const res = await fetch(`${getMCPApiBase()}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return { ok: false, error: `Health check failed: HTTP ${res.status}` };
      const data = await res.json();
      return data.connected ? { ok: true } : { ok: false, error: 'MCP process not connected' };
    } catch (e) {
      return { ok: false, error: `MCP not reachable: ${String(e)}` };
    }
  },

  panels: ['audit-log'],

  async listResources(type) {
    switch (type) {
      case 'processes': {
        const result = await callMCPTool('list_processes', {});
        if (!result.ok) return [];
        // Parse process list from text output
        return [{
          id: 'process-list',
          type: 'processes',
          label: 'Running Processes',
          data: result.result,
        }];
      }
      case 'sessions': {
        const result = await callMCPTool('list_sessions', {});
        if (!result.ok) return [];
        return [{
          id: 'session-list',
          type: 'sessions',
          label: 'Terminal Sessions',
          data: result.result,
        }];
      }
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'file': {
        const result = await callMCPTool('read_file', { path: id });
        if (!result.ok) return null;
        return { id, type: 'file', label: id.split('/').pop() || id, data: result.result };
      }
      default:
        return null;
    }
  },

  actions: MCP_ACTIONS,

  async executeAction(actionId, params) {
    return callMCPTool(actionId, params);
  },

  emits: [
    'mcp.connected',
    'mcp.disconnected',
    'mcp.action.denied',
    'mcp.action.confirmed',
    'mcp.nuclear.reset',
  ] as CapabilityEventType[],

  subscribesTo: [] as CapabilityEventType[],

  async initialize() {
    const bus = getCapabilityBus();

    // Register each MCP action with the CapabilityBus
    for (const action of MCP_ACTIONS) {
      bus.registerAction('desktop-commander', action.id, async (request) => {
        const result = await callMCPTool(request.actionId, request.params);
        return {
          requestId: request.id,
          ok: result.ok,
          result: result.result,
          error: result.error,
          timestamp: Date.now(),
        };
      });
    }

    // Check connection and emit status
    const auth = await this.checkAuth();
    if (auth.ok) {
      bus.emit('mcp.connected' as any, { provider: 'desktop-commander', url: getMCPApiBase() });
    }
  },

  dispose() {
    // Shutdown MCP process
    fetch(`${getMCPApiBase()}/shutdown`, { method: 'POST' }).catch(() => {});
  },
};

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

export function getMCPBridge(): typeof MCPClientBridge {
  return MCPClientBridge;
}

/**
 * Get the destructive flag for an MCP action by ID.
 * Used by the PermissionGuard to determine if confirmation is needed.
 */
export function getMCPActionMeta(actionId: string): IntegrationAction | undefined {
  return MCP_ACTIONS.find((a) => a.id === actionId);
}
