# Dashboard-Workspace-Live — Formal Specification

> Distilled from Aaron's architectural decisions in `Dashboard-Workspace-Live.md` (conversation export).
> Cross-referenced against built code as of 2026-02-12.
> Companion to `Dashboard-Workspace-Live-Plans.md` (implementation roadmap).

---

## How to Read This Document

The source conversation is 900 lines of informal back-and-forth between Aaron and an AI assistant.
This spec extracts **Aaron's finalized decisions** — not the brainstorming, not the rejected paths.
Each section states: the decision, the rationale, the implementation contract, and what's already built.

---

## Table of Contents

1. [Three-Page Model](#1-three-page-model)
2. [Dashboard — Measurement Cockpit](#2-dashboard--measurement-cockpit)
3. [Workspace — DockView IDE](#3-workspace--dockview-ide)
4. [Live — Extensible Panel Host](#4-live--extensible-panel-host)
5. [Agent Delegation — Shared Dialogue + Role Switching](#5-agent-delegation--shared-dialogue--role-switching)
6. [Panel Protocol v1](#6-panel-protocol-v1)
7. [VS Code Bridge Strategy](#7-vs-code-bridge-strategy)
8. [Desktop Commander MCP Integration](#8-desktop-commander-mcp-integration)
9. [Config Packs & Secret Protection](#9-config-packs--secret-protection)
10. [Lite vs Heavy Mode](#10-lite-vs-heavy-mode)
11. [Electron Packaging](#11-electron-packaging)
12. [Dependency Management](#12-dependency-management)
13. [Database Corruption Prevention](#13-database-corruption-prevention)
14. [License Constraints](#14-license-constraints)
15. [LLM Benchmarking System](#15-llm-benchmarking-system)

---

## 1. Three-Page Model

### Decision

Three parent pages accessible from persistent top-level buttons:

| Page | Purpose | Primary UX |
|------|---------|------------|
| **Dashboard** | Measurement + configuration cockpit | Cards, charts, gauges — read-heavy |
| **Workspace** | DockView IDE (Explorer / Editor / Diff) | Panels, tabs, drag-drop — write-heavy |
| **Live** | Extensible panel host for extensions | Pluggable panels — extend-heavy |

### Key Rejected Alternatives

- **"Push-back" overlay** (workspace becomes transparent behind dashboard): REJECTED. Aaron separated them into distinct pages instead. Conversation line ~705: "I changed my mind about having a front view and a back view."
- **"Synaptic" as parent page**: REPLACED by "Workspace". Synaptic chat lives inside the Editor panel, not as its own page.

### Navigation

- Top-level nav: Three buttons — `Dashboard | Workspace | Live`
- Persistent across pages: Activity Bar (left edge), Status Bar (bottom)
- Keyboard shortcuts: `Cmd+1` (Dashboard), `Cmd+2` (Workspace), `Cmd+3` (Live)

### State Model

```typescript
type View = 'dashboard' | 'workspace' | 'live';

type AppState = {
  view: View;
  modes: {
    systemMode: 'lite' | 'heavy';
    agentMode: 'swarm' | 'single';
  };
  routing: {
    foregroundAgentId: string;
    executorAgentId: string;
    threadId: string;
    version: number;
  };
};
```

No overlay/backdrop state needed — each page is fully independent.

### Built Status

| Item | Status |
|------|--------|
| Route files (`/dashboard`, `/workspace`, `/live`) | BUILT |
| `PageProvider` context | BUILT |
| Top-level nav buttons (DockviewShell tabs) | BUILT (internal tab switching, not Next.js routes) |
| Activity bar page-aware filtering | BUILT |
| `Cmd+1/2/3` shortcuts | NOT BUILT |
| Per-route `layout.tsx` files | NOT BUILT (not needed until Electron packaging) |

---

## 2. Dashboard — Measurement Cockpit

### Decision

Dashboard is a **dedicated measurement and configuration area**, completely separate from the coding workspace. It houses:

**Section A**: Existing dashboard content (unchanged)

**Section B**: New telemetry tabs:

1. **LLM Performance** — On-demand benchmark results (TTFT, tok/s, p50/p95), current runtime status, "Copy stats" button
2. **System Health** — 60s snapshots (CPU%, RAM%, swap), top processes by CPU/memory, 5-minute zombie/rogue detection
3. **ContextDNA Services** — Known services list (LLM server, Redis, Postgres, Node-RED) with status/CPU/mem/restart count
4. **Bottlenecks** — Primary bottleneck card computed from decode/TTFT changes, memory pressure, process drains, unhealthy services
5. **Settings** — Lite/Heavy toggle, sampling intervals, default LLM runtime, default agent, agent permissions

### Sampling Cadence (Lightweight)

| Metric | Interval | Notes |
|--------|----------|-------|
| System snapshot (CPU/RAM/swap/top processes) | 60s | psutil or equivalent |
| Service snapshot (containers/processes) | 60s | docker stats + known process checks |
| Rogue/zombie scan | 300s | Heuristic-based |
| Panel cost scan | 300s | Electron app.getAppMetrics() |
| LLM benchmark | On-demand only | User-triggered |

### Built Status

| Item | Status |
|------|--------|
| Dashboard page route | BUILT |
| Existing dashboard panels (13 total) | BUILT |
| LLM Performance panel | NOT BUILT |
| System Health panel | NOT BUILT |
| ContextDNA Services panel | NOT BUILT |
| Bottleneck detection | NOT BUILT |
| Settings panel (Lite/Heavy) | NOT BUILT |

---

## 3. Workspace — DockView IDE

### Decision

Workspace is the pure coding environment. It contains three focus areas within DockView:

- **Explorer panel** (left) — file tree + search
- **Editor panel** (center) — code editing + agent chat
- **Diff panel** (right) — code diffs + version comparison

The Editor panel is the agent delegation hub (see Section 5).

### DockView Configuration for Performance

- Hidden panels **unmounted** by default (DockView's built-in behavior)
- All heavy panels are **lazy + gated**: stop timers/websockets/polling when `panel.isActive === false`
- Collectors run in **Electron main process**, not renderers
- UI refresh rate: **1 Hz max** for most widgets
- Prefer `Splitview/Gridview` for default layout; tabs only where needed

### Built Status

| Item | Status |
|------|--------|
| Workspace page route | BUILT |
| DockviewShell | BUILT |
| SynapticSplitView (keep-alive pattern) | BUILT |
| Explorer panel | NOT BUILT (file tree) |
| Editor panel (with agent chat) | PARTIAL (Synaptic chat exists, agent switching built but not wired) |
| Diff panel | NOT BUILT |
| Panel lifecycle (activate/deactivate/pause/resume) | NOT BUILT |

---

## 4. Live — Extensible Panel Host

### Decision

Live is **not** a real-time log viewer. It is a **panel host** — ContextDNA's extension ecosystem. Any tool can become a panel:

**First-party panels** (built by ContextDNA):
- Context injections viewer
- Today's learnings
- Architectural awareness graph
- Webhook injection inspector

**Third-party integrations** (via Panel Protocol v1):
- GitHub repos panel
- Hugging Face Spaces panel
- Node-RED editor embed
- Mobile app dev preview
- Front-end webapp views
- Desktop Commander MCP panel

**VS Code bridge panels** (opt-in from extension authors):
- Test runner results
- Linter diagnostics
- Git helper summaries

### Live Page Layout

- **Left**: Panel Catalog (installed panels, searchable)
- **Center**: DockView with tabs/groups (active panels)
- **Right**: Panel Inspector (permissions, resource usage, activity)
- **Bottom**: Optional event stream panel

### Panel Lifecycle Rules

- When panel is **not visible**: unsubscribe events, stop timers, pause network polling, release caches
- When panel is **visible**: resume subscriptions, poll at panel-defined cadence (bounded by global limits)
- Global limits configurable in Dashboard Settings

### Built Status

| Item | Status |
|------|--------|
| Live page route | BUILT |
| Panel catalog UI | NOT BUILT |
| Panel Protocol v1 implementation | NOT BUILT |
| Panel Inspector | NOT BUILT |
| Any Live panels | NOT BUILT |

---

## 5. Agent Delegation — Shared Dialogue + Role Switching

### Decision

All agents share **one canonical project dialogue**. Only one agent is "foreground" (speaking to user) at a time. Background agents work as a **swarm** — researching, planning, testing — posting results to an Agent Feed, not the main chat.

### Core Principles

1. **One shared transcript**: Every message, tool result, file change, test output goes into one `ProjectDialogue` event stream. All agents subscribe.
2. **One foreground agent**: Only the foreground agent posts `AGENT_MESSAGE` to the main chat.
3. **Background swarm**: Posts `AGENT_FEED_CARD` to a separate feed. User can review, adopt suggestions, or ignore.
4. **Instant role switching**: Change foreground agent via tab/dropdown. Same thread continues. A short "handoff capsule" is injected for the new foreground agent.
5. **Permissions follow roles**: Foreground can propose tool calls. Executor runs tools. Tester can run tests. Researcher is read-only.

### Agent Roles

```typescript
type AgentRole = 'foreground' | 'background';

// Internal sub-roles for background agents:
type SwarmMode = 'research' | 'planning' | 'testing' | 'watching';
```

### Built-in Agents

| Agent | Type | Default Role |
|-------|------|-------------|
| Claude Code | cloud | foreground |
| Synaptic (local LLM) | local | background (research + summarizer) |
| OpenHands | autonomous | executor + background (planning/test) |
| DeepSeek | cloud | background (alternative reasoning) |

### Editor Panel UI

The center Editor panel in Workspace hosts agent interaction:

- **Tab bar**: `Chat | Claude | Local | OpenHands` — selecting a tab switches foreground agent
- **Chat area**: Shared transcript (all agents see all dialogue)
- **Right drawer**: Swarm Feed (cards from background agents with "Adopt" / "Ask follow-up" / "Ignore" actions)
- **Bottom drawer**: Tool Log (executed commands + results)
- **Top bar badges**: Active agent indicator, executor dropdown, background status lights, context meter

### Handoff Capsule (on foreground switch)

```json
{
  "goal": "Fix failing user auth test",
  "branch": "feature/auth",
  "changedFiles": ["api/middleware/auth.ts"],
  "diffSummary": "Auth middleware now runs after user route",
  "currentFailures": ["user.test.ts → expects 200 got 401"],
  "recentDecisions": ["Keep auth logic centralized"],
  "nextSteps": ["Run targeted test", "Patch middleware order"]
}
```

### One-Agent-Only Mode

When `agentMode = 'single'`:
- Only one foreground/executor agent
- Swarm disabled (no feed cards)
- ContextDNA background tasks **still run**: diff summaries, repo facts, test monitoring, service health, zombie checks
- These are system tasks, not agent voices

### Built Status

| Item | Status |
|------|--------|
| AgentManager singleton | BUILT |
| ProjectDialogue EventStore | BUILT (Lite mode, in-process pub/sub, 500-event ring) |
| AgentSwitcher UI (tab bar + keep-alive) | BUILT |
| 4 built-in agent definitions | BUILT |
| Handoff capsule generation | NOT BUILT |
| Swarm Feed UI | NOT BUILT |
| Tool Log panel | NOT BUILT |
| Agent switching wired into Editor panel | NOT BUILT |
| Agent status badges in activity bar | NOT BUILT |
| One-agent-only mode toggle | NOT BUILT |

---

## 6. Panel Protocol v1

### Decision

Any tool can become a ContextDNA panel by implementing three primitives:

| Primitive | Purpose | Direction |
|-----------|---------|-----------|
| **Snapshot** | Current state ("What's the latest view?") | Panel → ContextDNA |
| **Events** | Changes over time ("What just happened?") | Panel → ContextDNA |
| **Commands** | Actions ("Do a thing") | ContextDNA → Panel |

### Transport Options

| Transport | Mode | Best For |
|-----------|------|----------|
| **File** | Lite (default) | Most reliable, no ports, no firewall |
| **WebSocket** | Heavy | Real-time, interactive |
| **HTTP/SSE** | Either | Easy to debug |

### File Transport Paths

```
~/.contextdna/panels/<panel-id>/snapshot.json
~/.contextdna/panels/<panel-id>/events.jsonl
```

### Panel Manifest (`contextdna.panel.json`)

```json
{
  "id": "com.acme.jest",
  "name": "Jest Runner",
  "version": "1.0.0",
  "description": "Runs tests and streams results.",
  "entry": {
    "transport": "file",
    "path": "~/.contextdna/panels/com.acme.jest/"
  },
  "capabilities": ["snapshot", "events", "commands"],
  "permissions": {
    "readWorkspace": true,
    "network": "local-only",
    "exec": false
  },
  "ui": {
    "icon": "beaker",
    "defaultSize": "md",
    "tags": ["tests", "ci"]
  }
}
```

### Message Formats

**Snapshot:**
```json
{
  "type": "snapshot",
  "panelId": "com.acme.jest",
  "ts": 1730000000000,
  "payload": { "status": "idle", "lastRun": "ok", "tests": 421 }
}
```

**Event:**
```json
{
  "type": "event",
  "panelId": "com.acme.jest",
  "ts": 1730000000123,
  "event": "test.failed",
  "payload": { "file": "auth.test.ts", "name": "rejects invalid token" }
}
```

**Command:**
```json
{
  "type": "command",
  "id": "cmd_123",
  "panelId": "com.acme.jest",
  "name": "runTests",
  "args": { "pattern": "auth" }
}
```

### Security Rules

- Local only (`127.0.0.1` or filesystem)
- Token-auth for WS/HTTP (per workspace)
- Commands require explicit permission grant
- Panels sandboxed via webview/iframe (third-party), or React component (first-party)

### Built Status

Entirely NOT BUILT. This is the Live page's core contract.

---

## 7. VS Code Bridge Strategy

### Decision

**"Integrate with VS Code, don't re-host VS Code."**

ContextDNA does **not** run VS Code extensions internally. Instead:

1. User installs extensions in VS Code normally
2. Extensions that support it emit a JSON feed (file/WS/HTTP)
3. ContextDNA reads the feed and renders it as a Live panel

### Why Not Re-Host

VS Code extensions assume: extension host process, VS Code APIs, webviews, activation events. Re-hosting that turns ContextDNA into "VS Code but harder."

### Preferred Integration Path

For most tools, **integrate the underlying engine directly** rather than bridging the VS Code extension:

| Instead of Bridging | Integrate Directly |
|---------------------|-------------------|
| ESLint extension | `eslint --format json` CLI |
| Jest Test Explorer | `jest --json` CLI |
| GitLens | `git` + libgit2 |
| Prettier extension | `prettier` CLI |
| Language servers | LSP protocol directly |

### VS Code Bridge Discovery

Extensions register via:
```
~/.contextdna/vscode-bridge/registry.json
```

Or ContextDNA publishes a "Bridge Helper" VS Code extension that other extensions can integrate with.

### Built Status

NOT BUILT. This is a future Electron-phase feature.

---

## 8. Desktop Commander MCP Integration

### Decision

Desktop Commander MCP integrates as:

1. **An optional Executor backend** — agents emit tool call requests, executor routes them through MCP
2. **A Live-page panel** — shows active sessions, commands, process list, recent tool calls

### Executor Adapter Interface

```typescript
interface ExecutorAdapter {
  id: 'native' | 'desktopCommanderMCP' | 'openhands';
  canRun(tool: ToolName): boolean;
  execute(req: ToolCallRequest): Promise<ToolCallResult>;
}
```

### Dashboard Controls

- Toggle: "Enable Desktop Commander integration"
- Choose as default executor (or per-workspace)
- Set permissions: file roots, allowed commands, docker access
- Health indicator: MCP server reachable? Last command time? Failure count?

### Built Status

NOT BUILT. Desktop Commander MCP is available as a dependency (MIT license).

---

## 9. Config Packs & Secret Protection

### Decision

Shareable configurations are split into two layers:

**Shareable Config** (goes to community):
- Panel layout, tabs, split sizes
- Agent workflows, routing rules
- Prompt templates, injection rules
- Model selections, temperature defaults

**Local Secrets** (never synced):
- API keys (stored in OS Keychain / Credential Manager)
- AWS credentials, JWTs
- Internal endpoints

### SecretRef Pattern

In shareable config, secrets are referenced, never stored:
```json
{
  "providers": {
    "anthropic": {
      "apiKeyRef": "secret://anthropic/api_key"
    }
  }
}
```

Runtime resolves `secret://` URIs against local OS keychain. Missing secrets prompt "Connect provider" UI.

### Three Guardrails

1. **Separate storage**: Secrets in OS Keychain, never in config files
2. **Export sanitizer**: Strips keys matching `/key|token|secret|password|private/i`
3. **Explicit publish**: "Create shareable pack" → preview diff → "Publish" (no silent auto-push)

### Pack Structure

```
packs/<username>/<pack-name>/
  manifest.json
  config.json
  assets/ (optional)
  signature.sig (premium packs only)
```

### Shared Pack Concept (from BoardKit evaluation)

A ContextDNA pack = versioned bundle of:
- Agents, rules, prompts
- Panel manifests
- Injection templates

Packs can be applied per repo. Premium packs are signed server-side. Community packs can be unsigned but marked "untrusted."

### Built Status

NOT BUILT. This is an Electron-phase feature.

---

## 10. Lite vs Heavy Mode

### Decision

One interface, two backends. The API surface is identical — UI and agents don't care which mode is active.

### EventStore Interface

```typescript
interface EventStore {
  append(event: Event): Promise<void>;
  subscribe(cb: (event: Event) => void): () => void;
  getRecent(opts: { limit: number; visibility?: string[] }): Promise<Event[]>;
  setRouting(routing: Routing): Promise<void>;
  getRouting(): Promise<Routing>;
  putCtx(key: string, value: any, ttlMs: number): Promise<void>;
  getCtx(key: string): Promise<any | null>;
  putSnapshot(kind: string, payload: any): Promise<void>;
  getLatestSnapshot(kind: string): Promise<any | null>;
}
```

### Lite Mode (Default)

- **Storage**: SQLite tables (`events`, `snapshots`, `routing`, `ctx`)
- **Pub/sub**: In-process (Node EventEmitter or equivalent)
- **No external services required**
- **Swarm**: Runs in-process or via local worker threads

### Heavy Mode (Optional)

- **Storage**: Redis streams + hashes for real-time fanout
- **Persistence**: SQLite as cold store (optional)
- **Pub/sub**: Redis pub/sub
- **Swarm**: Can be multiple processes/containers

### Redis Key Layout (Heavy Mode)

```
cdna:{projectId}:{workspaceId}:events       (STREAM)
cdna:{projectId}:{workspaceId}:agent_feed   (STREAM)
cdna:{projectId}:{workspaceId}:tool_log     (STREAM)
cdna:{projectId}:{workspaceId}:routing      (HASH)
cdna:{projectId}:{workspaceId}:agents       (HASH)
cdna:{projectId}:{workspaceId}:ctx:*        (STRING with TTL)
```

### Built Status

| Item | Status |
|------|--------|
| ProjectDialogue (in-process pub/sub) | BUILT (Lite mode only) |
| SQLiteEventStore | NOT BUILT (ProjectDialogue uses in-memory array) |
| RedisEventStore | NOT BUILT |
| EventStore interface abstraction | NOT BUILT |
| Mode toggle UI | NOT BUILT |

---

## 11. Electron Packaging

### Decision

Three storage domains, strictly separated:

### A) App Bundle (Immutable)

What goes **in ASAR**:
- JS/TS code (main + renderer)
- JSON schemas, UI assets
- Base Pack content (prompts/manifests/templates)
- Small static files

What goes **in `resources/bin/`** (outside ASAR):
- Native executables
- Embedded Python runtime (optional)

What **never** goes in the app bundle:
- Docker images (too large)
- Model files
- User data

### B) UserData (Mutable, Per-User)

Location: `app.getPath('userData')` → e.g., `~/Library/Application Support/ContextDNA/`

```
ContextDNA/
  db/
    events.sqlite
    snapshots.sqlite
    workspaces.sqlite
  cache/
    repo_index/
    retrieval/
    embeddings/
  packs/
    base/                  (copied on first run)
    installed/
      vendor.pack@1.2.3/
        manifest.json
        agents/
        prompts/
        panels/
        injections/
    enabled.json
  workspaces/
    <workspaceHash>/
      workspace.json
      routing.json
      policies.json
  extensions/
    live_panels_registry.json
  deps/
    installed.json
    downloads/
  logs/
  security/
    keychain_refs.json
```

### C) User Project Repos (External)

- ContextDNA never stores itself inside user repos by default
- Optional: `.contextdna/config.json` pointer file (user opt-in)
- Never stores secrets in repo

### Built Status

NOT BUILT. Current deployment is Next.js web app, not Electron.

---

## 12. Dependency Management

### Decision

External dependencies (Docker, xbar, Python, Redis) are managed via a **dependency catalog** shipped with the app and an **install wizard** in Dashboard.

### Dependency Catalog (`resources/deps/manifest.json`)

```json
{
  "deps": [
    {
      "id": "docker-desktop",
      "type": "external_app",
      "platforms": ["mac", "win"],
      "requiredFor": ["heavy_mode_docker"],
      "detect": { "kind": "command", "cmd": "docker --version" },
      "minVersion": "4.0.0"
    },
    {
      "id": "python",
      "type": "runtime",
      "requiredFor": ["lite_helpers"],
      "installModes": ["embedded", "system"],
      "pinnedVersion": "3.11.7"
    }
  ]
}
```

### Install Wizard (Dashboard Settings)

Phase 1 (always): Install app, create userData, initialize SQLite, enable Base Pack.

Phase 2 (optional cards):
- "Local LLM Runtime" — choose Ollama / vLLM / MLX
- "Enable Heavy Mode" — install Redis + workers
- "Docker" — only if user wants container-based panels
- "Menu Bar Integration" — xbar (macOS only)
- "Developer Tools" — Desktop Commander MCP

Each card: Detect status → "Install/Enable" → "Skip"

### Built Status

NOT BUILT. Electron-phase feature.

---

## 13. Database Corruption Prevention

### Decision

Prevent customers from accidentally running bidirectional sync or corrupting databases.

### Core Rules

1. **One authority at a time**: Lite mode → SQLite authoritative. Heavy mode → Postgres authoritative.
2. **Sync only during transitions**, not continuously bidirectional.
3. **Sync spine = append-only event log** (idempotent replication).
4. **SyncManager owns everything**, gated by locks + state machine.

### Sync State Machine

```
sync_state:
  mode: lite | heavy | transitioning
  authority: sqlite | postgres
  phase: idle | freeze | copy | verify | cutover | resume
  epoch_id: UUID
  started_at, completed_at
  last_lsn (per-store checkpoint)
```

Rule: if `phase != idle`, everything else refuses to sync.

### Locking

- **SQLite**: File lock at `userData/locks/sync.lock`
- **Postgres**: Advisory locks via `pg_try_advisory_lock(<hash>)`
- Both locks required to proceed

### Freeze Protocol

During mode switch:
1. Pause background jobs that write to DB
2. Pause tool log ingestion
3. Pause agent event writes (queue in-memory)
4. Perform sync
5. Replay queued writes after cutover

### DB Doctor Panel (Dashboard)

Shows: current mode + authority, lock status, last sync time, checkpoint IDs, "unsafe state detected" warnings. Provides safe buttons: "Repair from authoritative store", "Rebuild projections", "Export backup."

### Built Status

NOT BUILT. Context DNA currently has bidirectional sync (`unified_sync.py`) without state machine protection. This spec describes the safe customer-facing version.

---

## 14. License Constraints

### Decision

ContextDNA uses **only MIT and Apache-2.0 licensed** dependencies for integrated code. GPL-3.0 code is explicitly excluded from the product.

### Key Findings from Conversation

| Library | License | Decision |
|---------|---------|----------|
| eDEX-UI | GPL-3.0 | **REJECTED** — study aesthetic only, don't use code |
| DockView | MIT | **APPROVED** — core panel system |
| psutil | BSD | **APPROVED** — system telemetry |
| dockerode | Apache-2.0 | **APPROVED** — container monitoring |
| philschmid/llmperf-bench | MIT/Apache | **APPROVED** — benchmark engine |
| shadcn-admin | MIT | **APPROVED** — dashboard UI patterns |
| electron-react-boilerplate | MIT | **APPROVED** — Electron skeleton |
| electron-process-manager | MIT | **APPROVED** — panel cost monitoring |
| ninehills/llm-inference-benchmark | MIT | **APPROVED** — token metrics baseline |
| llmapibenchmark | GPL-3.0 | **REJECTED** — copyleft risk |
| Netdata | GPL (mixed) | **REJECTED** for integration — acceptable as separate external service |
| Glances | LGPL | **CAUTION** — only as separate executable, not statically linked |
| Desktop Commander MCP | MIT | **APPROVED** — executor backend |
| BoardKit/orchestrator | MIT | **APPROVED** — borrow "Shared Pack" concept only |

### Design Aesthetic

Inspired by eDEX-UI's futuristic minimalism but rebuilt from scratch:
- Deep matte black background (`#0A0F14`)
- Single accent color (neon cyan/teal)
- Hard panel framing with thin glowing borders
- Monospace typography (IBM Plex Mono / JetBrains Mono)
- Sparse iconography — data is primary
- Subtle pulse animations on active graphs

This is **design inspiration**, not code reuse. Legally clean.

---

## 15. LLM Benchmarking System

### Decision

Two benchmark modes with objective, reproducible results.

### Mode A — Local LLM "Dyno" (Model/Runtime Only)

Measures LLM server in isolation:
- TTFT (time to first token)
- Decode tokens/sec
- Total latency p50/p95
- Prompt ingestion time
- Resource usage: RAM/VRAM, CPU/GPU%, temperature/power

**Purity rules**: Single client, fixed prompts + output caps, fixed sampling, no tool calls, no retrieval, no injections.

### Mode B — "System Pipeline" (ContextDNA + Agent + Tools)

Measures full pipeline:
- End-to-end wall clock time
- "Time to first useful output" (TTFU)
- Number of steps / tool calls
- Token counts per model/provider
- $ cost (if remote API involved)
- Failure rate / retries

**Phase breakdown**:
1. Context collection
2. Retrieval / embedding lookup
3. Planner / router decision
4. Remote API call (if used)
5. Local LLM post-process
6. Tool execution (git/test)
7. Final response assembly

### Bottleneck Detection

Classify primary bottleneck from instrumented phases:

| Bottleneck | Evidence | Suggested Fix |
|------------|----------|---------------|
| GPU/accelerator | GPU utilization high during decode | Lower concurrency, smaller context |
| CPU | CPU pegged, GPU not saturated | Different runtime, fewer threads |
| Memory/KV-cache | Decode drops on long context, swap observed | Reduce context, lower quant, more RAM |
| Thermal/power | tok/s degrades across run | AC power, disable low power mode |
| Remote API latency | Remote phase > 55% wall time | Better injection, smaller model, caching |
| Tool execution | Tests/build/lint dominate | Targeted tests, incremental builds |

### Shareable Snapshot Format

"Copy stats" button produces:

```markdown
**ContextDNA Benchmark Snapshot**
- Date: 2026-02-11 09:12 America/Denver
- Suite: TTFT+ShortGen v1 (128/512/2048 → 64 out)
- Model: Qwen3-14B-Instruct (Q4_K_M), ctx 32k
- Runtime: vLLM-MLX 0.2.x (continuous batching ON, concurrency 4)

**Results**
- TTFT p50/p95: 0.42s / 0.81s
- Decode speed: 58.3 tok/s (avg), 51.0 tok/s (p95)
- End-to-end p50/p95: 1.51s / 2.34s

**Machine**
- macOS 15.x, Apple Silicon (M5), RAM 32GB, AC power
- machine_profile_hash: 9f3c…
- run_hash: 44a1…
```

### Integrity Measures

- **Run Hash**: Deterministic hash over suite + prompts + settings + runtime + model + tokenization
- **Machine Profile Hash**: Hashed high-level hardware info (OS, CPU family, GPU family, RAM, storage type, power mode) — privacy-safe, no serials
- **Leaderboard Eligible**: Fixed constraints (temperature, output tokens, suite prompts) — anything outside is labeled "Custom run (non-eligible)"

### Community Vision

- Users can publish anonymized snapshots (opt-in)
- Filter leaderboard by: hardware class, runtime, model + quant, suite
- Show: best p95 TTFT, best sustained tok/s, stability score

### Built Status

Entirely NOT BUILT. This is the Dashboard's benchmark subsystem.

---

## Node-RED Role (Clarification)

Aaron asked about Node-RED's role. The decision:

**Node-RED = orchestration + visualization bridge, NOT measurement engine.**

- Use for: live dashboard prototyping, event-driven alerts, conditional logic, pipeline visualization
- Do NOT use for: token benchmarking loops, heavy math, large log parsing
- Maps to: "Heavy Mode / Jetpack Mode" — enabled for power users, disabled by default

Node-RED becomes a **Live page panel** (via Panel Protocol v1), not a core dependency.

---

## Data Contracts (JSON Shapes)

### BenchmarkResult

```json
{
  "kind": "benchmark_result",
  "runId": "run_abc",
  "ts": 1730000000000,
  "suite": "ttft_shortgen_v1",
  "model": {
    "id": "qwen3-14b-q4",
    "provider": "local",
    "runtime": "ollama"
  },
  "metrics": {
    "ttft_ms_p50": 420,
    "ttft_ms_p95": 810,
    "tok_s_avg": 58.3,
    "tok_s_p95": 51.0,
    "e2e_ms_p50": 1510,
    "e2e_ms_p95": 2340
  },
  "hashes": {
    "run_hash": "44a1...",
    "machine_profile_hash": "9f3c..."
  }
}
```

### SystemSnapshot (every 60s)

```json
{
  "kind": "system_snapshot",
  "ts": 1730000000000,
  "cpu": { "percent": 24.1, "load1": 2.1 },
  "mem": { "used_gb": 18.2, "total_gb": 32.0, "swap_used_gb": 0.3 },
  "top": {
    "cpu": [{ "pid": 123, "name": "python", "cpu": 110.2, "rss_gb": 3.4 }],
    "mem": [{ "pid": 456, "name": "ollama", "cpu": 28.1, "rss_gb": 7.9 }]
  }
}
```

### ServiceSnapshot (every 60s)

```json
{
  "kind": "service_snapshot",
  "ts": 1730000000000,
  "services": [
    { "id": "redis", "status": "up", "cpu": 2.1, "mem_gb": 0.3, "source": "docker" },
    { "id": "llm_server", "status": "up", "cpu": 35.0, "mem_gb": 8.1, "source": "process" }
  ]
}
```

### RogueReport (every 5m)

```json
{
  "kind": "rogue_report",
  "ts": 1730000000000,
  "zombies": { "count": 2, "pids": [999, 1001] },
  "runaway": [
    { "pid": 123, "name": "python", "reason": "cpu>80% for 5m", "cpu_avg": 95.2 }
  ],
  "recommendations": [
    { "action": "inspect", "pid": 123 },
    { "action": "terminate", "pid": 999, "requiresConfirm": true }
  ]
}
```

### ProjectDialogue Event

```json
{
  "id": "evt_01H...",
  "ts": 1730000000000,
  "type": "USER_MESSAGE",
  "actor": { "kind": "user", "id": "aaron" },
  "thread": { "id": "thread_main", "turn": 128 },
  "visibility": "main",
  "payload": {
    "text": "Fix the failing test.",
    "ui": { "activeFile": "api/foo.ts" }
  }
}
```

---

## Implementation Priority

Based on what's built vs what's specified:

### P0 — Already Built (maintain)
- Three-page routing + PageProvider
- Activity bar page-filtering
- AgentManager + ProjectDialogue + AgentSwitcher
- 20 integration providers + CapabilityBus
- Existing 13 dashboard panels

### P1 — Wire What's Built
- Connect AgentSwitcher to Editor panel
- Add agent status badges to activity bar
- Wire Panel Protocol v1 skeleton for Live page

### P2 — Core New Features
- EventStore abstraction (SQLite backend)
- System/service snapshot schedulers
- Dashboard telemetry tabs
- Explorer + Diff panels for Workspace

### P3 — Electron Phase
- ASAR packaging
- UserData layout
- Config Packs + signing
- Dependency catalog + install wizard
- DB corruption prevention (sync state machine)
- VS Code bridge discovery

### P4 — Community Phase
- LLM benchmarking suites
- Bottleneck detection engine
- Shareable snapshots + leaderboard
- Panel marketplace
- Pack publishing flow
