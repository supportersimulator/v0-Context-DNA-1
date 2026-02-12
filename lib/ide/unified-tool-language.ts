// =============================================================================
// unified-tool-language.ts — Shared Tool Schema for All AI Agents
//
// All coding agents in the ContextDNA ecosystem speak the SAME tool language:
//   - OpenHands swarm (DeepSeek workers)
//   - Synaptic (local Qwen3-14B)
//   - Claude Code (Atlas)
//   - Any future agent integration
//
// This ensures:
//   1. Any agent can call any tool with the same JSON schema
//   2. Tool results have a consistent format
//   3. ContextDNA tools (Librarian, Harmonizer) are first-class
//   4. Permission enforcement is uniform across all agent sources
//
// Based on Claude Code tool definitions (gist wong2/e0f34aac66caf890a332f7b6f9e2ba8f)
// adapted for multi-agent swarm use with ContextDNA extensions.
//
// CALL FORMAT (any agent, any model):
//   { "tool": "<tool_name>", "arguments": { ... } }
//
// RESULT FORMAT (uniform):
//   { "ok": true, "result": <any>, "durationMs": <number> }
//   { "ok": false, "error": "<reason>" }
// =============================================================================

// ---------------------------------------------------------------------------
// Tool Definition Schema
// ---------------------------------------------------------------------------

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  items?: { type: string };
  enum?: string[];
  default?: unknown;
}

export interface ToolDefinition {
  /** Unique tool name — same across all agents */
  name: string;
  /** Human-readable description */
  description: string;
  /** Category for grouping and permission mapping */
  category: ToolCategory;
  /** Whether this tool modifies state (triggers confirmation in guarded tiers) */
  destructive: boolean;
  /** JSON Schema-style parameter definitions */
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

export type ToolCategory =
  | 'file_read'
  | 'file_write'
  | 'search'
  | 'terminal'
  | 'process'
  | 'context'      // ContextDNA Librarian/Harmonizer tools
  | 'ops'          // git, deploy, restart
  | 'task'         // task management
  | 'web';         // web fetch/search

// ---------------------------------------------------------------------------
// UNIFIED TOOL CATALOG — The "Rosetta Stone" for all agents
//
// Tool names follow Claude Code conventions so agents trained on those
// system prompts naturally produce valid tool calls.
// ---------------------------------------------------------------------------

export const UNIFIED_TOOLS: ToolDefinition[] = [

  // =========================================================================
  // FILE READ (non-destructive)
  // =========================================================================
  {
    name: 'read_file',
    description: 'Read file contents with optional offset/limit pagination. Returns line-numbered content.',
    category: 'file_read',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        offset: { type: 'number', description: 'Line number to start from (0-based)' },
        limit: { type: 'number', description: 'Max lines to return' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'read_multiple_files',
    description: 'Batch read multiple files simultaneously for efficiency.',
    category: 'file_read',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' }, description: 'Array of absolute file paths' },
      },
      required: ['paths'],
    },
  },
  {
    name: 'list_directory',
    description: 'List directory contents with optional depth control.',
    category: 'file_read',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute directory path' },
        depth: { type: 'number', description: 'Max depth (default 1)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_file_info',
    description: 'Get file metadata: size, modified date, line count, permissions.',
    category: 'file_read',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
      },
      required: ['path'],
    },
  },

  // =========================================================================
  // FILE WRITE (destructive)
  // =========================================================================
  {
    name: 'write_file',
    description: 'Create or overwrite a file. Always read first to avoid data loss.',
    category: 'file_write',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to write' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Surgical string replacement in a file. old_string must be unique.',
    category: 'file_write',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file' },
        old_string: { type: 'string', description: 'Exact text to find and replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory (including parent directories).',
    category: 'file_write',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute directory path to create' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file/directory.',
    category: 'file_write',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source path' },
        destination: { type: 'string', description: 'Destination path' },
      },
      required: ['source', 'destination'],
    },
  },

  // =========================================================================
  // SEARCH (non-destructive)
  // =========================================================================
  {
    name: 'glob',
    description: 'Fast file pattern matching. Returns matching paths sorted by modification time.',
    category: 'search',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")' },
        path: { type: 'string', description: 'Directory to search in (default: project root)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents using regex. Returns matching files or content with context.',
    category: 'search',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search' },
        include: { type: 'string', description: 'File glob filter (e.g. "*.ts")' },
        context_lines: { type: 'number', description: 'Lines of context around matches' },
      },
      required: ['pattern'],
    },
  },

  // =========================================================================
  // TERMINAL (destructive — executes commands)
  // =========================================================================
  {
    name: 'bash',
    description: 'Execute a shell command. Use for git, npm, docker, system operations.',
    category: 'terminal',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in ms (max 600000, default 120000)' },
        description: { type: 'string', description: 'What this command does (for audit log)' },
      },
      required: ['command'],
    },
  },

  // =========================================================================
  // PROCESS MANAGEMENT
  // =========================================================================
  {
    name: 'list_processes',
    description: 'List running processes with CPU/memory usage.',
    category: 'process',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'kill_process',
    description: 'Terminate a process by PID.',
    category: 'process',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Process ID to kill' },
        signal: { type: 'string', description: 'Signal to send (default SIGTERM)', enum: ['SIGTERM', 'SIGKILL', 'SIGINT'] },
      },
      required: ['pid'],
    },
  },

  // =========================================================================
  // CONTEXTDNA TOOLS — The brain layer all agents share
  //
  // These are the tools that make cheap swarm agents (DeepSeek) punch
  // above their weight. ContextDNA provides external coherence:
  //   - Architecture map, key decisions, file hotspots
  //   - "Do not break these invariants" list
  //   - Current risks, prior failures, successful patterns
  // =========================================================================
  {
    name: 'context_query',
    description: 'Query ContextDNA Librarian for relevant memories, SOPs, patterns, and learnings. Use BEFORE starting any non-trivial task.',
    category: 'context',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query about the codebase or task' },
        max_results: { type: 'number', description: 'Maximum results to return (default 5)' },
        include_sops: { type: 'boolean', description: 'Include Standard Operating Procedures (default true)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'context_midpack',
    description: 'Get mid-task context injection pack from ContextDNA bus. Returns architecture-relevant context for files being worked on.',
    category: 'context',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        task_description: { type: 'string', description: 'Current task being performed' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files being worked on' },
        risk_level: { type: 'string', description: 'Task risk assessment', enum: ['low', 'moderate', 'high', 'critical'] },
      },
      required: ['task_description'],
    },
  },
  {
    name: 'context_harmonize',
    description: 'Run Harmonizer gate check before committing changes. Validates ecosystem consistency and catches anti-patterns.',
    category: 'context',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        changes_summary: { type: 'string', description: 'Summary of all changes made' },
        files_changed: { type: 'array', items: { type: 'string' }, description: 'Files modified' },
        test_results: { type: 'string', description: 'Test output (if tests were run)' },
      },
      required: ['changes_summary'],
    },
  },
  {
    name: 'context_record',
    description: 'Record a learning, success, or failure back to ContextDNA memory. Use after completing tasks.',
    category: 'context',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Type of record', enum: ['success', 'failure', 'learning', 'decision'] },
        title: { type: 'string', description: 'Short title for the record' },
        details: { type: 'string', description: 'Full details of what happened and why' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Keywords for future retrieval' },
      },
      required: ['type', 'title', 'details'],
    },
  },

  // =========================================================================
  // OPS — git, deploy, service management
  //
  // Secret-safe: tools use opaque handles, never expose raw credentials.
  //   aws_secrets.resolve("cloudflare/api_token") → { secret_ref: "sec_..." }
  //   cloudflare.deploy({ secret_ref: "sec_..." }) → uses secret internally
  // =========================================================================
  {
    name: 'git_status',
    description: 'Get current git status — branch, staged/unstaged changes, untracked files.',
    category: 'ops',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repository path (default: project root)' },
      },
      required: [],
    },
  },
  {
    name: 'git_commit',
    description: 'Stage files and create a git commit. Always run context_harmonize first.',
    category: 'ops',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message (explain WHY, not just what)' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files to stage (default: all changed)' },
        push: { type: 'boolean', description: 'Push to remote after commit (default false)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'service_restart',
    description: 'Restart a local service by name. Uses allowlisted service names.',
    category: 'ops',
    destructive: true,
    parameters: {
      type: 'object',
      properties: {
        service: { type: 'string', description: 'Service name to restart' },
        method: { type: 'string', description: 'Restart method', enum: ['systemctl', 'pm2', 'docker-compose', 'launchctl'] },
      },
      required: ['service'],
    },
  },
  {
    name: 'secret_resolve',
    description: 'Resolve a secret name to an opaque handle. Models NEVER see the actual secret value.',
    category: 'ops',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Secret name (e.g. "cloudflare/api_token", "aws/access_key")' },
        store: { type: 'string', description: 'Secret store', enum: ['aws_secrets_manager', 'env', 'keychain'] },
      },
      required: ['name'],
    },
  },

  // =========================================================================
  // TASK MANAGEMENT
  // =========================================================================
  {
    name: 'todo_write',
    description: 'Create or update a task list for tracking multi-step work.',
    category: 'task',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of { content, status: pending|in_progress|completed, id }',
        },
      },
      required: ['todos'],
    },
  },

  // =========================================================================
  // WEB
  // =========================================================================
  {
    name: 'web_fetch',
    description: 'Fetch and process web content. Converts HTML to markdown for analysis.',
    category: 'web',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        prompt: { type: 'string', description: 'What information to extract from the page' },
      },
      required: ['url', 'prompt'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information beyond training data.',
    category: 'web',
    destructive: false,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool lookup helpers
// ---------------------------------------------------------------------------

const _toolMap = new Map(UNIFIED_TOOLS.map((t) => [t.name, t]));

/** Get a tool definition by name */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return _toolMap.get(name);
}

/** Get all tools in a category */
export function getToolsByCategory(category: ToolCategory): ToolDefinition[] {
  return UNIFIED_TOOLS.filter((t) => t.category === category);
}

/** Get all destructive tools (for permission guards) */
export function getDestructiveTools(): ToolDefinition[] {
  return UNIFIED_TOOLS.filter((t) => t.destructive);
}

/** Get tool names as a simple list (for LLM system prompts) */
export function getToolNames(): string[] {
  return UNIFIED_TOOLS.map((t) => t.name);
}

// ---------------------------------------------------------------------------
// Format tools for LLM system prompts
//
// This generates the tool description block that gets injected into
// any agent's system prompt so they know what tools are available.
// Works for: OpenHands (DeepSeek), Synaptic (Qwen3), or any model.
// ---------------------------------------------------------------------------

/**
 * Generate a tool listing for injection into an LLM system prompt.
 *
 * @param categories - Optional filter by categories. If omitted, includes all.
 * @param format - 'compact' for space-efficient, 'full' for complete schemas.
 *
 * @example
 *   // For a DeepSeek swarm worker (all tools):
 *   const toolPrompt = formatToolsForPrompt();
 *
 *   // For a search-only agent:
 *   const toolPrompt = formatToolsForPrompt(['search', 'file_read', 'context']);
 */
export function formatToolsForPrompt(
  categories?: ToolCategory[],
  format: 'compact' | 'full' = 'compact',
): string {
  const tools = categories
    ? UNIFIED_TOOLS.filter((t) => categories.includes(t.category))
    : UNIFIED_TOOLS;

  if (format === 'compact') {
    return tools
      .map((t) => {
        const params = Object.entries(t.parameters.properties)
          .map(([k, v]) => {
            const req = t.parameters.required.includes(k) ? '' : '?';
            return `${k}${req}: ${v.type}`;
          })
          .join(', ');
        const tag = t.destructive ? ' [DESTRUCTIVE]' : '';
        return `- ${t.name}(${params})${tag}\n  ${t.description}`;
      })
      .join('\n');
  }

  // Full JSON Schema format
  return JSON.stringify(
    tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Category → Permission mapping (connects to permission-guard.ts)
// ---------------------------------------------------------------------------

export const CATEGORY_PERMISSION_MAP: Record<ToolCategory, string> = {
  file_read: 'readFiles',
  file_write: 'writeFiles',
  search: 'searchFiles',
  terminal: 'execCommand',
  process: 'listProcesses',
  context: 'readFiles',     // context tools are always allowed if reads are
  ops: 'execCommand',       // ops tools need terminal-level permission
  task: 'readFiles',        // task management is non-destructive
  web: 'readFiles',         // web fetch is read-like
};
