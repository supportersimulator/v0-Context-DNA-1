# IDE Legitimacy + Node-RED Context DNA Integration

> **Invariance**: Every feature below integrates through CapabilityBus events and
> IntegrationProvider contracts. Adding feature N+1 changes exactly ZERO lines in features 1..N.
> This is the anti-miswiring guarantee extended to IDE core infrastructure.

**Status**: Architecture specification
**Scope**: What makes this a legit IDE + how Node-RED becomes Context DNA's visual nervous system
**Companion docs**:
- [anti-miswiring-plugin-extensions.md](./anti-miswiring-plugin-extensions.md) — Provider/CapabilityBus contracts
- [Node-RED-PostgreSQL-coding__chat-Context-DNA.md](../../context-dna/docs/Node-RED-PostgreSQL-coding__chat-Context-DNA.md) — Original Node-RED design doc

---

## Table of Contents

1. [IDE Legitimacy Gap Analysis](#1-ide-legitimacy-gap-analysis)
2. [File Navigation Bus](#2-file-navigation-bus)
3. [Command Palette](#3-command-palette)
4. [Workspace Model](#4-workspace-model)
5. [Keybinding System](#5-keybinding-system)
6. [LSP Bridge](#6-lsp-bridge)
7. [Task Runner](#7-task-runner)
8. [Node-RED as Context DNA Nervous System](#8-node-red-as-context-dna-nervous-system)
9. [Node-RED Custom Node Palette](#9-node-red-custom-node-palette)
10. [Evidence Pipeline Visual Debugger](#10-evidence-pipeline-visual-debugger)
11. [Webhook Injection Flow Designer](#11-webhook-injection-flow-designer)
12. [Scheduler Flow Orchestration](#12-scheduler-flow-orchestration)
13. [Context DNA Service Wiring](#13-context-dna-service-wiring)
14. [Cross-Panel Event Matrix](#14-cross-panel-event-matrix)
15. [Implementation Priority](#15-implementation-priority)
16. [Appendix A: CapabilityBus Event Catalog (Extended)](#appendix-a-capabilitybus-event-catalog-extended)
17. [Appendix B: Node-RED Flow JSON Schemas](#appendix-b-node-red-flow-json-schemas)
18. [Appendix C: Quick Reference](#appendix-c-quick-reference)

---

## 1. IDE Legitimacy Gap Analysis

### 1.1 What We Have (52 Panels)

| Category | Panels | Status |
|----------|--------|--------|
| **Editor** | Monaco code editor, diff viewer, find/replace | Built |
| **Terminal** | xterm.js PTY (Electron), API fallback (web) | Built |
| **Source Control** | Git status, staging, commits, branch display | Built |
| **Debug** | Breakpoints, call stack, variables, console | Built (mock data) |
| **File System** | File explorer, breadcrumb navigation | Built |
| **Problems** | Error/warning/diagnostic list | Built (no feed) |
| **Extensions** | Marketplace, GitHub repos, HuggingFace | Built |
| **Context DNA** | 20+ panels (injection, evidence, professor, etc.) | Built |
| **AI** | Synaptic chat, voice, agents, swarm, librarian | Built |
| **Orchestration** | Docker, Node-RED, LLM management, scheduler | Built |

### 1.2 What Makes an IDE "Legit"

A legitimate IDE is not a collection of panels — it's a **unified workspace** where every panel
communicates through a shared navigation and command model. The gap is not in panel count (we
exceed VS Code's default panel count), but in **connective tissue**:

| Gap | Impact | Priority |
|-----|--------|----------|
| **File Navigation Bus** | Panels can't open files in each other | P0 — Critical |
| **Command Palette** | No unified action discovery | P0 — Critical |
| **Workspace Model** | No "open folder" concept, no project persistence | P1 — High |
| **Keybinding System** | Only 4 view shortcuts, no action keybindings | P1 — High |
| **LSP Bridge** | Problems panel empty, no autocomplete, no go-to-def | P2 — Medium |
| **Task Runner** | No structured build/test output (separate from terminal) | P2 — Medium |
| **Output Channel** | No panel-scoped log output (like VS Code Output panel) | P3 — Nice-to-have |
| **Snippet System** | No code template insertion | P3 — Nice-to-have |

### 1.3 The Unified Mental Model

Every legit IDE follows this flow:

```
User intent → Command Palette → Action → Panel Communication → Visual Feedback
     ↑              ↑               ↑             ↑                  ↑
  Keybinding     Searchable     Registered    CapabilityBus      All panels
  triggers it    actions list   per-panel     events/actions      react
```

**Our gap**: We have CapabilityBus (the nervous system) but haven't wired the brain
(Command Palette) or the reflexes (keybindings) to it.

---

## 2. File Navigation Bus

### 2.1 Problem

Clicking a file in Explorer does nothing to the Editor.
Clicking a git change doesn't open the Diff Viewer.
Clicking a problem doesn't jump to a line in the Editor.

These are **table-stakes** interactions that make panels feel like one tool.

### 2.2 Design: CapabilityBus File Events

Add to `CapabilityEvents` in `integration-manifest.ts`:

```typescript
// File navigation events (IDE core)
'file.open': {
  path: string;
  line?: number;
  column?: number;
  preview?: boolean;    // true = preview tab (replaced on next open)
  source: string;       // which panel triggered it
}
'file.diff': {
  leftPath: string;
  rightPath: string;
  title?: string;
  source: string;
}
'file.reveal': {
  path: string;         // highlight in explorer without opening
  source: string;
}
'file.save': {
  path: string;
  content: string;
  source: string;
}
'file.close': {
  path: string;
  source: string;
}
```

### 2.3 Panel Subscriptions

| Panel | Emits | Subscribes To |
|-------|-------|---------------|
| **Explorer** | `file.open`, `file.reveal` | `file.save` (refresh tree) |
| **Editor** | `file.save`, `file.close` | `file.open`, `file.diff` |
| **Git** | `file.diff`, `file.open` | `file.save` (refresh status) |
| **Problems** | `file.open` (with line) | — |
| **Diff Viewer** | — | `file.diff` |
| **Find/Replace** | `file.open` (with line) | — |
| **Debug** | `file.open` (with line) | — |
| **Breadcrumb** | `file.open` | `file.open` (update display) |
| **Librarian** | `file.open` (search results) | — |
| **Memory Explorer** | `file.open` (SOP source files) | — |

### 2.4 Implementation

**File**: `lib/ide/capability-bus.ts` — Add event types
**File**: `components/ide/panels/file-explorer.tsx` — Emit `file.open` on click
**File**: `components/ide/panels/code-editor-panel.tsx` — Subscribe to `file.open`, `file.diff`
**File**: `components/ide/panels/git-panel.tsx` — Emit `file.diff` on change click
**File**: `components/ide/panels/problems-panel.tsx` — Emit `file.open` with line on click
**File**: `components/ide/panels/debug-panel.tsx` — Emit `file.open` on stack frame click

### 2.5 Follow-Mode

When `file.open` fires from Explorer, the Editor opens the file.
When the Editor's active tab changes, it emits `file.open` with `source: 'editor'`.
Explorer subscribes and auto-reveals the file in the tree (highlight, scroll into view).

This creates the bidirectional sync that makes Explorer and Editor feel unified.

---

## 3. Command Palette

### 3.1 Design

`Cmd+Shift+P` opens a searchable overlay listing every registered action in the IDE.

```
┌─────────────────────────────────────────────────┐
│ > search text here...                            │
├─────────────────────────────────────────────────┤
│  File: Open File...                    ⌘P       │
│  File: Save                            ⌘S       │
│  View: Toggle Terminal                 ⌘`       │
│  Git: Commit All                       ⌘⇧G      │
│  Context DNA: Query Professor          ⌘4       │
│  Node-RED: Deploy Flows                          │
│  Debug: Toggle Breakpoint              F9       │
│  Evidence: Show Pipeline Stats                   │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

### 3.2 Command Registry

**New file**: `lib/ide/command-registry.ts`

```typescript
export interface Command {
  id: string;                          // 'file.open', 'git.commit', 'nodered.deploy'
  label: string;                       // 'File: Open File...'
  category: string;                    // 'File', 'Git', 'Context DNA', 'Node-RED'
  keybinding?: string;                 // '⌘P', '⌘⇧G', 'F9'
  icon?: string;                       // Lucide icon name
  when?: () => boolean;                // Visibility condition
  execute: (...args: unknown[]) => void;
}

export class CommandRegistry {
  register(command: Command): Disposable;
  unregister(id: string): void;
  execute(id: string, ...args: unknown[]): void;
  search(query: string): Command[];
  getAll(): Command[];
  getByCategory(category: string): Command[];
}

export function getCommandRegistry(): CommandRegistry;
```

### 3.3 Integration with CapabilityBus

Commands are the **imperative** layer; CapabilityBus events are the **reactive** layer.

```
Command: "File: Open File"
  → CommandRegistry.execute('file.open', { path })
    → CapabilityBus.emit('file.open', { path, source: 'command-palette' })
      → Editor subscribes, opens file
      → Explorer subscribes, reveals in tree
```

Every panel registers its commands on mount, unregisters on unmount.

### 3.4 Panel Command Registration Pattern

```typescript
// In any panel:
useEffect(() => {
  const registry = getCommandRegistry();
  const disposables = [
    registry.register({
      id: 'terminal.toggle',
      label: 'View: Toggle Terminal',
      category: 'View',
      keybinding: '⌘`',
      execute: () => toggleTerminal(),
    }),
    registry.register({
      id: 'terminal.new',
      label: 'Terminal: New Terminal',
      category: 'Terminal',
      execute: () => createNewTerminal(),
    }),
  ];
  return () => disposables.forEach(d => d.dispose());
}, []);
```

### 3.5 Context DNA Commands

The Command Palette makes Context DNA's 20+ panels discoverable:

| Command | Action |
|---------|--------|
| `Context DNA: Query Professor` | Switch to Professor panel |
| `Context DNA: Show Evidence Pipeline` | Switch to Evidence panel |
| `Context DNA: View Injection` | Enter Live View |
| `Context DNA: Search Learnings` | Open Search panel |
| `Context DNA: Check Health` | Open Health panel |
| `Synaptic: Open Chat` | Switch to Synaptic view |
| `Synaptic: Start Voice` | Toggle voice mode |
| `Node-RED: Open Flow Editor` | Focus Node-RED panel |
| `Node-RED: Deploy Flows` | POST /flows to Node-RED |
| `Node-RED: Show Event Log` | Switch to Event Log tab |

---

## 4. Workspace Model

### 4.1 Problem

There's no concept of "opening a project." The file explorer has no root.
Tabs don't persist across page refreshes. No "recent projects" list.

### 4.2 Design: WorkspaceState

**New file**: `lib/ide/workspace.ts`

```typescript
export interface WorkspaceState {
  /** Absolute path to project root */
  rootPath: string;
  /** Display name */
  name: string;
  /** Open editor tabs */
  openFiles: Array<{
    path: string;
    active: boolean;
    viewState?: unknown;  // Monaco editor state (scroll, cursor)
  }>;
  /** Panel layout */
  layout: {
    activePanels: string[];
    customPages: string[];  // IDs
    focusMode: boolean;
    activeView: string;
  };
  /** Last opened timestamp */
  lastOpened: number;
}

export interface WorkspaceManager {
  getCurrent(): WorkspaceState | null;
  open(rootPath: string): Promise<void>;
  save(): void;
  getRecent(limit?: number): WorkspaceState[];
  clearRecent(): void;
}
```

### 4.3 Persistence Strategy

```
localStorage:
  contextdna_workspace_current  → WorkspaceState (JSON)
  contextdna_workspace_recent   → WorkspaceState[] (last 10)

On page load:
  1. Load WorkspaceState from localStorage
  2. Restore open files → Editor tabs
  3. Restore panel layout → DashboardShell
  4. Restore custom pages → Custom page state
  5. Set Explorer root → File tree

On file open/close, tab change, layout change:
  → Auto-save WorkspaceState (debounced 1s)
```

### 4.4 "Open Folder" Flow

1. Command Palette: "File: Open Folder..."
2. In Electron: native folder picker → `rootPath`
3. In Web: backend API `/api/workspace/open` with path input
4. Explorer panel receives `workspace.opened` event → rebuilds file tree
5. WorkspaceState saved to localStorage

---

## 5. Keybinding System

### 5.1 Design

**New file**: `lib/ide/keybindings.ts`

```typescript
export interface Keybinding {
  /** Platform-normalized key combo: 'mod+shift+p', 'f9', 'mod+`' */
  key: string;
  /** Command ID to execute */
  commandId: string;
  /** Context condition (when clause) */
  when?: string;
  /** Source: 'default' | 'user' | 'extension' */
  source: string;
}

export class KeybindingService {
  /** Process a keyboard event, return true if handled */
  handle(event: KeyboardEvent): boolean;
  /** Register keybinding */
  register(keybinding: Keybinding): Disposable;
  /** Get all keybindings for a command */
  getKeybindingsFor(commandId: string): Keybinding[];
  /** User override */
  setUserKeybinding(commandId: string, key: string): void;
  /** Reset to defaults */
  resetAll(): void;
}
```

### 5.2 Default Keybindings

| Key | Command | Category |
|-----|---------|----------|
| `⌘⇧P` | Command Palette | Core |
| `⌘P` | Quick Open (file) | File |
| `⌘S` | Save | File |
| `⌘⇧S` | Save All | File |
| `⌘W` | Close Tab | File |
| `⌘\`` | Toggle Terminal | View |
| `⌘B` | Toggle Sidebar | View |
| `⌘J` | Toggle Bottom Panel | View |
| `⌘1` | Live View | Navigation |
| `⌘2` | Synaptic | Navigation |
| `⌘3` | Dashboard | Navigation |
| `⌘4` | Professor | Navigation |
| `⌘⇧G` | Git Panel | Source Control |
| `⌘⇧E` | File Explorer | Source Control |
| `⌘⇧D` | Debug Panel | Debug |
| `⌘⇧M` | Problems Panel | Debug |
| `F5` | Start/Continue Debug | Debug |
| `F9` | Toggle Breakpoint | Debug |
| `F10` | Step Over | Debug |
| `F11` | Step Into | Debug |
| `⇧F11` | Step Out | Debug |
| `⌘⇧N` | Node-RED Panel | Context DNA |
| `⌘⇧I` | Injection Viewer | Context DNA |
| `⌘⇧L` | Today's Learnings | Context DNA |

### 5.3 "When" Context System

Keybindings can be conditional:

```typescript
// F5 starts debug only when not already running
{ key: 'f5', commandId: 'debug.start', when: 'debugState == stopped' }

// Escape closes palette only when palette is open
{ key: 'escape', commandId: 'palette.close', when: 'paletteVisible' }

// ⌘S saves only when editor has focus
{ key: 'mod+s', commandId: 'file.save', when: 'editorFocused' }
```

Context variables are set by panels via `KeybindingService.setContext(key, value)`.

---

## 6. LSP Bridge

### 6.1 Design

Connect the Monaco editor to a Language Server Protocol backend for:
- Autocomplete (IntelliSense)
- Go to definition / references
- Hover documentation
- Diagnostics → Problems panel feed

### 6.2 Architecture

```
Monaco Editor ←→ LSP Client (monaco-languageclient)
                      ↕
              WebSocket / HTTP
                      ↕
              LSP Server (backend)
                ├── TypeScript (tsserver)
                ├── Python (pyright/pylsp)
                └── JSON/YAML/TOML
```

### 6.3 Diagnostics → Problems Panel

```typescript
// LSP client receives diagnostics
lspClient.onDiagnostics((uri, diagnostics) => {
  const bus = getCapabilityBus();
  bus.emit('diagnostics.updated', {
    path: uri,
    diagnostics: diagnostics.map(d => ({
      severity: d.severity,    // error | warning | info | hint
      message: d.message,
      range: d.range,
      source: d.source,
      code: d.code,
    })),
  });
});

// Problems panel subscribes
bus.on('diagnostics.updated', ({ path, diagnostics }) => {
  updateProblemsForFile(path, diagnostics);
});
```

### 6.4 Scope

LSP is P2 because it requires a backend language server. In Electron, we can spawn
`tsserver` locally. In web mode, the backend must proxy LSP over WebSocket.

The immediate value is wiring **diagnostics → Problems panel** — even without LSP,
we can parse build output and emit `diagnostics.updated` events.

---

## 7. Task Runner

### 7.1 Design

Structured task execution with problem matchers (parse errors from output).

**New file**: `lib/ide/task-runner.ts`

```typescript
export interface TaskDefinition {
  id: string;
  label: string;
  command: string;             // Shell command
  problemMatcher?: string;     // Regex pattern for errors
  group?: 'build' | 'test';   // Task grouping
  presentation?: {
    reveal: 'always' | 'silent' | 'never';
    panel: 'shared' | 'dedicated';
  };
}

export interface TaskExecution {
  taskId: string;
  pid?: number;
  status: 'running' | 'completed' | 'failed';
  output: string[];
  diagnostics: Diagnostic[];  // Parsed from output via problemMatcher
  exitCode?: number;
  startTime: number;
  endTime?: number;
}
```

### 7.2 Problem Matchers

Parse build/test output into diagnostics:

```typescript
const PROBLEM_MATCHERS: Record<string, RegExp> = {
  // TypeScript: src/file.ts(10,5): error TS2345: ...
  typescript: /^(.+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/,

  // ESLint: /path/file.js:10:5 error ...
  eslint: /^(.+):(\d+):(\d+)\s+(error|warning)\s+(.+)$/,

  // Python: File "file.py", line 10, ...
  python: /^File "(.+)", line (\d+)/,

  // Generic: file:line:col: severity: message
  generic: /^(.+):(\d+):(\d+):\s*(error|warning|info):\s*(.+)$/,
};
```

When a task runs, output lines are checked against the problem matcher.
Matches emit `diagnostics.updated` → Problems panel updates in real-time.

---

## 8. Node-RED as Context DNA Nervous System

### 8.1 Philosophy

```
Context DNA (brain)  ←→  Node-RED (nervous system)  ←→  External world
   learnings              visual event flows              APIs, webhooks
   evidence               debuggable pipelines            services
   injection              real-time message flow           automation
```

Node-RED is NOT "another tool to run." It becomes **the visual debugger for Context
DNA's event-driven architecture**. Every internal pipeline (evidence, injection,
scheduler) can be represented as a visual flow that operators can inspect, modify,
and extend.

### 8.2 Integration Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  admin.contextdna.io (IDE)                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Node-RED  │  │ Evidence │  │Injection │  │ Scheduler        │ │
│  │ Panel     │←→│ Panel    │←→│ Viewer   │←→│ Panel            │ │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬──────────┘ │
│        │              │             │                │            │
│        └──────────────┴─────────────┴────────────────┘            │
│                              ↕                                    │
│                     CapabilityBus                                 │
└──────────────────────────────┼────────────────────────────────────┘
                               ↕
        ┌──────────────────────┴──────────────────────┐
        │          Node-RED Runtime (:1880)            │
        │                                              │
        │  ┌──────────────────────────────────────┐   │
        │  │  contextdna-* custom node palette     │   │
        │  │                                        │   │
        │  │  ┌────────────┐  ┌──────────────────┐ │   │
        │  │  │ cd-query   │  │ cd-evidence      │ │   │
        │  │  │ cd-learn   │  │ cd-inject        │ │   │
        │  │  │ cd-professor│  │ cd-8th-intel    │ │   │
        │  │  │ cd-webhook │  │ cd-scheduler     │ │   │
        │  │  └────────────┘  └──────────────────┘ │   │
        │  └──────────────────────────────────────┘   │
        │                                              │
        │  ┌──────────────┐  ┌───────────────────┐   │
        │  │ FastAPI Agent │  │ PostgreSQL        │   │
        │  │ (:8000)       │  │ (context_dna DB)  │   │
        │  └──────────────┘  └───────────────────┘   │
        └─────────────────────────────────────────────┘
```

### 8.3 Data Flow Examples

**Example 1: Learning Captured → Evidence → Wisdom**
```
[Trigger: learning POST]
  → cd-webhook node (receives /api/learnings POST)
    → cd-evidence node (quarantine_item)
      → delay node (wait for N outcomes)
        → switch node (N >= threshold?)
          → YES: cd-evidence node (promote to claim)
            → cd-query node (check existing wisdom)
              → switch (duplicate?)
                → NO: cd-learn node (promote to wisdom)
          → NO: debug node (log "insufficient evidence")
```

**Example 2: Webhook Injection Assembly**
```
[Trigger: Claude Code tool call]
  → Section 0: cd-inject:safety (hard constraints)
    → Section 1: cd-inject:foundation (file context + SOPs)
      → Section 2: cd-inject:wisdom (professor query)
        → Section 3: cd-inject:awareness (recent changes)
          → Section 4: cd-inject:deep (blueprint, brain state)
            → Section 5: cd-inject:protocol (success capture)
              → Section 6: cd-inject:holistic (Synaptic → Atlas)
                → Section 7: cd-inject:library (if escalation)
                  → Section 8: cd-inject:8th (Synaptic → Aaron)
                    → HTTP response node (assembled payload)
```

**Example 3: Scheduler Job Monitoring**
```
[cron trigger: */10 * * * *]
  → cd-scheduler:job node (execute hindsight_validator)
    → switch (exit code)
      → 0: cd-evidence node (capture_success)
      → !0: cd-evidence node (capture_failure)
        → cd-webhook node (notify IDE via WebSocket)
          → IDE Problems panel shows error
```

### 8.4 Panel Integration via CapabilityBus

New events for Node-RED ↔ IDE communication:

```typescript
// Node-RED → IDE
'nodered.flow.deployed': {
  flowId: string;
  nodeCount: number;
  timestamp: number;
}
'nodered.message.received': {
  flowId: string;
  nodeId: string;
  topic: string;
  payload: unknown;
  timestamp: number;
}
'nodered.error': {
  flowId: string;
  nodeId: string;
  error: string;
  timestamp: number;
}
'nodered.debug': {
  nodeId: string;
  name: string;
  msg: unknown;
  timestamp: number;
}

// IDE → Node-RED
'nodered.flow.deploy': {
  flows: unknown[];  // Node-RED flow JSON
}
'nodered.inject': {
  nodeId: string;    // Trigger an inject node
}
'nodered.enable': {
  nodeId: string;
  enabled: boolean;
}
```

### 8.5 Service Registration

Add to `service-registry.ts`:

```typescript
// Existing
nodered:        { base: 'http://127.0.0.1:1880',  env: 'NEXT_PUBLIC_NODERED_API' },
nodered_agent:  { base: 'http://127.0.0.1:8000',  env: 'NEXT_PUBLIC_NODERED_AGENT_API' },

// New WebSocket endpoints
nodered_ws:     { service: 'nodered', path: '/comms' },  // Node-RED WebSocket API
nodered_debug:  { service: 'nodered', path: '/debug' },  // Debug message stream
```

---

## 9. Node-RED Custom Node Palette

### 9.1 The `node-red-contrib-contextdna` Package

A custom Node-RED node package that provides drag-and-drop Context DNA building blocks.

### 9.2 Node Definitions

| Node | Category | Inputs | Outputs | Purpose |
|------|----------|--------|---------|---------|
| `cd-query` | Context DNA | msg.payload (query string) | msg.payload (results[]) | Query learnings, SOPs, patterns |
| `cd-learn` | Context DNA | msg.payload (learning object) | msg.payload (id) | Record a new learning |
| `cd-evidence` | Context DNA | msg.payload (item) | msg.payload (result) | Submit to evidence pipeline |
| `cd-inject` | Context DNA | msg.payload (context) | msg.payload (sections[]) | Trigger webhook injection assembly |
| `cd-professor` | Context DNA | msg.payload (question) | msg.payload (wisdom) | Consult the Professor |
| `cd-8th-intel` | Context DNA | msg.payload (context) | msg.payload (response) | Query 8th Intelligence |
| `cd-webhook` | Context DNA | HTTP trigger | msg.payload | Receive webhook events |
| `cd-scheduler` | Context DNA | cron trigger | msg.payload (job result) | Execute scheduler job |
| `cd-health` | Context DNA | inject trigger | msg.payload (status) | Check service health |
| `cd-ws-broadcast` | Context DNA | msg.payload | — | Broadcast to IDE WebSocket |

### 9.3 Node Implementation Pattern

Each node follows the standard Node-RED node pattern:

```javascript
// cd-query.js
module.exports = function(RED) {
  function ContextDNAQueryNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const baseUrl = config.apiUrl || 'http://127.0.0.1:8080';

    node.on('input', async function(msg) {
      try {
        node.status({ fill: 'blue', shape: 'dot', text: 'querying...' });
        const query = msg.payload?.query || msg.payload;
        const response = await fetch(`${baseUrl}/api/learnings?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        msg.payload = data;
        node.status({ fill: 'green', shape: 'dot', text: `${data.length} results` });
        node.send(msg);
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: err.message });
        node.error(err.message, msg);
      }
    });
  }
  RED.nodes.registerType('cd-query', ContextDNAQueryNode);
};
```

### 9.4 Node HTML (Editor UI)

Each node has a corresponding HTML file for the Node-RED editor:

```html
<!-- cd-query.html -->
<script type="text/javascript">
  RED.nodes.registerType('cd-query', {
    category: 'Context DNA',
    color: '#22c55e',
    defaults: {
      name: { value: '' },
      apiUrl: { value: 'http://127.0.0.1:8080' },
      queryType: { value: 'learnings' },
      limit: { value: 20 },
    },
    inputs: 1,
    outputs: 1,
    icon: 'dna.svg',
    label: function() { return this.name || 'cd-query'; },
    paletteLabel: 'CD Query',
  });
</script>
```

### 9.5 Installation

```bash
cd ~/.node-red
npm install node-red-contrib-contextdna
# or in Docker Compose:
# volumes:
#   - ./node-red-contrib-contextdna:/data/node_modules/node-red-contrib-contextdna
```

---

## 10. Evidence Pipeline Visual Debugger

### 10.1 Concept

The evidence pipeline (quarantine → claim → applied_to_wisdom) is currently invisible
except through database queries. Node-RED makes it **visible and debuggable**.

### 10.2 Flow Template: Evidence Pipeline Monitor

```json
{
  "id": "evidence-pipeline-monitor",
  "label": "Evidence Pipeline Monitor",
  "nodes": [
    {
      "type": "cd-webhook",
      "name": "Learning Received",
      "wires": [["quarantine-check"]],
      "config": { "path": "/api/learnings", "method": "POST" }
    },
    {
      "type": "cd-evidence",
      "id": "quarantine-check",
      "name": "Quarantine Check",
      "wires": [["evidence-count"]],
      "config": { "action": "quarantine", "minConfidence": 0.7 }
    },
    {
      "type": "function",
      "id": "evidence-count",
      "name": "Check Evidence Count",
      "wires": [["promote-switch"]],
      "func": "msg.evidenceCount = msg.payload.outcomes?.length || 0;\nreturn msg;"
    },
    {
      "type": "switch",
      "id": "promote-switch",
      "name": "Sufficient Evidence?",
      "property": "evidenceCount",
      "rules": [
        { "t": "gte", "v": 30, "vt": "num" },
        { "t": "lt", "v": 30, "vt": "num" }
      ],
      "wires": [["promote"], ["wait-more"]]
    },
    {
      "type": "cd-evidence",
      "id": "promote",
      "name": "Promote to Claim",
      "config": { "action": "promote" }
    },
    {
      "type": "debug",
      "id": "wait-more",
      "name": "Needs More Evidence"
    }
  ]
}
```

### 10.3 IDE Panel Integration

The Evidence panel shows aggregated stats. The Node-RED panel shows the **live flow**
of individual items through the pipeline. Together they provide both macro and micro views.

CapabilityBus wiring:
```
Evidence Panel ──[evidence.item.promoted]──→ Node-RED Panel (highlight promote node)
Node-RED Panel ──[nodered.debug]──→ Evidence Panel (show latest message)
```

---

## 11. Webhook Injection Flow Designer

### 11.1 Concept

The 9-section webhook injection is currently hardcoded in Python
(`persistent_hook_structure.py`). A Node-RED flow representation allows:

1. **Visual debugging** — See which section takes how long
2. **Live inspection** — Click any section node to see its output
3. **A/B testing** — Branch flows for variant_a vs control
4. **Custom sections** — Drag in new nodes to add custom injection logic

### 11.2 Flow Template: Webhook Injection Pipeline

```
[HTTP In: POST /contextdna/inject]
  → [Section 0: Safety] → timing: 2ms
    → [Section 1: Foundation] → timing: 15ms
      → [Section 2: Wisdom] → timing: 45ms (LLM call)
        → [Section 3: Awareness] → timing: 8ms
          → [Section 4: Deep Context] → timing: 12ms
            → [Section 5: Protocol] → timing: 3ms
              → [Section 6: Holistic] → timing: 35ms (LLM call)
                → [Section 7: Library] → timing: 0ms (skipped)
                  → [Section 8: 8th Intel] → timing: 50ms (LLM call)
                    → [Assemble Payload]
                      → [HTTP Response]
```

Each section node shows:
- **Green dot**: Completed successfully
- **Blue dot**: Processing
- **Red ring**: Error
- **Gray**: Skipped (e.g., Section 7 when not escalated)
- **Status text**: Timing in ms

### 11.3 Bidirectional Sync

Changes in the Node-RED flow designer can optionally sync back to the Python
injection pipeline:

```
Node-RED flow JSON → Parse section order → Update section_config.json
                                            → agent_service reads on next injection
```

This is **optional and gated** — users must explicitly enable "flow-to-code sync"
in settings. By default, the flow is read-only (mirrors the Python pipeline).

---

## 12. Scheduler Flow Orchestration

### 12.1 Concept

The 24+ scheduler jobs in `lite_scheduler.py` can each be a Node-RED flow.
Benefits:
- Visual job dependency graphs
- Real-time execution monitoring
- Easy retry/skip/pause per job
- Conditional logic without code changes

### 12.2 Job → Flow Mapping

| Scheduler Job | Node-RED Flow | Cron |
|---------------|---------------|------|
| `hindsight_validation` | `cd-scheduler` → `cd-evidence` | */10 * * * * |
| `failure_pattern_analysis` | `cd-scheduler` → `cd-query` → `cd-evidence` | */30 * * * * |
| `mmotw_repair_mining` | `cd-scheduler` → `cd-query` → `cd-learn` | 0 */2 * * * |
| `evidence_promotion` | `cd-scheduler` → `cd-evidence` | */15 * * * * |
| `session_historian` | `cd-scheduler` → `cd-webhook` | */2 * * * * |
| `meta_analysis` | `cd-scheduler` → `cd-professor` → `cd-evidence` | */30 * * * * |
| `vllm_watchdog` | `cd-health` → switch → `cd-scheduler` | * * * * * |
| `codebase_graph` | `cd-scheduler` → `cd-learn` | 0 * * * * |
| `user_sentiment` | `cd-scheduler` → `cd-8th-intel` | */5 * * * * |

### 12.3 IDE Integration

The Scheduler panel (swarm-controller) shows job status.
The Node-RED panel shows the **flow execution** of each job.

CapabilityBus wiring:
```
Scheduler ──[scheduler.job.started]──→ Node-RED (highlight job flow)
Scheduler ──[scheduler.job.failed]──→ Node-RED (show error on flow)
                                    ──→ Problems panel (add diagnostic)
Node-RED  ──[nodered.flow.deployed]──→ Scheduler (update job config)
```

---

## 13. Context DNA Service Wiring

### 13.1 Complete Service Map

All Context DNA services and their Node-RED integration points:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Context DNA Ecosystem                             │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │agent_service│  │context-dna   │  │ vllm-mlx     │              │
│  │   :8080     │  │   :3456      │  │   :5044      │              │
│  │             │  │              │  │              │              │
│  │ Webhook     │  │ Learnings    │  │ Qwen3-14B   │              │
│  │ Injection   │  │ Evidence     │  │ Professor    │              │
│  │ Scheduler   │  │ SOPs         │  │ Section 2/8  │              │
│  │ Sessions    │  │ Graph        │  │ Hindsight    │              │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                │                 │                       │
│         └────────────────┼─────────────────┘                       │
│                          │                                          │
│                   ┌──────┴───────┐                                  │
│                   │   Node-RED   │                                  │
│                   │    :1880     │                                  │
│                   │              │                                  │
│                   │  Flows that  │                                  │
│                   │  VISUALIZE   │                                  │
│                   │  all above   │                                  │
│                   └──────┬───────┘                                  │
│                          │                                          │
│                   ┌──────┴───────┐                                  │
│                   │  PostgreSQL  │                                  │
│                   │    :5432     │                                  │
│                   │              │                                  │
│                   │ context_dna  │                                  │
│                   │ database     │                                  │
│                   └──────────────┘                                  │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Redis      │  │ Synaptic     │  │ Django       │              │
│  │   :6379     │  │   :8888      │  │   :8000      │              │
│  │ Caching     │  │ Chat + Voice │  │ Backend API  │              │
│  │ Pub/Sub     │  │ 8th Intel    │  │ Control      │              │
│  └─────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### 13.2 Node-RED as the "Window Into" Each Service

| Service | Node-RED Visibility |
|---------|--------------------|
| agent_service | Injection assembly, scheduler execution, session events |
| context-dna API | Learning CRUD, evidence transitions, SOP management |
| vllm-mlx | LLM query flow, thinking chains, fallback behavior |
| Redis | Cache hits/misses, pub/sub message flow |
| PostgreSQL | Query execution, data flow between tables |
| Synaptic | Chat message routing, voice transcription flow |

### 13.3 Flow Templates as SOPs

Node-RED flows are JSON — they can be stored as Context DNA artifacts:

```typescript
interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'evidence' | 'injection' | 'scheduler' | 'automation' | 'monitoring';
  flow_json: object[];         // Node-RED flow definition
  variables: Record<string, {  // Configurable parameters
    label: string;
    type: 'string' | 'number' | 'boolean';
    default: unknown;
  }>;
  evidence_linked: boolean;    // Tracked by evidence pipeline?
  sop_id?: string;             // Linked to existing SOP?
}
```

Flow templates are stored in `flow_templates` table in PostgreSQL,
linked to `sop_outcome_rollup` for evidence-based flow selection.

---

## 14. Cross-Panel Event Matrix

### 14.1 Complete Event Wiring Map

This matrix shows every CapabilityBus event and which panels participate:

| Event | Emitters | Subscribers |
|-------|----------|-------------|
| **File Navigation** | | |
| `file.open` | Explorer, Git, Problems, Debug, Find, Librarian, Memory | Editor, Breadcrumb, Explorer (follow) |
| `file.diff` | Git | Diff Viewer |
| `file.reveal` | Editor | Explorer |
| `file.save` | Editor | Explorer, Git |
| `file.close` | Editor | Breadcrumb |
| **Diagnostics** | | |
| `diagnostics.updated` | LSP Bridge, Task Runner, Build | Problems, Editor (squiggles) |
| **Node-RED** | | |
| `nodered.flow.deployed` | Node-RED Panel | Scheduler, Evidence, Status Bar |
| `nodered.message.received` | Node-RED Panel | Evidence, Injection Viewer |
| `nodered.error` | Node-RED Panel | Problems, Notifications |
| `nodered.debug` | Node-RED Panel | Evidence, Debug Console |
| **Evidence** | | |
| `evidence.item.quarantined` | Evidence Panel | Node-RED (highlight flow) |
| `evidence.item.promoted` | Evidence Panel | Node-RED, Notifications |
| `evidence.item.rejected` | Evidence Panel | Node-RED, Notifications |
| **Injection** | | |
| `injection.started` | Injection Viewer | Node-RED (start flow trace) |
| `injection.section.complete` | Injection Viewer | Node-RED (advance flow) |
| `injection.complete` | Injection Viewer | Node-RED, Status Bar |
| **Scheduler** | | |
| `scheduler.job.started` | Scheduler Panel | Node-RED (highlight job flow) |
| `scheduler.job.completed` | Scheduler Panel | Node-RED, Evidence |
| `scheduler.job.failed` | Scheduler Panel | Node-RED, Problems, Notifications |
| **Workspace** | | |
| `workspace.opened` | Workspace Manager | Explorer, Editor, Git, Terminal |
| `workspace.closed` | Workspace Manager | Explorer, Editor |

### 14.2 Event Flow Diagram

```
                    ┌─────────────┐
              ┌─────│ Command     │─────┐
              │     │ Palette     │     │
              │     └─────────────┘     │
              ▼                         ▼
     ┌────────────────┐       ┌────────────────┐
     │ Keybinding     │       │ Panel Action   │
     │ Service        │       │ Buttons        │
     └───────┬────────┘       └───────┬────────┘
             │                        │
             ▼                        ▼
     ┌──────────────────────────────────────────┐
     │           Command Registry               │
     │  (imperative: do this action)             │
     └─────────────────┬────────────────────────┘
                       │
                       ▼
     ┌──────────────────────────────────────────┐
     │           CapabilityBus                  │
     │  (reactive: this happened, react)        │
     └─────────────────┬────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐ ┌────────┐ ┌──────────┐
   │ Editor     │ │ Git    │ │ Node-RED │
   │ Panel      │ │ Panel  │ │ Panel    │
   └────────────┘ └────────┘ └──────────┘
```

---

## 15. Implementation Priority

### Phase 1: File Navigation Bus + Command Palette (makes it feel like an IDE)

| Task | Files | Effort |
|------|-------|--------|
| Add file events to CapabilityEvents | `integration-manifest.ts` | S |
| Wire Explorer → Editor file.open | `file-explorer.tsx`, `code-editor-panel.tsx` | M |
| Wire Git → Diff Viewer file.diff | `git-panel.tsx`, `diff-viewer-panel.tsx` | S |
| Wire Problems → Editor file.open(line) | `problems-panel.tsx` | S |
| Wire Debug → Editor file.open(line) | `debug-panel.tsx` | S |
| Build CommandRegistry | `command-registry.ts` (new) | M |
| Build CommandPalette component | `command-palette.tsx` (new) | M |
| Register panel commands | Each panel file | M |
| Wire to DashboardShell (⌘⇧P) | `DashboardShell.tsx` | S |

### Phase 2: Workspace + Keybindings (makes it function like an IDE)

| Task | Files | Effort |
|------|-------|--------|
| Build WorkspaceManager | `workspace.ts` (new) | M |
| Build KeybindingService | `keybindings.ts` (new) | M |
| Persist open tabs | `code-editor-panel.tsx` | S |
| Recent projects list | `home-view.tsx` | S |
| "When" context system | `keybindings.ts` | M |

### Phase 3: Node-RED Deep Integration (Context DNA's nervous system)

| Task | Files | Effort |
|------|-------|--------|
| Add Node-RED events to CapabilityEvents | `integration-manifest.ts` | S |
| Build `huggingface-api.ts` | `huggingface-api.ts` (new) | S |
| Build evidence-pipeline flow template | Node-RED flow JSON | M |
| Build injection flow template | Node-RED flow JSON | M |
| Build scheduler flow templates | Node-RED flow JSON | L |
| Wire Node-RED ↔ Evidence panel | Both panels | M |
| Wire Node-RED ↔ Injection Viewer | Both panels | M |
| Wire Node-RED ↔ Scheduler panel | Both panels | M |
| Build `node-red-contrib-contextdna` | New package (10 nodes) | L |

### Phase 4: LSP + Task Runner (full development capability)

| Task | Files | Effort |
|------|-------|--------|
| Build TaskRunner | `task-runner.ts` (new) | M |
| Problem matchers | `task-runner.ts` | S |
| Wire Task Runner → Problems | Via CapabilityBus | S |
| LSP client integration | `code-editor-panel.tsx` | L |
| Diagnostics → Problems feed | Via CapabilityBus | M |

### Effort Key
- **S** = Small (< 50 lines, < 1 hour)
- **M** = Medium (50-200 lines, 1-3 hours)
- **L** = Large (200+ lines, 3+ hours)

---

## Appendix A: CapabilityBus Event Catalog (Extended)

Complete list of all events after IDE legitimacy + Node-RED integration:

### File Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `file.open` | `{ path, line?, column?, preview?, source }` | Any → Editor |
| `file.diff` | `{ leftPath, rightPath, title?, source }` | Git → Diff |
| `file.reveal` | `{ path, source }` | Any → Explorer |
| `file.save` | `{ path, content, source }` | Editor → Any |
| `file.close` | `{ path, source }` | Editor → Any |
| `file.created` | `{ path, source }` | Explorer → Git |
| `file.deleted` | `{ path, source }` | Explorer → Git, Editor |
| `file.renamed` | `{ oldPath, newPath, source }` | Explorer → Git, Editor |

### Diagnostic Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `diagnostics.updated` | `{ path, diagnostics[] }` | LSP/Task → Problems, Editor |
| `diagnostics.cleared` | `{ path?, source }` | LSP → Problems |

### Node-RED Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `nodered.flow.deployed` | `{ flowId, nodeCount, timestamp }` | NR → IDE |
| `nodered.flow.deploy` | `{ flows[] }` | IDE → NR |
| `nodered.message.received` | `{ flowId, nodeId, topic, payload }` | NR → IDE |
| `nodered.error` | `{ flowId, nodeId, error }` | NR → Problems |
| `nodered.debug` | `{ nodeId, name, msg }` | NR → Debug Console |
| `nodered.inject` | `{ nodeId }` | IDE → NR |
| `nodered.enable` | `{ nodeId, enabled }` | IDE → NR |

### Evidence Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `evidence.item.quarantined` | `{ id, type, confidence }` | Evidence → NR |
| `evidence.item.promoted` | `{ id, fromStage, toStage }` | Evidence → NR, Notif |
| `evidence.item.rejected` | `{ id, reason }` | Evidence → NR, Notif |
| `evidence.stats.updated` | `{ claims, quarantine, outcomes }` | Evidence → Status |

### Injection Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `injection.started` | `{ injectionId, variant }` | Injection → NR |
| `injection.section.complete` | `{ section, timing_ms, skipped }` | Injection → NR |
| `injection.complete` | `{ injectionId, totalMs, sections }` | Injection → NR, Status |

### Scheduler Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `scheduler.job.started` | `{ jobId, name }` | Scheduler → NR |
| `scheduler.job.completed` | `{ jobId, name, duration_ms }` | Scheduler → NR, Evidence |
| `scheduler.job.failed` | `{ jobId, name, error }` | Scheduler → NR, Problems |

### Workspace Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `workspace.opened` | `{ rootPath, name }` | Workspace → All |
| `workspace.closed` | `{}` | Workspace → All |

### Command Events
| Event | Payload | Direction |
|-------|---------|-----------|
| `command.executed` | `{ commandId, args }` | Registry → Audit Log |
| `palette.opened` | `{}` | User action → UI |
| `palette.closed` | `{}` | UI → Keybinding |

---

## Appendix B: Node-RED Flow JSON Schemas

### Flow Template Schema

```typescript
interface FlowTemplate {
  id: string;
  label: string;
  category: 'evidence' | 'injection' | 'scheduler' | 'automation' | 'monitoring';
  description: string;
  version: string;
  nodes: FlowNode[];
  connections: FlowConnection[];
  variables: FlowVariable[];
}

interface FlowNode {
  id: string;
  type: string;          // 'cd-query', 'cd-evidence', 'function', etc.
  name: string;
  x: number;
  y: number;
  config: Record<string, unknown>;
  wires: string[][];     // Output connections
}

interface FlowConnection {
  source: string;        // Node ID
  sourcePort: number;
  target: string;        // Node ID
}

interface FlowVariable {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: unknown;
  options?: string[];    // For select type
  description: string;
}
```

### PostgreSQL Table: `flow_templates`

```sql
CREATE TABLE IF NOT EXISTS flow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'evidence', 'injection', 'scheduler', 'automation', 'monitoring'
  )),
  flow_json JSONB NOT NULL,
  variables JSONB DEFAULT '[]',
  sop_id TEXT REFERENCES sop_outcome_rollup(sop_title),
  evidence_linked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version TEXT DEFAULT '1.0.0'
);

CREATE INDEX idx_flow_templates_category ON flow_templates(category);
CREATE INDEX idx_flow_templates_sop ON flow_templates(sop_id) WHERE sop_id IS NOT NULL;
```

---

## Appendix C: Quick Reference

### New Files to Create

| File | Purpose | Phase |
|------|---------|-------|
| `lib/ide/command-registry.ts` | Command registration + search + execution | 1 |
| `components/ide/command-palette.tsx` | Searchable overlay UI | 1 |
| `lib/ide/workspace.ts` | Project state persistence | 2 |
| `lib/ide/keybindings.ts` | Keyboard shortcut routing | 2 |
| `lib/ide/task-runner.ts` | Structured command execution + problem matching | 4 |
| `lib/ide/nodered-bridge.ts` | Node-RED WebSocket client + flow management | 3 |

### Files to Modify

| File | Changes | Phase |
|------|---------|-------|
| `lib/ide/integration-manifest.ts` | Add file, diagnostic, nodered, evidence, injection, scheduler, workspace events | 1 |
| `lib/ide/capability-bus.ts` | Import extended event types | 1 |
| `components/ide/panels/file-explorer.tsx` | Emit `file.open` on click | 1 |
| `components/ide/panels/code-editor-panel.tsx` | Subscribe to `file.open`, `file.diff` | 1 |
| `components/ide/panels/git-panel.tsx` | Emit `file.diff` on change click | 1 |
| `components/ide/panels/problems-panel.tsx` | Subscribe to `diagnostics.updated`, emit `file.open` | 1 |
| `components/ide/panels/debug-panel.tsx` | Emit `file.open` on frame click | 1 |
| `components/ide/panels/node-red-panel.tsx` | Add flow template loading, evidence wiring, scheduler wiring | 3 |
| `components/dashboard/DashboardShell.tsx` | Add `⌘⇧P` handler, render CommandPalette | 1 |
| `lib/ide/service-registry.ts` | Add Node-RED WebSocket endpoints | 3 |

### Architecture Invariants

1. **CapabilityBus is the ONLY cross-panel communication channel** — no direct imports between panels
2. **CommandRegistry delegates to CapabilityBus** — commands are imperative triggers for reactive events
3. **Node-RED flows are read-only mirrors by default** — write-back requires explicit opt-in
4. **Flow templates are evidence-linked** — every template can be tracked by the evidence pipeline
5. **All new keybindings are user-overridable** — defaults are suggestions, not mandates
6. **Workspace state is localStorage-first** — no backend dependency for IDE persistence
7. **LSP is optional** — Problems panel works without LSP via task runner problem matchers
8. **Every event has a `source` field** — audit trail of which panel triggered what

---

*Generated for admin.contextdna.io IDE — the Context DNA development environment.*
