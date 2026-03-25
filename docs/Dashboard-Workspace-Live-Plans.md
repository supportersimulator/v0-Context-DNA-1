# Dashboard-Workspace-Live Plans

> Extracted from Aaron's finalizations in `Dashboard-Workspace-Live.md` + research on Electron packaging, VS Code extension integration, agent delegation, and measurement systems.
>
> Date: 2026-02-12

---

## Table of Contents

1. [Three-Page Architecture](#1-three-page-architecture)
2. [Dashboard Page — Measurement Cockpit](#2-dashboard-page--measurement-cockpit)
3. [Workspace Page — DockView IDE](#3-workspace-page--dockview-ide)
4. [Live Page — Extensible Panel Host](#4-live-page--extensible-panel-host)
5. [Editor Panel — Agent Delegation Model](#5-editor-panel--agent-delegation-model)
6. [VS Code Extension Integration](#6-vs-code-extension-integration)
7. [Electron Packaging — Product Isolation](#7-electron-packaging--product-isolation)
8. [Config Packs & Secret Protection](#8-config-packs--secret-protection)
9. [Database Sync Protection](#9-database-sync-protection)
10. [Learnings Autonomy & Evidence Pipeline](#10-learnings-autonomy--evidence-pipeline)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [License Audit](#12-license-audit)
13. [Gap Analysis — DONE / PARTIAL / MISSING](#13-gap-analysis--done--partial--missing)
14. [Integration Specifications](#14-integration-specifications)
15. [Corrigibility Gap Closure — Path to 100%](#15-corrigibility-gap-closure--path-to-100)
16. [Product Boundary Remediation — Project vs Tool Separation](#16-product-boundary-remediation--project-vs-tool-separation)

---

## 1. Three-Page Architecture

### Aaron's Finalization

Context DNA IDE moves from a single DockView shell to three parent pages, each with a distinct purpose:

| Page | Purpose | Primary UX |
|------|---------|------------|
| **Dashboard** | Measurement & control cockpit | Cards, charts, gauges — read-heavy |
| **Workspace** | DockView IDE (Explorer/Editor/Diff) | Panels, tabs, drag-drop — write-heavy |
| **Live** | Extensible panel host for extensions | Pluggable panels — extend-heavy |

### Routing Plan

```
app/
  page.tsx              → redirect to /dashboard (default landing)
  dashboard/
    page.tsx            → <DashboardPage />
    layout.tsx          → sidebar nav (Dashboard sub-pages)
  workspace/
    page.tsx            → <DockviewShell /> (current IDE)
    layout.tsx          → minimal chrome (maximize editor space)
  live/
    page.tsx            → <LivePage /> (panel host)
    layout.tsx          → panel-grid layout
```

### Navigation

- **Top-level nav**: Three buttons — Dashboard | Workspace | Live
- **Persistent across pages**: Activity Bar (left edge), Status Bar (bottom)
- **Keyboard shortcuts**: Cmd+1 (Dashboard), Cmd+2 (Workspace), Cmd+3 (Live)

### Files to Modify

| File | Change |
|------|--------|
| `app/page.tsx` | Redirect to `/dashboard` |
| `app/dashboard/page.tsx` | NEW — DashboardPage component |
| `app/workspace/page.tsx` | NEW — Move current DockviewShell here |
| `app/live/page.tsx` | NEW — LivePage panel host |
| `components/ide/dockview-shell.tsx` | Keep as-is, mounted under `/workspace` |
| `components/ide/activity-bar.tsx` | Add page-level navigation (D/W/L) |

---

## 2. Dashboard Page — Measurement Cockpit

### Aaron's Finalization

Dashboard is the **control cockpit** — measurement instruments for everything Context DNA manages.

### 2.1 LLM Benchmark Dashboard

**Purpose**: Objective proof of local LLM performance with copy-to-clipboard Markdown.

#### Metrics

| Metric | Definition | How Measured |
|--------|-----------|--------------|
| **TTFT** | Time to first token (ms) | `Date.now()` at request → first SSE chunk |
| **tok/s** | Tokens per second (throughput) | Total tokens / (last_token_time - first_token_time) |
| **p50** | Median latency | Sorted latency array[n/2] |
| **p95** | 95th percentile latency | Sorted latency array[n*0.95] |
| **Total time** | End-to-end request duration | Request start → final token |
| **Model RAM** | Memory consumed by model | vllm-mlx RSS via `ps aux` |
| **GPU util** | GPU/ANE utilization % | `sudo powermetrics --samplers gpu` (macOS) |

#### Standard Benchmark Suites

| Suite | Prompts | Purpose |
|-------|---------|---------|
| **Quick Health** | 3 prompts (hello, code, reasoning) | 30-second sanity check |
| **Coding Focus** | 10 prompts (Python, TypeScript, debug, refactor) | Developer use case |
| **Reasoning** | 5 prompts (chain-of-thought, planning, analysis) | Thinking quality |
| **Context Window** | 3 prompts (4K, 8K, 16K tokens) | Long-context handling |
| **Custom** | User-defined | User's real workload |

#### UI Components

```
┌─────────────────────────────────────────────┐
│ LLM Benchmark                    [Run ▶]    │
├─────────────────────────────────────────────┤
│ Model: Qwen3-14B-4bit  RAM: 8.3GB  Status: │
│                                             │
│ TTFT    tok/s    p50     p95    Total       │
│ 142ms   38.2    26ms    89ms   4.2s        │
│                                             │
│ ████████████████████░░░░ 78% complete       │
│                                             │
│ [Copy Markdown 📋] [Export JSON] [History]  │
└─────────────────────────────────────────────┘
```

#### Copy-to-Clipboard Markdown Format

```markdown
## LLM Benchmark — Qwen3-14B-4bit (M3 Max 36GB)
Date: 2026-02-12 | Suite: Coding Focus | Prompts: 10

| Metric | Value |
|--------|-------|
| TTFT | 142ms |
| tok/s | 38.2 |
| p50 | 26ms |
| p95 | 89ms |
| Total | 4.2s |
| Model RAM | 8.3GB |

Generated by Context DNA v0.1
```

#### Community Leaderboard (Future)

- Users submit benchmark results (anonymous or named)
- Leaderboard ranks by hardware + model + tok/s
- Shows "You are here" marker on community distribution

#### Backend

| Endpoint | Purpose |
|----------|---------|
| `POST /api/benchmark/run` | Start benchmark suite |
| `GET /api/benchmark/results` | Get latest results |
| `GET /api/benchmark/history` | Historical results for trend |
| `POST /api/benchmark/submit` | Submit to community leaderboard |

### 2.2 System Performance Monitoring

**Purpose**: 60-second snapshots of CPU, RAM, processes. Rogue/zombie detection every 5 minutes.

#### Metrics

| Metric | Source | Interval |
|--------|--------|----------|
| CPU % (per-core) | `os.cpus()` / `top -l 1` | 60s |
| RAM used/total | `os.totalmem()` / `process.memoryUsage()` | 60s |
| Swap usage | `sysctl vm.swapusage` (macOS) | 60s |
| Disk I/O | `iostat` | 60s |
| Process count | `ps aux \| wc -l` | 60s |
| Rogue processes | CPU > 80% for > 5min | 5min |
| Zombie processes | `ps aux \| grep Z` | 5min |
| Open FDs | `lsof -p <pid> \| wc -l` | 5min |

#### Rogue Process Detection

```python
# Every 5 minutes:
for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
    if proc.cpu_percent > 80 and proc.create_time < (now - 300):
        alert("Rogue process", proc)
    if proc.status == 'zombie':
        alert("Zombie process", proc)
```

#### UI: Sparkline Dashboard

```
┌──────────────────────────────────────┐
│ System Health          Last 60s      │
├──────────────────────────────────────┤
│ CPU  ▂▃▅▇▅▃▂▁▂▃  23%               │
│ RAM  ████████░░░  14.2/36 GB (39%)  │
│ Swap ░░░░░░░░░░░  0 MB              │
│ FDs  ████░░░░░░░  847/10240         │
│                                      │
│ ⚠ 1 rogue: node (pid 4521, 92% CPU) │
└──────────────────────────────────────┘
```

### 2.3 Context DNA Service Health

**Purpose**: At-a-glance health for all Context DNA services.

#### Services to Monitor

| Service | Port | Health Check |
|---------|------|-------------|
| agent_service | 8080 | `GET /health` |
| vllm-mlx | 5044 | `GET /health` |
| lite_scheduler | (process) | PID file + last job time |
| session_file_watcher | (process) | Redis heartbeat |
| Redis | 6379 | `PING` |
| PostgreSQL | 5432 | `SELECT 1` |
| Docker | (socket) | `docker ps` |

#### Evidence Pipeline Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Claims created | 14 | 100+ |
| Claims promoted to wisdom | 4 (29%) | 50%+ |
| SOP outcome links | 2 | 50+ |
| Quarantine items | 4 | <10 |
| Active scheduler jobs | 36 | 36 |

### 2.4 Per-Panel Cost Metrics

**Purpose**: Track computational cost of each panel.

| Metric | Per Panel |
|--------|-----------|
| Render time | ms per paint cycle |
| API calls | requests/minute |
| Memory footprint | MB resident |
| LLM tokens consumed | tokens/interaction |
| Network bandwidth | KB/s |

### 2.5 Bottleneck Detection

**Purpose**: Phase-based pipeline instrumentation with automatic classification.

#### Pipeline Phases

```
User Input → Webhook Gen → LLM Query → Response → UI Render
   t0           t1            t2          t3         t4
```

Each phase is timed with `performance.now()` or `time.monotonic()`.

#### Classification Rules

| Bottleneck Type | Signal |
|-----------------|--------|
| **GPU/ANE** | LLM phase > 5s, GPU util > 90% |
| **CPU** | Webhook gen > 2s, CPU > 80% |
| **Memory** | Swap > 0, RSS growing monotonically |
| **I/O** | SQLite WAL checkpoint > 1s, disk await > 50ms |
| **Network** | API timeout, Redis latency > 100ms |
| **Thermal** | `powermetrics --samplers thermal` shows throttling |

---

## 3. Workspace Page — DockView IDE

### Aaron's Finalization

Workspace IS the current DockView IDE — Explorer, Editor, Terminal, Diff panels.

### What Moves Here

Everything currently in `DockviewShell` moves to `/workspace`:
- File Explorer (left sidebar)
- Editor panels (center)
- Terminal (bottom)
- Diff viewer
- Search panel
- Git panel

### What Stays the Same

- DockView layout persistence (localStorage)
- Panel drag-and-drop
- Layout versioning (LAYOUT_VERSION)
- All 15+ lazy-loaded panels via `panel-loader.ts`

### Enhancement: Editor Panel Becomes Agent-Aware

See Section 5 below for the full agent delegation model.

---

## 4. Live Page — Extensible Panel Host

### Aaron's Finalization

Live page is the **extension playground** — any tool can become a panel via the Context DNA Panel Protocol.

### 4.1 Context DNA Panel Protocol v1

Every panel registers via a universal manifest:

```typescript
interface PanelManifest {
  id: string;                    // "copilot-chat", "github-actions"
  name: string;                  // "GitHub Copilot Chat"
  version: string;               // "1.0.0"
  transport: 'websocket' | 'http' | 'file' | 'iframe';
  endpoint?: string;             // "ws://localhost:8765/panel"
  capabilities: string[];        // ["chat", "code-actions", "diagnostics"]
  permissions: string[];         // ["read-files", "run-commands"]
  icon?: string;                 // SVG data URI or URL
  category: 'ai' | 'dev-tools' | 'monitoring' | 'custom';
}
```

### 4.2 Panel Transport Types

| Transport | Use Case | Example |
|-----------|----------|---------|
| **WebSocket** | Real-time bidirectional | Synaptic chat, live logs |
| **HTTP** | Request-response | REST API panels, benchmarks |
| **File** | File-based data exchange | Node-RED flows, config editors |
| **iframe** | Embedded web UIs | OpenHands, HuggingFace Spaces |

### 4.3 Existing Panels That Move to Live

| Panel | Transport | Source |
|-------|-----------|--------|
| Synaptic Chat | WebSocket | `synaptic-chat-view.tsx` |
| Claude Chat | HTTP (streaming) | `claude-chat-view.tsx` |
| OpenHands | iframe | `openhands-pane` in split-view |
| Docker Control | HTTP | `docker-panel.tsx` |
| Health Dashboard | HTTP | `health-panel.tsx` |
| Model Manager | HTTP | `models-panel.tsx` |
| Node-RED | iframe | `node-red-panel.tsx` (new) |
| HuggingFace Spaces | iframe | `huggingface-panel.tsx` (new) |

### 4.4 Dynamic Panel Registration

```typescript
// Live page discovers panels at startup
const panels = await fetch('/api/panels/registry').then(r => r.json());
// Each panel renders based on its transport type
function renderPanel(manifest: PanelManifest) {
  switch (manifest.transport) {
    case 'websocket': return <WebSocketPanel {...manifest} />;
    case 'http':      return <HttpPanel {...manifest} />;
    case 'iframe':    return <IframePanel src={manifest.endpoint} />;
    case 'file':      return <FilePanel {...manifest} />;
  }
}
```

---

## 5. Editor Panel — Agent Delegation Model

### Aaron's Finalization

The Editor Panel in Workspace page becomes agent-aware. One **foreground agent** handles direct conversation with Aaron, while a **background swarm** handles research, planning, testing, and file watching.

### 5.1 Agent Roles

| Role | Behavior | UX |
|------|----------|-----|
| **Foreground (Primary)** | Direct chat with Aaron, receives keyboard focus, streams responses | Visible in Editor's chat panel |
| **Background (Swarm)** | Research, plan execution, test running, file watching — silent | Status badges in Activity Bar |

### 5.2 Available Agents

| Agent | Type | Purpose | Integration |
|-------|------|---------|-------------|
| **Claude Code** | Cloud AI | Complex reasoning, code generation, multi-file edits | Anthropic API (subscription or API key) |
| **Synaptic (Qwen3)** | Local LLM | Fast queries, voice, routine tasks, reviews | vllm-mlx on port 5044 |
| **OpenHands** | Autonomous | Multi-step coding tasks, autonomous execution | OpenHands API |
| **DeepSeek** | Cloud AI | Alternative reasoning, cost-effective | DeepSeek API |

### 5.3 Agent Switching Protocol

```
┌─────────────────────────────────────────────────┐
│ Editor Chat Panel                               │
│                                                 │
│ [Claude ▼] [Synaptic] [OpenHands] [DeepSeek]   │
│  ↑ active   background  background  background  │
│                                                 │
│ User clicks [Synaptic] →                        │
│   1. Claude moves to background (keeps context) │
│   2. Synaptic moves to foreground               │
│   3. Synaptic receives ProjectDialogue stream   │
│   4. UI shows Synaptic's chat history           │
│                                                 │
│ Background agents continue their tasks silently │
└─────────────────────────────────────────────────┘
```

#### Switching Rules

1. **One foreground at a time** — only one agent chats with Aaron
2. **Background agents keep running** — switching doesn't kill tasks
3. **Shared ProjectDialogue** — all agents read from same event stream
4. **Context handoff** — when switching, foreground agent's recent context is summarized and passed to new foreground
5. **Visual indicators** — background agents show status badges (idle, working, error)

### 5.4 ProjectDialogue Event Stream

All agents share a single event stream for coordination:

```typescript
interface ProjectDialogueEvent {
  type: 'user_message' | 'agent_response' | 'file_change' | 'test_result' | 'plan_update';
  agent_id: string;
  timestamp: number;
  payload: unknown;
}

// EventStore interface (same for Lite and Heavy modes)
interface EventStore {
  emit(event: ProjectDialogueEvent): void;
  subscribe(filter: EventFilter, callback: (event) => void): Unsubscribe;
  getHistory(since: number): ProjectDialogueEvent[];
}
```

#### Lite vs Heavy Mode

| Feature | Lite (default) | Heavy (scaling) |
|---------|---------------|-----------------|
| Transport | In-process pub/sub | Redis Streams |
| Workers | Single process | Multi-process |
| Persistence | SQLite WAL | PostgreSQL |
| Interface | Same EventStore | Same EventStore |

### 5.5 Background Agent Delegation

When the foreground agent (e.g., Claude) needs to delegate:

```
Claude (foreground): "I'll research the codebase for this pattern"
  → Spawns background task to Synaptic or OpenHands
  → Background agent works silently
  → Results appear in ProjectDialogue stream
  → Claude synthesizes results in foreground chat

Aaron: "Let me talk to Synaptic directly"
  → Claude moves to background
  → Synaptic becomes foreground
  → Synaptic has full ProjectDialogue context
```

### 5.6 Agent Review Loop (Already Implemented)

Background agents are reviewed by Synaptic via the review bridge:

```
PostToolUse hook → agent_review_bridge.py → synaptic_reviewer.py
  → Qwen3-14B review → Redis cache → Section 6 injection
  → Reviews visible in Reviews tab (synaptic-split-view.tsx)
```

### 5.7 Implementation Files

| File | Action | Change |
|------|--------|--------|
| `components/ide/editor-panel.tsx` | MODIFY | Add agent switcher tabs |
| `lib/agents/agent-manager.ts` | NEW | Agent lifecycle management |
| `lib/agents/project-dialogue.ts` | NEW | EventStore implementation |
| `lib/agents/agent-switcher.ts` | NEW | Foreground/background switching |
| `components/ide/activity-bar.tsx` | MODIFY | Background agent status badges |

---

## 6. VS Code Extension Integration

### Aaron's Finalization

**Strategy: "Integrate with VS Code, don't re-host VS Code."**

Context DNA does NOT recreate extensions. Instead:
1. User downloads VS Code + desired extension
2. Extension runs in VS Code natively
3. Extension emits data feed (WS/HTTP/file)
4. Context DNA consumes the feed as a Live page panel

### 6.1 Extension Bridge Architecture

```
┌────────────────────┐     ┌─────────────────────────┐
│  VS Code           │     │  Context DNA IDE         │
│                    │     │                           │
│  Extension A ──────┼──WS─┼─→ Live Panel A           │
│  Extension B ──────┼─HTTP┼─→ Live Panel B           │
│  Extension C ──────┼─File┼─→ Live Panel C           │
│                    │     │                           │
│  [VS Code Bridge   │     │  [Panel Protocol v1      │
│   Extension]       │     │   consumer]              │
└────────────────────┘     └─────────────────────────┘
```

### 6.2 VS Code Bridge Extension

A lightweight VS Code extension that:
1. Discovers installed extensions and their capabilities
2. Provides a WebSocket server for Context DNA to connect
3. Proxies extension API calls (diagnostics, code actions, completions)
4. Emits file change events, test results, git status

```typescript
// VS Code Bridge Extension (runs in VS Code)
const server = new WebSocketServer({ port: 8765 });

server.on('connection', (ws) => {
  // Forward diagnostics
  vscode.languages.onDidChangeDiagnostics((e) => {
    ws.send(JSON.stringify({
      type: 'diagnostics',
      uri: e.uris[0].toString(),
      diagnostics: vscode.languages.getDiagnostics(e.uris[0]),
    }));
  });

  // Forward code actions
  ws.on('message', async (msg) => {
    const req = JSON.parse(msg);
    if (req.type === 'getCodeActions') {
      const actions = await vscode.commands.executeCommand(
        'vscode.executeCodeActionProvider',
        vscode.Uri.parse(req.uri),
        new vscode.Range(req.range.start, req.range.end)
      );
      ws.send(JSON.stringify({ type: 'codeActions', actions }));
    }
  });
});
```

### 6.3 Extension Categories & Integration Patterns

| Category | Examples | Bridge Pattern |
|----------|----------|---------------|
| **Language Servers** | Pylance, rust-analyzer | LSP proxy → diagnostics panel |
| **Linters/Formatters** | ESLint, Prettier | Diagnostics feed → issues panel |
| **Git** | GitLens, Git Graph | Git data → timeline panel |
| **Testing** | Jest Runner, pytest | Test results → test panel |
| **AI Assistants** | Copilot, Cody | Chat proxy → Live panel |
| **Containers** | Docker, Dev Containers | Container status → Docker panel |
| **Debugging** | Debugger for Chrome | Debug events → debug panel |

### 6.4 What Context DNA Provides That VS Code Doesn't

| Feature | VS Code | Context DNA |
|---------|---------|-------------|
| Memory across sessions | None | Full (learnings, SOPs, outcomes) |
| Multi-agent orchestration | Single Copilot | Claude + Synaptic + OpenHands + DeepSeek |
| Evidence-based learning | None | Pipeline (quarantine → wisdom) |
| Voice control | None | Synaptic voice + permission assistant |
| Local LLM | None (cloud only) | vllm-mlx Qwen3-14B |
| Dashboard/metrics | None | Full measurement cockpit |
| Config packs | Settings sync | Signed, versioned, shareable |

### 6.5 Implementation Plan

| Phase | Deliverable | Effort |
|-------|------------|--------|
| **Phase 1** | VS Code Bridge extension (WebSocket server) | 2 days |
| **Phase 2** | Panel Protocol v1 consumer in Live page | 1 day |
| **Phase 3** | Diagnostics panel (first integration) | 1 day |
| **Phase 4** | Git data panel (GitLens bridge) | 1 day |
| **Phase 5** | Testing panel (test results bridge) | 1 day |
| **Phase 6** | Extension discovery & auto-registration | 2 days |

---

## 7. Electron Packaging — Product Isolation

### Aaron's Finalization

Context DNA is packaged as an Electron app so users don't mix Context DNA data with their project data.

### 7.1 Directory Structure

```
Context DNA.app/                    (macOS .app bundle)
├── Contents/
│   ├── Resources/
│   │   └── app.asar              ← App code (read-only, signed)
│   │       ├── dist-electron/     (main process)
│   │       ├── out/               (renderer, Next.js export)
│   │       └── node_modules/      (production deps)
│   └── MacOS/
│       └── Context DNA            (binary entry point)
│
~/Library/Application Support/Context DNA/    (userData)
├── databases/                    ← SQLite DBs (learnings, observability, etc.)
├── config/                       ← User settings, hierarchy profiles
├── logs/                         ← Application logs
├── models/                       ← Downloaded LLM models (optional)
├── sessions/                     ← Session archives
└── cache/                        ← Redis dump, temp files
```

### 7.2 Key Principles

| Principle | Implementation |
|-----------|---------------|
| **App code is read-only** | ASAR archive, code-signed, no user writes |
| **User data in userData** | `app.getPath('userData')` for all mutable data |
| **Project data stays in project** | `.context-dna/` folder per project (settings only) |
| **No mixing** | Context DNA never writes to user's project root |
| **Portable** | Delete userData → clean slate; backup userData → full restore |

### 7.3 ASAR Packaging

```json
// electron-builder.json (existing, enhanced)
{
  "appId": "io.contextdna.ide",
  "productName": "Context DNA",
  "asar": true,
  "asarUnpack": [
    "node_modules/better-sqlite3/**/*",
    "node_modules/sharp/**/*"
  ],
  "files": [
    "dist-electron/**/*",
    "out/**/*",
    "!node_modules/.cache",
    "!**/*.map"
  ],
  "extraResources": [
    {
      "from": "resources/",
      "to": "resources/",
      "filter": ["**/*"]
    }
  ],
  "mac": {
    "category": "public.app-category.developer-tools",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.inherit.plist",
    "target": ["dmg", "zip"],
    "icon": "build/icon.icns"
  },
  "win": {
    "target": ["nsis", "portable"],
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Development"
  }
}
```

### 7.4 ASAR Invariance Contract (READ THIS FIRST)

> **Invariance**: Any AI, developer, or build system touching ASAR packaging MUST follow these rules.
> Violating these causes silent data loss, broken updates, or app crashes.

#### Rule 1: App Code is IMMUTABLE
```
app.asar is READ-ONLY after build.
  ├── ❌ NEVER write to app.asar paths at runtime
  ├── ❌ NEVER modify files inside Resources/app.asar
  ├── ❌ NEVER use __dirname for user data (points into ASAR)
  └── ✅ ALL mutable data goes to app.getPath('userData')
```

#### Rule 2: Path Resolution Priority
```typescript
// CORRECT — userData for all mutable state
const DB_PATH = path.join(app.getPath('userData'), 'databases', 'learnings.db');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config', 'settings.json');
const LOG_PATH = path.join(app.getPath('userData'), 'logs', 'app.log');

// WRONG — these resolve inside ASAR (read-only, crashes on write)
const DB_PATH = path.join(__dirname, 'databases', 'learnings.db');  // ❌ CRASH
const CONFIG_PATH = './config/settings.json';                        // ❌ CRASH
```

#### Rule 3: asarUnpack for Native Modules
Native .node bindings CANNOT run from inside ASAR. They MUST be unpacked:

| Module | Why Unpack | Size Impact |
|--------|-----------|-------------|
| `better-sqlite3` | Native SQLite C bindings | +3MB |
| `sharp` | libvips image processing | +25MB |
| `node-pty` | PTY fork (terminal emulation) | +1MB |
| `fsevents` | macOS kernel file watching | +0.5MB |

```json
"asarUnpack": [
  "node_modules/better-sqlite3/**/*",
  "node_modules/sharp/**/*",
  "node_modules/node-pty/**/*",
  "node_modules/fsevents/**/*"
]
```

#### Rule 4: Auto-Update Safety
```
Update flow: download → verify signature → FREEZE writes → replace ASAR → restart
  ├── User data (userData/) is NEVER touched by updates
  ├── Databases persist across ALL updates (they're in userData/)
  ├── Config survives updates (it's in userData/)
  └── Only app.asar changes (the read-only code bundle)
```

#### Rule 5: Development → Production Migration
```
Dev mode:  ~/.context-dna/         → SQLite DBs, config, sessions
Prod mode: ~/Library/Application Support/Context DNA/  → same structure

One-time migration copies dev data to prod on first launch.
After migration, dev path is READ-ONLY (prevents drift).
```

### 7.5 Auto-Update

```typescript
// electron/main.ts — add auto-updater
import { autoUpdater } from 'electron-updater';

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'contextdna',
  repo: 'context-dna-releases',
});

autoUpdater.checkForUpdatesAndNotify();
```

### 7.6 userData Migration

When upgrading from development (raw files) to production (Electron app):

```typescript
// electron/migrate-user-data.ts
import { app } from 'electron';
import path from 'path';

const userData = app.getPath('userData');
const devPath = path.join(process.env.HOME!, '.context-dna');

// If dev databases exist and userData is empty, copy them
if (fs.existsSync(devPath) && !fs.existsSync(path.join(userData, 'databases'))) {
  fs.cpSync(devPath, path.join(userData, 'databases'), { recursive: true });
}
```

### 7.7 Existing Infrastructure

Already in place (from codebase exploration):
- `electron/main.ts` — Main process with IPC handlers (window, file-system, docker, shell)
- `electron-builder.json` — Build config for mac/win/linux
- `lib/platform/env-detect.ts` — Runtime detection (electron/web/tauri)
- Custom titlebar with macOS traffic lights

### 7.8 What Needs Adding

| Task | File | Description |
|------|------|-------------|
| userData path resolution | `electron/paths.ts` | NEW — resolve all paths to userData |
| Database relocation | `electron/main.ts` | Modify — DBs open from userData |
| ASAR config | `electron-builder.json` | Modify — enable ASAR + unpack natives |
| Code signing | `build/entitlements.mac.plist` | NEW — macOS entitlements |
| Auto-updater | `electron/main.ts` | Modify — add electron-updater |
| Dev→Prod migration | `electron/migrate-user-data.ts` | NEW — one-time data migration |

---

## 8. Config Packs & Secret Protection

### Aaron's Finalization

Config packs are versioned bundles that can be shared. Secrets never leave the machine.

### 8.1 Config Pack Structure

```
config-pack-v1.0.0/
├── manifest.json           ← Pack metadata + version + signature
├── agents/                 ← Agent configurations
│   ├── claude.json
│   ├── synaptic.json
│   └── openhands.json
├── rules/                  ← Injection rules
│   ├── section-0-safety.json
│   └── section-weights.json
├── prompts/                ← System prompts
│   └── professor-template.md
├── panel-manifests/        ← Live page panel configs
│   └── registered-panels.json
├── injection-templates/    ← Webhook templates
│   └── 9-section-template.json
└── hierarchy-profile.json  ← Knowledge hierarchy
```

### 8.2 Secret Protection

| Layer | Mechanism |
|-------|-----------|
| **Storage** | OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service) |
| **References** | Config packs use `SecretRef("api-key-anthropic")` — never raw values |
| **Sanitizer** | Pipeline strips any value matching secret patterns before export |
| **Publish flow** | Explicit `Export Pack` action → sanitizer → review → sign → share |

### 8.3 Config Pack Invariance Contract (ANY AI MUST FOLLOW)

> **Critical**: Config packs are the #1 vector for accidental secret leakage.
> These rules are absolute. No exceptions for "just testing" or "local only".

#### Invariant 1: SecretRef Pattern
```json
// CORRECT — SecretRef is a pointer, never a value
{
  "anthropic_api_key": { "$secretRef": "api-key-anthropic" },
  "openai_api_key": { "$secretRef": "api-key-openai" },
  "redis_password": { "$secretRef": "redis-auth" }
}

// WRONG — raw secrets in config (NEVER DO THIS)
{
  "anthropic_api_key": "sk-ant-api03-...",    // ❌ LEAKED
  "openai_api_key": "sk-proj-...",            // ❌ LEAKED
  "redis_password": "1c5b2e35b43e91f90da8a23" // ❌ LEAKED
}
```

At runtime, `resolveSecretRef(ref)` queries the OS keychain:
```typescript
function resolveSecretRef(ref: string): string {
  if (process.platform === 'darwin') return keytar.getPassword('contextdna', ref);
  if (process.platform === 'win32') return keytar.getPassword('contextdna', ref);
  return keytar.getPassword('contextdna', ref); // Linux Secret Service
}
```

#### Invariant 2: Export Pipeline (3-Stage Gate)
```
Stage 1: SANITIZE — regex scan for sk-*, api_key, password, token patterns
Stage 2: REVIEW   — human sees diff of what will be exported (mandatory)
Stage 3: SIGN     — SHA-256 integrity hash per file, bundle hash in manifest
```
**All three stages MUST pass.** If sanitizer finds a raw secret → ABORT export entirely.

#### Invariant 3: Version Compatibility
```
Config pack v1.0.0 runs on Context DNA v0.1+
Config pack v2.0.0 runs on Context DNA v0.5+ (breaks v0.1-v0.4)

manifest.json.minVersion = "0.1.0"  → Minimum Context DNA version
manifest.json.maxVersion = null      → No upper bound (forward-compatible)
```
Loader MUST check `minVersion` before applying. Incompatible packs show warning, don't crash.

#### Invariant 4: Idempotent Application
```
Applying the same config pack twice = identical state to applying once.
  ├── JSON merge (not replace) for settings
  ├── Panel manifests: upsert by ID
  ├── Agent configs: upsert by agent name
  └── Rules: full replace (rules are atomic)
```

### 8.4 Signing for Premium Content

```json
// manifest.json
{
  "name": "Context DNA Pro Pack",
  "version": "1.0.0",
  "author": "contextdna",
  "license": "premium",
  "signature": "sha256:abc123...",
  "integrity": {
    "agents/claude.json": "sha256:def456...",
    "rules/section-0-safety.json": "sha256:ghi789..."
  }
}
```

---

## 9. Database Sync Protection

### Aaron's Finalization

When switching between Lite (SQLite) and Heavy (PostgreSQL) modes, data must not be lost.

### 9.1 SyncManager State Machine

```
        RUNNING (normal operation)
            │
     [mode switch requested]
            │
            ▼
        FREEZE (stop all writes)
            │
     [copy data: SQLite → PG or PG → SQLite]
            │
            ▼
        VERIFY (checksums match)
            │
     [checksums OK?]
            │
     YES ──▼── NO → ROLLBACK → RUNNING (original mode)
            │
            ▼
        CUTOVER (switch authority)
            │
            ▼
        RESUME (normal operation, new mode)
```

### 9.2 Single Authority Rule

| Mode | Write Authority | Read Fallback |
|------|----------------|---------------|
| **Lite** | SQLite (WAL mode) | None needed |
| **Heavy** | PostgreSQL | SQLite (read-only cache) |

**Rule**: Only ONE database accepts writes at any time. The other is read-only or offline.

### 9.3 Database Corruption Mitigation (Lessons from Production)

> **Context**: Sessions 6-11 encountered 3 separate SQLite corruption events.
> Root causes: concurrent access without WAL, ungraceful shutdown, FD exhaustion.

#### WAL Mode (MANDATORY for all SQLite DBs)

```sql
-- EVERY new SQLite connection MUST set these pragmas:
PRAGMA journal_mode=WAL;       -- Write-Ahead Logging (concurrent readers + 1 writer)
PRAGMA wal_autocheckpoint=100; -- Checkpoint every 100 pages
PRAGMA busy_timeout=5000;      -- Wait 5s instead of immediate SQLITE_BUSY
PRAGMA synchronous=NORMAL;     -- Safe with WAL (FULL is overkill)
```

**Already WAL-enabled** (verified in observability_store.py):
- `.observability.db` — claims, outcomes, quarantine, injection_events
- `.context_ab_tracking.db` — boundary_injections, variant_outcomes
- `learnings.db` — all learnings (270+ rows)
- `repair_sops.db` — butler repair mining
- `.dialogue_mirror.db` — session dialogue cache
- `.meta_analysis.db` — cross-session analysis
- `.webhook_notification_prefs.db` — notification settings

#### Connection Singleton Pattern (MANDATORY)

```python
# CORRECT — singleton prevents FD exhaustion
storage = get_sqlite_storage()  # Returns cached instance
storage.conn.execute("SELECT ...")

# WRONG — creates new connection each call → FD leak
conn = sqlite3.connect("learnings.db")  # ❌ FD LEAK
with sqlite3.connect("learnings.db") as conn:  # ❌ Does NOT close!
```

**Key insight**: Python `with sqlite3.connect() as conn:` does NOT close the connection.
It only commits/rollbacks. You MUST use try/finally/conn.close() or the singleton.

#### Corruption Recovery Chain

```
Level 1: WAL checkpoint → PRAGMA wal_checkpoint(RESTART)
Level 2: sqlite3 .recover → Rebuilt DB from WAL + main
Level 3: PG restore → Rebuild from PostgreSQL backup (if available)
Level 4: Empty recreate → Schema-only (last resort, data lost)
```

The `butler_db_repair.py` implements this chain automatically for all 11 SQLite DBs.

#### Graceful Shutdown Protocol

```
SIGTERM received →
  1. Stop accepting new writes
  2. Flush WAL: PRAGMA wal_checkpoint(TRUNCATE)
  3. Close all connections (conn.close(), not just conn.commit())
  4. Exit
```

### 9.4 Append-Only Event Spine

All state changes are recorded as immutable events:

```sql
CREATE TABLE event_spine (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This enables:
- Full audit trail
- Replay for recovery
- Conflict resolution during sync

---

## 10. Learnings Autonomy & Evidence Pipeline

### Research Findings (from git history analysis)

### 10.1 Peak Autonomy Period

**Feb 6-7, 2026** was the peak period for autonomous learning:
- Evidence pipeline fully wired (E2E verified, 11/11 tests passed)
- Butler ecosystem created (repair mining + meta-analysis)
- SOP outcome tables implemented
- Negative signals integrated
- 33 claims promoted in test suite

### 10.2 Current Evidence Pipeline Status

| Metric | Current | Target |
|--------|---------|--------|
| Total claims | 14 | 100+ |
| Promoted to wisdom | 4 (29%) | 50%+ |
| SOP outcome links | 2 | 50+ |
| Quarantine items | 4 | <10 |
| Promotion threshold | n>=30 | n>=5 (bootstrap) |

### 10.3 SOP Pipeline Health

**Working**:
- capture_success() with TYPE-FIRST classification
- SOP Title Router (bug-fix vs process formatting)
- Evidence grading (5 levels: cohort → anecdotal)
- SOPDeduplicator (fuzzy match on title+content)
- Outcome recording (3 paths verified)
- Negative signals via capture_failure()

**Broken/Incomplete**:
- SOP outcome aggregation (tables exist, data sparse — 2 rows)
- Multi-route accumulation (designed, not wired)
- LLM-first SOP enhancement (available, not default)
- Pattern auto-promotion (learned patterns don't feed back to detector)

### 10.4 Objective Success — Coverage Gap

**Current coverage**: ~60-70% of actual successes detected

| Source | Coverage |
|--------|----------|
| User confirmation | 95% |
| Git commits (fix/feat/perf) | 85% |
| System signals (exit 0, 200 OK) | 70% |
| Tool-based work (Edit/Write/Task) | **5%** |

**Largest blind spot**: Edit/Write/Task tools represent 40-50% of Claude's output but are invisible to the success detector.

### 10.5 Recommendations

1. **Hook tool outcomes** — PostToolUse hook records Edit/Write/Task success
2. **Lower bootstrap threshold** — n>=5 (from n>=30) during seeding phase
3. **Wire SOP outcome aggregation** — Assign sop_id on capture, link to outcomes
4. **Activate multi-route accumulation** — Process SOPs grow with new successful routes
5. **Make LLM success analysis default** — Not optional fallback
6. **Session-scoped success aggregation** — End-of-session productivity rollup

---

## 11. Implementation Roadmap

> Updated with gap analysis findings (Section 13). Items marked with ✅ are DONE.

### Phase 1: Three-Page Routing (P0 — Foundation)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Rename `ParentPage` type: `'synaptic'` → `'workspace'` | `layout-manager.ts`, `panel-context.tsx`, `event-bus.ts` | 🔄 |
| 2 | Create `/dashboard` route | `app/dashboard/page.tsx` | TODO |
| 3 | Move DockView to `/workspace` | `app/workspace/page.tsx` | TODO |
| 4 | Create `/live` route | `app/live/page.tsx` | TODO |
| 5 | Redirect root to `/workspace` (default) | `app/page.tsx` | TODO |
| 6 | Shared page layout (nav + Activity Bar) | `app/(pages)/layout.tsx` | TODO |
| 7 | Update DashboardShell nav buttons for routes | `DashboardShell.tsx` | TODO |

**Blocking**: Everything else depends on routing working.

### Phase 2: Workspace — Agent-Aware Editor (P1)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Explorer panel with `react-complex-tree` | `components/workspace/explorer-panel.tsx` | TODO |
| 2 | Agent Manager singleton | `lib/agents/agent-manager.ts` | TODO |
| 3 | Agent Switcher UI (extend keep-alive pattern) | `components/workspace/agent-switcher.tsx` | TODO |
| 4 | ProjectDialogue EventStore | `lib/agents/project-dialogue.ts` | TODO |
| 5 | Background agent status badges | `components/ide/activity-bar.tsx` | TODO |
| 6 | Context handoff on switch | `lib/agents/context-handoff.ts` | TODO |

**Key insight**: SynapticSplitView's keep-alive pattern (CSS visibility toggle) is the correct foundation. Agent Switcher extends it to all 4 agents.

### Phase 3: Dashboard — Measurement Cockpit (P1)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | LLM Benchmark runner | `lib/benchmark/runner.ts` | TODO |
| 2 | Benchmark UI cards (TTFT, tok/s, p50/p95) | `components/dashboard/benchmark-card.tsx` | TODO |
| 3 | Copy-to-clipboard Markdown | Benchmark card | TODO |
| 4 | System performance monitoring | `components/dashboard/system-health.tsx` | TODO |
| 5 | Service health grid | `components/dashboard/service-grid.tsx` | TODO |
| 6 | Evidence pipeline metrics | `components/dashboard/evidence-metrics.tsx` | TODO |

### Phase 4: Live Page — Panel Protocol (P1)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Panel Protocol v1 types | `lib/panels/protocol.ts` | TODO |
| 2 | Panel registry API | `app/api/panels/registry/route.ts` | TODO |
| 3 | Dynamic panel renderer (4 transports) | `components/live/panel-renderer.tsx` | TODO |
| 4 | Migrate existing panels to protocol | Various | TODO |
| 5 | CapabilityBus (cross-panel events) | `lib/ide/capability-bus.ts` | TODO |

### Phase 5: VS Code Bridge + Extensions (P2)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | Bridge extension scaffold | `vscode-extension/` (new repo) | TODO |
| 2 | WebSocket server in extension | `vscode-extension/src/server.ts` | TODO |
| 3 | LSP proxy via `monaco-languageclient` | Workspace Editor integration | TODO |
| 4 | Diagnostics panel consumer | `components/live/diagnostics-panel.tsx` | TODO |
| 5 | Extension auto-discovery | `vscode-extension/src/discovery.ts` | TODO |

### Phase 6: Electron Packaging (P2)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | userData path resolution | `electron/paths.ts` (NEW) | TODO |
| 2 | ASAR config + native unpack | `electron-builder.json` | TODO |
| 3 | Database relocation to userData | `electron/main.ts` | TODO |
| 4 | Secret resolver (keytar) | `lib/config/secret-resolver.ts` | TODO |
| 5 | Config pack loader | `lib/config/pack-loader.ts` | TODO |
| 6 | Code signing entitlements | `build/entitlements.mac.plist` (NEW) | TODO |
| 7 | Auto-updater | `electron/main.ts` (modify) | TODO |
| 8 | Dev→Prod migration | `electron/migrate-user-data.ts` (NEW) | TODO |
| 9 | Remove `@vercel/analytics` from Electron build | `app/layout.tsx` (conditional) | TODO |

### Phase 7: Evidence Pipeline Hardening (P1)

| # | Task | Files | Status |
|---|------|-------|--------|
| 1 | PostToolUse success capture | `memory/auto_capture.py` | TODO |
| 2 | Lower bootstrap threshold (n>=5) | `memory/observability_store.py` | TODO |
| 3 | SOP outcome wiring | `memory/auto_capture.py` | TODO |
| 4 | Pattern auto-promotion | `memory/pattern_registry.py` | TODO |

---

## UNRESOLVED

1. **Community leaderboard hosting** — Where does the benchmark leaderboard live? (Vercel? Self-hosted?)
2. **VS Code Bridge extension distribution** — VS Code Marketplace or sideload?
3. **Config pack marketplace** — How are premium packs distributed and licensed?
4. **Heavy mode trigger** — When does the system automatically suggest switching from Lite to Heavy?
5. **Agent cost tracking** — How do we track API costs per agent per session?
6. **Electron app signing** — Apple Developer Program enrollment needed for notarization
7. **Multi-machine sync** — How do learnings sync across Aaron's devices?

---

## 12. License Audit

> Audit date: 2026-02-12. Covers all dependencies in `admin.contextdna.io/package.json` + recommended new packages.

### 12.1 Current Dependencies — All GREEN

| Package | License | Risk | Notes |
|---------|---------|------|-------|
| `next` 15.2.1 | MIT | GREEN | Framework |
| `react` / `react-dom` 19 | MIT | GREEN | UI library |
| `dockview-react` 4.13.1 | MIT | GREEN | Panel layout engine |
| `@monaco-editor/react` 4.7.0 | MIT | GREEN | Code editor |
| `monaco-editor` 0.52.2 | MIT | GREEN | Editor core |
| `@xyflow/react` 12.4.4 | MIT | GREEN | Flow diagrams |
| `recharts` 2.15.1 | MIT | GREEN | Charts |
| `cmdk` 1.1.1 | MIT | GREEN | Command palette |
| `lucide-react` 0.474.0 | ISC | GREEN | Icons |
| `zustand` 5.0.3 | MIT | GREEN | State management |
| `@radix-ui/*` (10 pkgs) | MIT | GREEN | UI primitives |
| `tailwindcss` 3.4.17 | MIT | GREEN | CSS framework |
| `framer-motion` 12.4.2 | MIT | GREEN | Animations |
| `react-markdown` 9.0.3 | MIT | GREEN | Markdown renderer |
| `react-syntax-highlighter` 15.6.1 | MIT | GREEN | Code highlighting |
| `xterm` + `xterm-addon-fit` | MIT | GREEN | Terminal emulator |
| `socket.io-client` 4.8.1 | MIT | GREEN | WebSocket client |
| `uuid` 11.0.5 | MIT | GREEN | ID generation |
| `sonner` 1.7.4 | MIT | GREEN | Toast notifications |

### 12.2 YELLOW — Minor Obligations

| Package | License | Obligation | Action |
|---------|---------|-----------|--------|
| `class-variance-authority` 0.7.1 | Apache-2.0 | Must include NOTICE file if distributing | Include in Electron build's `LICENSES` folder |
| `@vercel/analytics` | MPL-2.0 | Modified files must stay MPL-2.0; requires Vercel hosting | **Remove from Electron build** (web-only, no-op in Electron) |

### 12.3 RED — None

No GPL, AGPL, or SSPL dependencies. All clear for commercial distribution.

### 12.4 Recommended New Packages

| Package | License | Purpose | Integration Point |
|---------|---------|---------|-------------------|
| `react-complex-tree` | MIT | Explorer panel file tree | Workspace → Explorer sidebar |
| `monaco-languageclient` | MIT | LSP protocol support for Editor | Workspace → Editor LSP bridge |
| `electron-updater` | MIT | Auto-update for Electron app | Electron main process |
| `keytar` | MIT | OS keychain for SecretRef | Config pack secret resolution |

### 12.5 Already Available (No Install Needed)

| Capability | Provided By | Notes |
|-----------|-------------|-------|
| Diff viewer | `monaco-editor` (built-in DiffEditor) | No separate diff library needed |
| Terminal | `xterm` + `xterm-addon-fit` | Already installed |
| Flow diagrams | `@xyflow/react` | Already installed, MIT |

### 12.6 Integration Providers — License Impact

All 12 planned integration providers use raw `fetch()` to external APIs.
**Zero additional license obligations** — providers are thin wrappers, not SDK embeddings.

| Provider | API Pattern | License Impact |
|----------|------------|----------------|
| HuggingFace | REST + iframe | None (public API) |
| GitHub | REST (gh CLI or octokit) | None |
| Vercel | REST | None |
| Node-RED | iframe (localhost) | Apache-2.0 (Node-RED itself, not our code) |
| LM Studio | REST (OpenAI-compatible) | None |
| Ollama | REST | None |
| OpenRouter | REST | None |
| Docker | REST (socket) | None |
| Homebrew | CLI subprocess | None |
| System Monitor | OS APIs | None |
| VS Code Bridge | WebSocket | None |
| LaunchAgent Manager | plist + launchctl | None |

---

## 13. Gap Analysis — DONE / PARTIAL / MISSING

> Based on comprehensive codebase audit of `admin.contextdna.io/`. Status as of 2026-02-12.

### 13.1 DONE (Already Built)

| Component | Location | Status |
|-----------|----------|--------|
| Three quick-nav buttons (D/S/L) | `DashboardShell.tsx:444-505` | ✅ Working |
| Activity Bar (VS Code-style) | `activity-bar.tsx` | ✅ 30+ icons |
| TypedEventBus | `event-bus.ts` (624 lines) | ✅ 30+ event types, middleware, replay |
| EditorStore (file tabs) | `editor-store.ts` (369 lines) | ✅ Open/close/dirty tracking |
| SynapticSplitView | `synaptic-split-view.tsx` | ✅ Keep-alive pattern (CSS visibility) |
| Custom Pages + Panel Wires | `custom-pages.ts` (210 lines) | ✅ CRUD + wire connections |
| Command Palette (cmdk) | Already integrated | ✅ Working |
| 50+ panel registry | `panel-factory.tsx` | ✅ Lazy-loaded |
| DockView layout persistence | `dockview-shell.tsx` | ✅ Versioned localStorage |
| Monaco Editor | `@monaco-editor/react` | ✅ Installed |
| Terminal (xterm) | `xterm` + `xterm-addon-fit` | ✅ Installed |
| Chat views (Synaptic + Claude) | `synaptic-chat-view.tsx`, `claude-chat-view.tsx` | ✅ Working |
| Agent Review Bridge | `agent_review_bridge.py` → `synaptic_reviewer.py` | ✅ Working |
| Permission Assistant | `permission_assistant.py` | ✅ Detection + LLM explain |
| Service Registry | `service-registry.ts` + `service_registry.py` | ✅ Anti-miswiring |

### 13.2 PARTIAL (Started, Needs Completion)

| Component | What Exists | What's Missing |
|-----------|-------------|----------------|
| **Three-page routing** | Buttons exist in DashboardShell | Actual Next.js routes (`/dashboard`, `/workspace`, `/live`) |
| **ParentPage type** | `'dashboard' \| 'synaptic' \| 'live'` | Needs rename: `'synaptic'` → `'workspace'` |
| **Agent Review in Workspace** | Review bridge works in hook pipeline | Needs lifting into Workspace UI (agent badges, review tab) |
| **Panel Protocol** | 12 providers designed in anti-miswiring doc | No runtime PanelManifest registration |
| **Electron paths** | `electron/main.ts` exists, `env-detect.ts` detects platform | `electron/paths.ts` missing (userData resolution) |
| **Layout Manager** | `layout-manager.ts` stores per-page layout | Only `dashboard`/`synaptic`/`live` — needs `workspace` key |

### 13.3 MISSING (Not Yet Built)

#### P0 — Routing Foundation

| Component | File to Create | Description |
|-----------|---------------|-------------|
| Dashboard route | `app/dashboard/page.tsx` | Dashboard measurement cockpit |
| Workspace route | `app/workspace/page.tsx` | DockView IDE (move from root) |
| Live route | `app/live/page.tsx` | Panel host for extensions |
| Root redirect | `app/page.tsx` | Redirect `/` → `/dashboard` |
| Shared layout | `app/(pages)/layout.tsx` | Top nav (D/W/L) + Activity Bar shell |

#### P1 — Core Value

| Component | File to Create | Description |
|-----------|---------------|-------------|
| LLM Benchmark runner | `lib/benchmark/runner.ts` | Standard prompt suites, timing, Markdown export |
| Benchmark UI | `components/dashboard/benchmark-card.tsx` | Cards with TTFT, tok/s, p50/p95 |
| Agent Manager singleton | `lib/agents/agent-manager.ts` | Agent lifecycle: register, switch, delegate |
| ProjectDialogue EventStore | `lib/agents/project-dialogue.ts` | Shared event stream (Lite: in-process, Heavy: Redis) |
| Agent Switcher UI | `components/workspace/agent-switcher.tsx` | Tab bar: [Claude] [Synaptic] [OpenHands] |
| Explorer panel (file tree) | `components/workspace/explorer-panel.tsx` | `react-complex-tree` integration |
| Panel Protocol types | `lib/panels/protocol.ts` | PanelManifest, transport types |
| Panel registry API | `app/api/panels/registry/route.ts` | Dynamic panel discovery |
| Panel renderer | `components/live/panel-renderer.tsx` | WebSocket/HTTP/iframe/file transport switch |

#### P2 — Extensions & Packaging

| Component | File to Create | Description |
|-----------|---------------|-------------|
| VS Code Bridge extension | `vscode-extension/` (new repo) | WebSocket server, diagnostics proxy |
| CapabilityBus | `lib/ide/capability-bus.ts` | Cross-panel typed event system |
| Context handoff | `lib/agents/context-handoff.ts` | Summarize + transfer on agent switch |
| Electron paths | `electron/paths.ts` | userData resolution for all DBs |
| Code signing entitlements | `build/entitlements.mac.plist` | macOS hardened runtime |
| Dev→Prod migration | `electron/migrate-user-data.ts` | One-time data copy |
| Config pack loader | `lib/config/pack-loader.ts` | Load, validate, apply config packs |
| Secret resolver | `lib/config/secret-resolver.ts` | OS keychain via keytar |

#### P3 — Polish

| Component | File to Create | Description |
|-----------|---------------|-------------|
| Extension discovery | `vscode-extension/src/discovery.ts` | Auto-detect installed VS Code extensions |
| Community leaderboard | `app/api/benchmark/submit/route.ts` | Anonymous benchmark sharing |
| Bottleneck detector | `lib/monitoring/bottleneck-detector.ts` | Phase timing + classification |
| Auto-updater | Modify `electron/main.ts` | `electron-updater` integration |

### 13.4 Keep-Alive Pattern (Foundation for Agent Dance)

The `SynapticSplitView` component uses CSS visibility toggling:
```typescript
// Mount once, never unmount — just toggle visibility
<div style={{ display: isActive ? 'flex' : 'none' }}>
  <AgentPanel agent={agent} />
</div>
```

This is the **correct foundation** for agent switching:
- Agent process stays alive in background (no re-init cost)
- Chat history preserved in DOM (no re-render)
- Context kept in memory (no serialization overhead)
- Switch is instant (<16ms, single CSS property change)

The Agent Switcher should extend this pattern to all 4 agents.

---

## 14. Integration Specifications

> Exact repos, versions, and integration patterns for each recommended package.

### 14.1 react-complex-tree (Explorer Panel)

**Repo**: `lukasbach/react-complex-tree`
**Version**: Latest stable (MIT)
**Purpose**: File tree in Workspace Explorer sidebar

```tsx
import { UncontrolledTreeEnvironment, Tree, StaticTreeDataProvider } from 'react-complex-tree';
import 'react-complex-tree/lib/style-modern.css';

// Integration: Explorer panel reads from EditorStore + file system API
function ExplorerPanel() {
  const dataProvider = new StaticTreeDataProvider(fileTreeItems, (item, name) => ({
    ...item, data: name
  }));

  return (
    <UncontrolledTreeEnvironment
      dataProvider={dataProvider}
      getItemTitle={item => item.data}
      viewState={{}}
      onSelectItems={(items) => {
        // Open file in EditorStore on click
        const store = getEditorStore();
        store.openFile(items[0], content);
      }}
    >
      <Tree treeId="explorer" rootItem="root" treeLabel="Explorer" />
    </UncontrolledTreeEnvironment>
  );
}
```

**Mount point**: Left sidebar in Workspace page, below Activity Bar icons.

### 14.2 Monaco DiffEditor (Already Available)

**No install needed** — `@monaco-editor/react` includes DiffEditor.

```tsx
import { DiffEditor } from '@monaco-editor/react';

function DiffPanel({ original, modified, language }: DiffPanelProps) {
  return (
    <DiffEditor
      original={original}
      modified={modified}
      language={language}
      theme="vs-dark"
      options={{
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
      }}
    />
  );
}
```

**Mount point**: Tab in Editor area (like VS Code's diff view).

### 14.3 monaco-languageclient (LSP Bridge)

**Repo**: `TypeFox/monaco-languageclient`
**Version**: Latest stable (MIT)
**Purpose**: Connect Monaco editor to VS Code language servers via LSP

```tsx
import { MonacoLanguageClient } from 'monaco-languageclient';
import { CloseAction, ErrorAction } from 'vscode-languageclient';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';

// Connect to VS Code Bridge extension's LSP proxy
function connectLSP(languageId: string) {
  const url = getServiceWsUrl('vscode_bridge') + `/lsp/${languageId}`;
  const webSocket = new WebSocket(url);
  const socket = toSocket(webSocket);

  const reader = new WebSocketMessageReader(socket);
  const writer = new WebSocketMessageWriter(socket);

  return new MonacoLanguageClient({
    name: `${languageId} LSP`,
    clientOptions: {
      documentSelector: [{ language: languageId }],
      errorHandler: { error: () => ErrorAction.Continue, closed: () => CloseAction.Restart },
    },
    connectionProvider: { get: () => Promise.resolve({ reader, writer }) },
  });
}
```

**Integration**: VS Code Bridge extension runs the language server, proxies LSP messages over WebSocket to Context DNA's Monaco editor.

### 14.4 keytar (OS Keychain for Secrets)

**Repo**: `atom/keytar` (now community-maintained)
**Version**: Latest stable (MIT)
**Purpose**: SecretRef resolution for Config Packs

```typescript
// electron/main.ts — IPC handler for secret resolution
import keytar from 'keytar';

ipcMain.handle('secret:get', async (_, key: string) => {
  return keytar.getPassword('contextdna', key);
});

ipcMain.handle('secret:set', async (_, key: string, value: string) => {
  await keytar.setPassword('contextdna', key, value);
});

ipcMain.handle('secret:delete', async (_, key: string) => {
  return keytar.deletePassword('contextdna', key);
});
```

**Platform support**: macOS Keychain, Windows Credential Manager, Linux Secret Service (libsecret).

### 14.5 electron-updater (Auto-Update)

**Repo**: `electron-userland/electron-builder` (includes electron-updater)
**Version**: Matches electron-builder (MIT)
**Purpose**: Auto-update from GitHub Releases

```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'contextdna',
  repo: 'context-dna-releases',
});

// Check on startup, then every 4 hours
autoUpdater.checkForUpdatesAndNotify();
setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);

autoUpdater.on('update-downloaded', () => {
  // Notify user, let them choose when to restart
  mainWindow.webContents.send('update-ready');
});
```

---

## 15. Corrigibility Gap Closure — Path to 100%

> Status date: 2026-03-03. Based on 5-agent structured diff of all admin docs vs actual codebase.
> Source docs diffed: Dashboard-Workspace-Live-Plans.md, Dashboard-Workspace-Live-Spec.md, Dashboard-Workspace-Live.md, IDE-Legit-Node-Red.md, problems-for-surgeons.md
>
> **Principle**: Items selected for "wise superior choices" — only gaps that genuinely improve the system. Items where our implementation is architecturally superior to the doc's vision are marked SUPERSEDED.

### 15.1 What's DONE Since Section 13 (2026-02-12 → 2026-03-03)

M10.1–M10.7 closed the majority of Section 13's gaps:

| Section 13 Item | Now Status | Implementation |
|----------------|-----------|----------------|
| Three-page routing (P0) | DONE | `app/dashboard/page.tsx`, `app/workspace/page.tsx`, `app/live/page.tsx` |
| Panel Protocol v1 types (P1) | DONE | `lib/panels/panel-protocol.ts` + `engine/panel/` (dual implementation) |
| Panel registry API (P1) | DONE | `engine/panel/registry.ts` — 8 capabilities, permission resolution |
| CapabilityBus (P1) | DONE | `engine/integration/CapabilityBus.ts` — typed pub/sub, entity store, ring buffer |
| Context handoff (P2) | DONE | `lib/agents/context-handoff.ts` — buildHandoffSummary from last 20 events |
| Panel state machine | DONE | `engine/panel/state-machine.ts` — 7 states, deterministic TRANSITION_TABLE |
| Panel renderer | DONE | `components/live/panel-renderer.tsx` — 4 transports |
| Agent Manager singleton (P1) | DONE | `lib/agents/agent-manager.ts` — 4 agents, foreground/background |
| ProjectDialogue EventStore (P1) | DONE | `lib/agents/project-dialogue.ts` — 7 event types, bounded ring (500) |
| Benchmark runner (P1) | DONE | `lib/benchmark/runner.ts` + `benchmark-card.tsx` |
| Electron main+preload (P2) | DONE | `electron/main.ts`, `electron/preload.ts`, 5 IPC domains |
| Electron build config (P2) | DONE | `electron-builder.json` — Mac/Win/Linux |
| Config pack builder+signing | DONE | `engine/pack/` — manifest, builder, HMAC signing |
| Config pack browser UI | DONE | `components/dashboard/views/config-pack-browser.tsx` |
| Lite/Heavy mode switch | DONE | `engine/mode/mode-switch.ts` + `lib/hooks/use-mode.ts` |
| Integration providers (P2) | DONE | 20+ providers in `lib/ide/providers/`, 3 reference in engine |
| Evidence pipeline API | DONE | `lib/api/evidence.ts` |
| Recovery telemetry | DONE | `engine/builder/restore-proceed.ts` + `_diagnostics.ts` |

### 15.2 SUPERSEDED (Our Implementation Is Superior)

These doc items are intentionally not implemented as described — our architecture is better:

| Doc Vision | Our Approach | Why Ours Is Better |
|-----------|-------------|-------------------|
| Node-RED visual programming | CapabilityBus typed events | Compile-time safety, no runtime Node-RED dependency, ~70 typed events vs fragile wires |
| Single Panel Registry | Dual registry (frontend + engine) with ProviderBridge | Separation of concerns — engine validates capabilities, frontend manages UI lifecycle |
| Desktop Commander as MCP server | Electron IPC modules (5 domains) | Direct IPC = lower latency, no HTTP overhead, native Electron integration |
| Single event system | Kernel EventTypes + CapabilityEventTypes | Different scopes: kernel = injection/recovery, capability = DevOps/integration |

### 15.3 Remaining Gaps — Ranked by Impact

#### Tier 1: Architecture Wiring (highest value — connecting existing pieces)

| # | Gap | What Exists | What's Missing | Impact |
|---|-----|------------|---------------|--------|
| G1 | **Event bridge: kernel ↔ CapabilityBus** | Kernel EventTypes in `engine/types/events.ts`, CapabilityBus in `engine/integration/CapabilityBus.ts` | Bridge that forwards kernel events (injection.complete, quality.fail, recovery.triggered) to CapabilityBus subscribers | HIGHEST — unlocks cross-system observability, dashboard can react to injection events |
| G2 | **Real health data → dashboard** | Backend `health.ts` (8 DB checks + Redis), `metrics.ts` (Redis telemetry) | API route + system-health provider wiring to push live data to dashboard panels | HIGHEST — dashboard currently shows stale/mock health data |
| G3 | **Config Pack API route** | Engine `pack/builder.ts` + `pack/signing.ts`, Frontend `config-pack-browser.tsx` | API route: `app/api/packs/route.ts` — list, download, install packs | HIGH — both endpoints exist, need plumbing |
| G4 | **SyncManager orchestrator** | `sync-state-store.ts` (posture state machine), `mode-switch.ts` (mode transitions) | SyncManager class coordinating posture transitions on mode changes, data integrity during switches | HIGH — components exist, orchestrator missing |

#### Tier 2: Intelligence Quality (webhook/injection improvement)

| # | Gap | What Exists | What's Missing | Impact |
|---|-----|------------|---------------|--------|
| G5 | **S6 file-awareness** | `ide_detection.py` feeds `boundary_decision` into S1, `generate_section_6()` in webhook builders | Pass `active_file` + `boundary_decision` to `generate_section_6()` so Synaptic guides based on what Atlas is editing | HIGH — Synaptic gives generic guidance without file context |
| G6 | **Heading-based MD chunking** | Markdown Memory Layer (port 8888) | Chunk .md files by heading hierarchy for finer-grained retrieval | MEDIUM — improves context retrieval quality |

#### Tier 3: Product Features (valuable but not core infrastructure)

| # | Gap | What Exists | What's Missing | Impact |
|---|-----|------------|---------------|--------|
| G7 | **Pipeline visualization panel** | `@xyflow/react` already installed, CapabilityBus has ring buffer | ReactFlow panel rendering injection pipeline as read-only flow diagram | MEDIUM — visual debugging of 9-section pipeline |
| G8 | **VS Code Extension scaffold** | `lib/ide/providers/vscode-bridge-provider.ts` (WebSocket client, JSON-RPC) | Actual VS Code extension repo with WebSocket server on port 8765 | MEDIUM — provider contract ready, extension unlocks IDE integration |
| G9 | **LLM Benchmark instrumentation** | `lib/benchmark/runner.ts` + UI cards | Wire TTFT/tokens-per-sec extraction from `llm_priority_queue.py` Redis telemetry | MEDIUM — real benchmark data vs synthetic |

#### Tier 4: Electron Polish (P3 — pre-distribution)

| # | Gap | What Exists | What's Missing | Impact |
|---|-----|------------|---------------|--------|
| G10 | **userData path resolution** | `electron/main.ts`, `env-detect.ts` | `electron/paths.ts` — userData resolution for all DBs | LOW — needed before Electron distribution |
| G11 | **Secret resolver (keytar)** | Config pack system, Electron IPC | `lib/config/secret-resolver.ts` — OS keychain integration | LOW — needed for config packs with secrets |
| G12 | **Auto-updater** | `electron-builder.json` | `electron-updater` integration in main.ts | LOW — needed before Electron distribution |

#### Tier 5: Documentation/Hygiene

| # | Gap | What Exists | What's Missing | Impact |
|---|-----|------------|---------------|--------|
| G13 | **Dual registry documentation** | Frontend PanelRegistry + Engine PanelRegistry + ProviderBridge | Architectural note explaining the boundary and when to use which | LOW — prevents developer confusion |
| G14 | **MEMORY.md accuracy** | Claims "LLM HEALTH GATE" exists | Remove or implement — documentation drift | LOW — housekeeping |

### 15.4 Completion Scorecard

| Category | Total Items | Done | Remaining | % Complete |
|----------|-----------|------|-----------|------------|
| Architecture (P0) | 5 | 5 | 0 | 100% |
| Core Value (P1) | 18 | 14 | 4 (G1-G4) | 78% |
| Extensions (P2) | 10 | 6 | 4 (G5-G8) | 60% |
| Polish (P3) | 8 | 2 | 6 (G9-G14) | 25% |
| **Total** | **41** | **27** | **14** | **66%** |

To reach 100%: 14 items. To reach 90% (wise threshold): G1–G6 (6 items, all Tier 1+2).

---

## 16. Product Boundary Remediation — Project vs Tool Separation

> **Status date**: 2026-03-03. Based on 5-agent structured investigation comparing GPT design conversation (Versioned-Engine-Contracts-ContextDNA-vs-projects__chat.md) against actual codebase implementation.
>
> **Core question**: Does the product/tool boundary need to be established before proceeding with Electron distribution?
>
> **Verdict**: **YES.** The tool boundary must be caught up first. Estimated scope: 1-2 focused weeks.

### 16.1 The V3 Problem — Tool That Builds Itself

ContextDNA is simultaneously:
- **The project being built** — Aaron and Atlas develop it daily, learnings are about its own internals
- **The product/tool customers install** — users get context-aware AI assistance for *their* projects

This creates the V3 Complexity Vector: internal development knowledge (webhook architecture, GPU lock patterns, scheduler gotchas) must NEVER leak into customer workspaces. The GPT design conversation defined a Cognitive Invariance Spec to solve this. The 5-agent investigation measured actual implementation against that spec.

### 16.2 Five-Agent Investigation Results

#### Agent 1: TypeScript Engine Interfaces vs GPT Design Spec

**Alignment: ~60%**

| Interface | Spec Requirement | Implementation Status |
|-----------|-----------------|----------------------|
| `IWorkspaceStore` | Per-workspace memory isolation | EXISTS — profile-centric variant |
| `IMemoryStore` | 9 methods for memory CRUD | EXISTS — well-aligned |
| `IArchitectureStore` | Architecture twin queries | EXISTS — 5 methods |
| `IRunStore` | Agent attribution per run | **MISSING** — spec required for agent output tracking |
| `IInjectionStore` | Injection event recording | EXISTS — 6 methods |
| `IContextBuilder` | Exported interface contract | **NOT EXPORTED** — class exists, no interface |
| `EngineContext` | `productMode` + `developerMode` flags | **MISSING** — `productMode` exists as loose flag, no `developerMode` |
| `MemoryScope` | `"profile" \| "workspace"` (core=immutable) | RENAMED — `"global" \| "project" \| "session" \| "task"` |
| `Domain` type | Learning domain classification | **MISSING** |
| `PayloadManifest` | Auditable safety block | DIFFERENT — missing `workspaceId`, `engineMode`, `safety` block |
| Self-reference suppression | Automatic when `productMode=true` | IMPLEMENTED — but opt-in, not default |
| Write Gates | Domain/scope/confidence validation | **NOT IMPLEMENTED** |
| Mode switching | 8-stage migration pipeline | FULLY IMPLEMENTED |

**Critical gaps**: IRunStore, EngineContext, Write Gates, PayloadManifest safety block.

#### Agent 2: Python `src/` Product Leakage Analysis

**Alignment: ~20% — the most critical finding.**

| Component | Status | Detail |
|-----------|--------|--------|
| **Self-Reference Filter** | Built but INACTIVE | `product_mode: false` in `manifest.yaml`. Only masks term names, doesn't prevent knowledge leakage |
| **Boundary Intelligence** | Partial | 5 input signals, confidence-based filtering. But: NO ContextDNA self-detection, filtering is optional (`skip_boundary_intelligence` flag) |
| **Learning Storage** | GLOBALLY MIXED | Single SQLite DB per machine. No `workspace_id` column. ALL learnings from ALL projects in one table |
| **Webhook Injection** | Queries ALL learnings | `query.py` fetches all learnings. Boundary filtering is optional post-filter, can be skipped entirely |
| **Memory Query** | No workspace scope | `professor.py`, `query.py` search across all learnings regardless of project |

**Root cause**: The spec designed workspace isolation as a first-class data model (separate storage per workspace). The implementation treats it as an optional filter layer on top of global storage.

**Impact if shipped**: Customer opens their React project → ContextDNA injects Aaron's internal learnings about webhook architecture, GPU lock patterns, scheduler gotchas. Worse: customer's learnings about their React project pollute Aaron's ContextDNA dev workspace on the same machine.

#### Agent 3: Electron Readiness Assessment

**Readiness score: 2/10**

| Aspect | Status | Detail |
|--------|--------|--------|
| Electron shell | V0.1 stub | Splash screen, tray icon, dashboard placeholder. 437MB (mostly node_modules) |
| IPC handlers | Exist | 5 domains: window, file-system, docker, shell, api |
| Build config | Exists | `electron-builder.json` for Mac/Win/Linux |
| **Hardcoded endpoints** | BLOCKING | Points to `localhost:5044`, `localhost:8080`, etc. No config |
| **Dev artifacts** | BLOCKING | `.env` with API keys in Electron client directory |
| **Python backend** | BLOCKING | 82 Python modules required. No bundling strategy |
| **Product boundary** | BLOCKING | No mechanism to prevent dev learnings from reaching users |
| **userData paths** | MISSING | `electron/paths.ts` not implemented |

**Verdict**: The Electron shell is trivial to finish. The problem is what it connects to. Shipping today = shipping Aaron's internal dev data to customers.

#### Agent 4: Context Builder Pipeline vs Spec

**Pipeline alignment: ~75% — mechanism solid, invariance enforcement incomplete.**

| Component | Spec | Reality |
|-----------|------|---------|
| gather→filter→rank→fit→assemble | Yes | **IMPLEMENTED** — `ContextBuilder.build()` in `context-builder.ts` |
| `classifyWorkspace()` | Detect `contextdna_dev` vs `user_project` | **MISSING** — no workspace classification function |
| Self-reference suppression | Automatic when `productMode=true` | **OPT-IN** — called post-assembly only when flag set |
| `renderProductModePolicy()` | Safety block in payload manifest | **MISSING** — stub code only |
| Scope filter | Classify candidates by `profile` vs `workspace` | PARTIAL — relies on pre-tagged candidates |
| Dev Pack presence check | Enable dev mode only when dev pack present | **NOT IMPLEMENTED** |

**Root insight**: The spec designed cognitive invariance as a first-principle classification system ("what workspace am I in?" drives ALL behavior). The implementation treats it as optional flags and post-assembly filters.

#### Agent 5: Pack System + Mode Switch Readiness

**Alignment: ~75-80% — infrastructure done, critical execution paths stubbed.**

| Component | Status | Detail |
|-----------|--------|--------|
| Pack manifest types | DONE | `PackManifest.ts` — 4 types (context_capsule, memory_export, profile_snapshot, injection_bundle) |
| Pack builder | DONE | Fluent API: `addSection()`, `addSecretRef()`, `stripSecrets()`, `serialize()` |
| Pack signer | DONE | HMAC-SHA256 with verification and canonicalization |
| Pack presets | DONE | core (S0,S1,S2), dev (S0-S8), user (empty) |
| Mode switch state machine | DONE | idle→snapshotting→transitioning→validating→idle/rolling_back |
| Migration pipeline | DONE | 8-stage: preflight→lock→drain→snapshot→replay→flip→warmup→unlock |
| **Event log replay (stage 5)** | **STUBBED** | Always returns `{ success: true, eventsReplayed: 0 }` |
| **Write gate** | **NOT ENFORCED** | No application-layer validation before memory writes |
| **Sync queue** | **NOT EXECUTED** | SQL schema exists in `002_sync_and_boundaries.sql`, no runtime wiring |
| Language/Provider Packs | **MISSING** | Only core/dev/user presets. No distribution layer |

**Estimate**: 1-2 weeks for blocking items (event replay, write gate, sync queue execution).

### 16.3 The Core Architectural Insight

The GPT design conversation got the architecture RIGHT. The implementation built the **mechanisms** (self-ref filter, boundary intelligence, mode switch, pack signing) but never **wired the defaults to product-safe**.

Everything is built as opt-in developer features when the spec designed them as opt-out safety rails:

```
SPEC DESIGN:                          CURRENT REALITY:
┌─────────────────────┐               ┌─────────────────────┐
│ Product Mode = ON   │               │ Product Mode = OFF  │
│ Dev Mode = OFF      │               │ Dev Mode = ON       │
│ (unless dev pack    │               │ (always, no gate)   │
│  detected)          │               │                     │
│                     │               │                     │
│ Self-ref: AUTOMATIC │               │ Self-ref: OPT-IN    │
│ Write gates: ON     │               │ Write gates: NONE   │
│ Workspace scope: ON │               │ Workspace scope: N/A│
│ Boundary: MANDATORY │               │ Boundary: OPTIONAL  │
└─────────────────────┘               └─────────────────────┘
```

**Flipping the defaults and adding workspace isolation is the gap.**

### 16.4 Implementation Plan — 5 Workstreams

Each workstream is independent and can be parallelized. Ordered by criticality.

#### Workstream 1: Workspace-Scoped Storage (CRITICAL — foundations)

**Goal**: Every learning belongs to a workspace. Queries are scoped by default.

**Files to modify**:
| File | Change |
|------|--------|
| `memory/sqlite_storage.py` | Add `workspace_id TEXT` column to learnings table. Migration for existing data → `workspace_id='contextdna_dev'` |
| `memory/query.py` | Add `workspace_id` parameter to all query functions. Default: current workspace |
| `memory/professor.py` | Pass `workspace_id` to query layer |
| `memory/auto_capture.py` | Tag `workspace_id` on `capture_success()` and `capture_failure()` |
| `memory/observability_store.py` | Scope claims/outcomes by workspace |
| `memory/boundary_intelligence.py` | Add `classify_workspace()` → returns `contextdna_dev | user_project | unknown` |
| `context-dna/engine/types/memory.ts` | Add `workspaceId: string` to `MemoryItem` type |
| `context-dna/engine/interfaces/memory-store.ts` | Add `workspaceId` to query parameters |

**Migration strategy**:
```sql
-- Step 1: Add column (nullable for backwards compat)
ALTER TABLE learnings ADD COLUMN workspace_id TEXT DEFAULT NULL;

-- Step 2: Tag all existing data as contextdna_dev (Aaron's current data)
UPDATE learnings SET workspace_id = 'contextdna_dev' WHERE workspace_id IS NULL;

-- Step 3: Make column NOT NULL going forward
-- (handled in Python code, not ALTER TABLE — SQLite limitation)
```

**Workspace classification signals**:
```python
def classify_workspace(project_root: str) -> str:
    """Detect workspace type from project markers."""
    markers = {
        'contextdna_dev': [
            '.projectdna/manifest.yaml',  # ContextDNA's own manifest
            'memory/llm_priority_queue.py',  # internal memory system
            'context-dna/engine/',  # engine source
        ],
        'user_project': [
            'package.json',  # generic project
            'pyproject.toml',
            'Cargo.toml',
            '.git/',
        ]
    }
    # Check contextdna_dev markers first (more specific)
    contextdna_score = sum(1 for m in markers['contextdna_dev']
                          if os.path.exists(os.path.join(project_root, m)))
    if contextdna_score >= 2:
        return 'contextdna_dev'
    return 'user_project'
```

**Tests**:
- Existing learnings get `workspace_id='contextdna_dev'` after migration
- New learnings tagged with auto-detected workspace
- Queries only return learnings from matching workspace
- Cross-workspace queries require explicit opt-in flag

#### Workstream 2: Self-Reference Suppression Default Flip (CRITICAL — safety)

**Goal**: Product mode ON by default. Dev mode only when dev pack detected.

**Files to modify**:
| File | Change |
|------|--------|
| `.projectdna/manifest.yaml` | Change `product_mode: false` → `product_mode: true` (default for all installs) |
| `context-dna/engine/builder/context-builder.ts` | Check for dev pack presence → set `developerMode=true` only when detected |
| `context-dna/engine/builder/invariance-filters.ts` | `filterSelfReferences()` active by default (not gated on `productMode` flag) |
| `memory/self_reference_filter.py` | Activate by default. Add deep filtering (content analysis, not just term masking) |
| `memory/persistent_hook_structure.py` | Remove `skip_boundary_intelligence` flag. Boundary filtering always on |
| `context-dna/engine/types/context.ts` | Add `developerMode: boolean` to `InjectionResult` |
| `context-dna/engine/pack/PackManifest.ts` | Add `type: 'dev_pack'` check for enabling dev mode |

**Dev pack detection**:
```typescript
// context-builder.ts
function detectDevMode(project: ProjectConfig): boolean {
  // Dev mode ONLY when:
  // 1. Dev pack is present in project root
  // 2. OR explicit .contextdna/dev-mode.json exists
  const devPackPath = path.join(project.root, '.contextdna', 'packs', 'dev');
  const devModeFlag = path.join(project.root, '.contextdna', 'dev-mode.json');
  return fs.existsSync(devPackPath) || fs.existsSync(devModeFlag);
}
```

**Deep self-reference filtering** (beyond term masking):
```python
# self_reference_filter.py additions
DEEP_PATTERNS = [
    r'webhook.*section',      # internal webhook architecture
    r'gpu.?lock',             # internal GPU management
    r'lite.?scheduler',       # internal scheduler
    r'priority.?queue',       # internal LLM routing
    r'gold.?mining',          # internal learning extraction
    r'butler.*protocol',      # internal butler system
    r'synaptic.*atlas',       # internal AI family
    r'cardiologist.*ekg',     # internal quality system
    r'section\s*[0-8]',       # internal webhook sections
]

def deep_filter(content: str, product_mode: bool) -> str:
    """Remove internal ContextDNA knowledge from product-mode output."""
    if not product_mode:
        return content  # Dev mode: show everything
    for pattern in DEEP_PATTERNS:
        content = re.sub(pattern, '[internal]', content, flags=re.IGNORECASE)
    return content
```

**Tests**:
- Default install has `productMode=true`
- ContextDNA dev workspace auto-detects dev pack → `developerMode=true`
- User project workspace → no dev pack → `developerMode=false`
- Deep filter removes internal patterns from product-mode output
- `skip_boundary_intelligence` flag removed, filtering always runs

#### Workstream 3: Write Gates (CRITICAL — data integrity)

**Goal**: No learning is stored without domain/scope/confidence validation.

**Files to create/modify**:
| File | Change |
|------|--------|
| `context-dna/engine/gates/write-gate.ts` | NEW — `WriteGate` class with validation pipeline |
| `context-dna/engine/types/memory.ts` | Add `WriteGateResult` type |
| `memory/write_gate.py` | NEW — Python-side write validation |
| `memory/auto_capture.py` | Route all captures through write gate |
| `memory/sqlite_storage.py` | Reject writes that bypass gate (gate token required) |

**Write Gate validation pipeline**:
```typescript
// engine/gates/write-gate.ts
interface WriteGateResult {
  allowed: boolean;
  reason?: string;
  gateToken?: string;  // Proof that validation passed
}

class WriteGate {
  validate(candidate: LearningCandidate): WriteGateResult {
    // Gate 1: Domain check — is this a valid learning domain?
    if (!VALID_DOMAINS.includes(candidate.domain)) {
      return { allowed: false, reason: `invalid domain: ${candidate.domain}` };
    }

    // Gate 2: Scope check — does this belong to current workspace?
    if (candidate.workspaceId !== this.currentWorkspace) {
      return { allowed: false, reason: 'cross-workspace write rejected' };
    }

    // Gate 3: Confidence check — minimum threshold for storage
    if (candidate.confidence < 0.3) {
      return { allowed: false, reason: `confidence ${candidate.confidence} below threshold 0.3` };
    }

    // Gate 4: Self-reference check — no ContextDNA internals in product mode
    if (this.productMode && this.containsSelfReference(candidate.content)) {
      return { allowed: false, reason: 'self-referential content blocked in product mode' };
    }

    // Gate 5: Deduplication — reject near-duplicates
    if (this.isDuplicate(candidate)) {
      return { allowed: false, reason: 'duplicate learning rejected' };
    }

    return {
      allowed: true,
      gateToken: this.generateToken(candidate),
    };
  }
}
```

**Python implementation**:
```python
# memory/write_gate.py
class WriteGate:
    VALID_DOMAINS = ['fix', 'pattern', 'gotcha', 'win', 'sop', 'architecture']

    def validate(self, content: str, domain: str, workspace_id: str,
                 confidence: float = 1.0) -> dict:
        """Validate before storing a learning."""
        if domain not in self.VALID_DOMAINS:
            return {'allowed': False, 'reason': f'invalid domain: {domain}'}
        if not workspace_id:
            return {'allowed': False, 'reason': 'workspace_id required'}
        if confidence < 0.3:
            return {'allowed': False, 'reason': f'confidence {confidence} < 0.3'}
        # Self-reference check in product mode
        if self.product_mode and self._contains_internal_ref(content):
            return {'allowed': False, 'reason': 'internal reference in product mode'}
        return {'allowed': True, 'gate_token': self._generate_token()}
```

**Tests**:
- Writes without gate token rejected by storage layer
- Cross-workspace writes blocked
- Low-confidence learnings rejected
- Self-referential content blocked in product mode
- Duplicate learnings deduplicated
- Dev mode allows ContextDNA internal learnings

#### Workstream 4: Engine Contract Completion (HIGH — spec alignment)

**Goal**: Implement missing TypeScript interfaces and types from the GPT design spec.

**Files to create/modify**:
| File | Change |
|------|--------|
| `context-dna/engine/interfaces/run-store.ts` | NEW — `IRunStore` interface for agent run attribution |
| `context-dna/engine/types/context.ts` | Add `EngineContext` type with `productMode` + `developerMode` |
| `context-dna/engine/types/memory.ts` | Add `Domain` type, align `Scope` with spec |
| `context-dna/engine/types/payload.ts` | Add safety block to `PayloadManifest` |
| `context-dna/engine/builder/context-builder.ts` | Export `IContextBuilder` interface, accept `EngineContext` |
| `context-dna/engine/mode/MigrationPipeline.ts` | Implement stage 5 event log replay (currently stubbed) |

**IRunStore interface**:
```typescript
// engine/interfaces/run-store.ts
export interface IRunStore {
  /** Record a new agent run */
  createRun(run: AgentRun): Promise<string>;
  /** Get run by ID */
  getRun(runId: string): Promise<AgentRun | null>;
  /** List runs for a workspace */
  listRuns(workspaceId: string, opts?: RunListOptions): Promise<AgentRun[]>;
  /** Record output from a run (learning candidate) */
  recordOutput(runId: string, output: RunOutput): Promise<void>;
  /** Get all outputs for a run */
  getOutputs(runId: string): Promise<RunOutput[]>;
}

interface AgentRun {
  id: string;
  agentId: string;
  workspaceId: string;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  metadata?: Record<string, unknown>;
}

interface RunOutput {
  type: 'learning' | 'edit' | 'diagnostic' | 'suggestion';
  content: string;
  confidence: number;
  gateResult?: WriteGateResult;  // Was this validated by write gate?
}
```

**EngineContext**:
```typescript
// engine/types/context.ts — addition
export interface EngineContext {
  productMode: boolean;      // true = suppress internals (default)
  developerMode: boolean;    // true = show internals (requires dev pack)
  workspaceId: string;       // current workspace identifier
  workspaceKind: 'contextdna_dev' | 'user_project' | 'unknown';
  engineVersion: string;     // semver of the engine
  activeProfile?: string;    // hierarchy profile name
}
```

**PayloadManifest safety block**:
```typescript
// engine/types/payload.ts — addition to PayloadManifest
interface SafetyBlock {
  productMode: boolean;
  developerMode: boolean;
  selfReferenceSuppressed: boolean;
  writeGateActive: boolean;
  workspaceKind: string;
  selfReferenceTermsFiltered: number;
}
```

**Tests**:
- IRunStore CRUD operations
- EngineContext created from workspace classification
- PayloadManifest includes safety block
- IContextBuilder interface matches implementation
- Event log replay processes staged events

#### Workstream 5: Electron Packaging Cleanup (HIGH — distribution readiness)

**Goal**: Clean Electron build with no dev artifacts, parameterized endpoints, proper userData resolution.

**Files to create/modify**:
| File | Change |
|------|--------|
| `context-dna/clients/electron/.env` | DELETE — move secrets to OS keychain |
| `context-dna/clients/electron/.gitignore` | Add `.env`, `*.key`, credential patterns |
| `electron/paths.ts` | NEW — `getUserDataPath()`, `getDatabasePath()`, `getConfigPath()` |
| `electron/main.ts` | Use `paths.ts` for all DB/config resolution |
| `electron/config.ts` | NEW — parameterized endpoints (not hardcoded localhost) |
| `electron-builder.json` | Verify ASAR config, strip dev files |
| `build/entitlements.mac.plist` | NEW — macOS hardened runtime entitlements |

**Endpoint configuration**:
```typescript
// electron/config.ts
export interface ServiceEndpoints {
  llm: string;        // default: 'http://127.0.0.1:5044'
  agentService: string; // default: 'http://127.0.0.1:8080'
  redis: string;       // default: 'redis://127.0.0.1:6379'
  postgres: string;    // default: 'postgresql://localhost:5432/context_dna'
  synaptic: string;    // default: 'http://127.0.0.1:8888'
  contextdna: string;  // default: 'http://127.0.0.1:8029'
}

export function loadEndpoints(): ServiceEndpoints {
  const configPath = path.join(app.getPath('userData'), 'config', 'endpoints.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return DEFAULT_ENDPOINTS;
}
```

**userData path resolution**:
```typescript
// electron/paths.ts
import { app } from 'electron';
import path from 'path';

export function getUserDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments);
}

export function getDatabasePath(dbName: string): string {
  const dbDir = getUserDataPath('databases');
  fs.mkdirSync(dbDir, { recursive: true });
  return path.join(dbDir, dbName);
}

export function getConfigPath(configName: string): string {
  const configDir = getUserDataPath('config');
  fs.mkdirSync(configDir, { recursive: true });
  return path.join(configDir, configName);
}

export function getLogPath(logName: string): string {
  const logDir = getUserDataPath('logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, logName);
}
```

**Build sanitization checklist**:
- [ ] No `.env` files in build output
- [ ] No API keys in any committed file
- [ ] No hardcoded `localhost` in production code (use config)
- [ ] ASAR enabled with native module unpacking
- [ ] Source maps excluded from production build
- [ ] Dev dependencies excluded from ASAR
- [ ] macOS entitlements for hardened runtime
- [ ] Code signing configured (Apple Developer Program)

**Tests**:
- `getUserDataPath()` resolves to `~/Library/Application Support/Context DNA/` on macOS
- `getDatabasePath('learnings.db')` creates directory if needed
- Endpoints load from config file when present, fall back to defaults
- Build output contains no `.env` or credential files
- ASAR correctly packages production code

### 16.5 Dependency Graph

```
Workstream 1 (Storage)  ──┐
                          ├──→ Workstream 3 (Write Gates)
Workstream 2 (Self-Ref)  ──┘         │
                                     │
Workstream 4 (Contracts) ────────────┘
                                     │
Workstream 5 (Electron) ─────────────┘
```

- Workstreams 1 + 2 are fully independent — can start in parallel
- Workstream 3 depends on Workstream 1 (`workspace_id` exists for gate validation)
- Workstream 4 depends on Workstreams 1-3 (types reflect new storage/gate model)
- Workstream 5 depends on Workstreams 1-2 (needs workspace isolation before packaging)
- **Parallelizable**: 1 + 2 + 5(partial) simultaneously. Then 3. Then 4.

### 16.6 Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| **Workspace isolation** | Query with `workspace_id='contextdna_dev'` returns 0 user-project learnings |
| **Self-ref suppression** | Product-mode injection contains 0 matches for `DEEP_PATTERNS` |
| **Write gate** | Attempted write without gate token raises `WriteGateError` |
| **Dev mode gating** | Workspace without dev pack → `developerMode=false` |
| **Electron clean build** | `grep -r 'sk-ant\|sk-proj\|API_KEY' dist/` returns 0 matches |
| **No global leakage** | New install with empty learnings DB → injection contains only core pack content |

### 16.7 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration corrupts existing learnings | LOW | HIGH | SQLite WAL + backup before migration |
| Self-ref filter too aggressive (strips valid content) | MEDIUM | MEDIUM | Allowlist for legitimate references, A/B testing |
| Write gate blocks valid learnings | MEDIUM | MEDIUM | Start with logging-only mode, graduate to enforcement |
| Performance regression from workspace scoping | LOW | LOW | Add index on `workspace_id` column |
| Dev pack detection false positives | LOW | MEDIUM | Require ≥2 markers, not just 1 |


essential to not lose or remove until finished work: 
3-Surgeon Status: All 3 ALIVE
Neurologist (Qwen3-4B): 607ms response
Cardiologist (GPT-4.1-mini): 499ms, $0.009 daily spend
Atlas (Claude Opus): Present
Down: agent_service (:8080), Synaptic (:8888) — need restart but not blocking
V12 Phase 3: YES, it got done
Lines 55-115 of atlas-ops.sh have the pre-flight enforcement: Redis telemetry logging, registry lookup via cached JSON, deprecation warnings for unregistered combos, non-blocking passthrough. Committed as 89b58df.

3-Surgeon Synthesis: Agent Findings vs TS/Electron Readiness
Both surgeons AGREE (high convergence):

TS components that are BLOCKED by Python instability:

VaultEventPoller — needs stable Python eventing (currently 53 scheduler jobs, 13 monitors with circular deps)
MCP client — needs reliable backend APIs (agent_service has FD leak, goes down)
CapabilityBus — event-driven, needs predictable Python state
TS components that CAN proceed independently:

action-registry.ts (45 actions) — catalog/type work, no runtime Python dependency
learning-write-gate.ts + tests — offline gate logic
UI/panel work — no backend coupling needed
scope-utils.ts — pure TS utility
Python must stabilize BEFORE TS layer is reliable:

God file decomposition (4647 lines → 200 line facade)
SQLite migration (281 raw calls → db_utils)
Mode authority adoption (3/9 → 9/9)
Monitoring consolidation (13 → 1)
Scheduler pruning (53 → 25)
Port 8888 (Markdown Memory Layer): Both surgeons say it should NOT be a hard dependency for Electron. TS app needs its own memory layer or graceful degradation. The circular deps in Python make 8888 unreliable as a production dependency.

Are We On Track? (Big Picture Assessment)
Honest answer: We're building the right foundation but execution is behind the vision.

Area	Status	Verdictproc
3-Surgeon Protocol	23 commands, all tested LIVE	ON TRACK
Agent research collection	7 deep audits preserved, policy set	ON TRACK
V12 Action Registry	45 actions, Phase 3 enforcement wired	ON TRACK
God file decomposition	Stalled at Phase 0 (5% shrink, not 60%)	BEHIND
Scheduler pruning	Plan exists, 0% executed (still at 53 jobs)	BEHIND
Monitoring consolidation	Plan exists, 0% executed (still 13 components)	BEHIND
SQLite migration	Plan exists, 0% executed (still 281 raw calls)	BEHIND
V2 Mode authority	33% adopted (3/9)	BEHIND
TS Electron readiness	Types + registry + gates built, but blocked by Python stability	BLOCKED
Webhook health (#1 priority)	Working but fragile (agent_service/Synaptic intermittent)	AT RISK
The pattern: We're excellent at research and planning (7 deep audit reports, 20 vectors tracked, 3-surgeon consensus). We're behind on execution of those plans. The 12+ agent audit sessions produced incredible intelligence — but the fixes are largely still pending.

Critical path: God file → Monitoring consolidation → Scheduler pruning → SQLite migration. Until these 4 stabilize, the TS Electron layer can't trust the Python backend it sits on top of.