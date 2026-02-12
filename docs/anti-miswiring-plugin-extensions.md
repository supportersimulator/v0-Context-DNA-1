# Anti-Miswiring Plugin Extensions Architecture

> **Invariance Guarantee**: Adding integration N+1 changes exactly ZERO lines in integrations 1..N.

This document specifies the Integration Provider system, CapabilityBus, and panel workflow architecture built into the admin.contextdna.io IDE. It is written as an anti-miswiring specification — every contract, boundary, and data flow is defined such that incorrect wiring is caught at compile time, not at runtime.

---

## Table of Contents

1. [Philosophy & Invariance Principles](#1-philosophy--invariance-principles)
2. [Provider Manifest Specification](#2-provider-manifest-specification)
3. [CapabilityBus Architecture](#3-capabilitybus-architecture)
4. [Workflow Chains (Panel-to-Panel Integration)](#4-workflow-chains-panel-to-panel-integration)
5. [Suggested Panel Groups](#5-suggested-panel-groups)
6. [Smart Recognizer](#6-smart-recognizer)
7. [Provider Implementation Guide](#7-provider-implementation-guide)
8. [Invariance Guarantees](#8-invariance-guarantees)
9. [MCP Compatibility Layer (Future)](#9-mcp-compatibility-layer-future)
10. [Safety & Consent Model](#10-safety--consent-model)
11. [Eval-First Engineering](#11-eval-first-engineering)

---

## 1. Philosophy & Invariance Principles

### The Core Problem

Plugin architectures fail in one of three ways:

1. **Coupling creep** — Provider A imports Provider B, creating hidden dependency chains
2. **Event spaghetti** — Untyped string events where a typo causes silent failure
3. **Contract drift** — Provider X implements 80% of the interface, fails on the 20% path nobody tested

### The Anti-Miswiring Solution

Every integration MUST implement `IntegrationProvider`. This is not a guideline — it is enforced by TypeScript's structural type system. A provider that omits `checkAuth()` does not compile. A provider that emits an event not in `CapabilityEvents` does not compile.

```
                    +-----------------------+
                    | IntegrationProvider   |  <-- THE CONTRACT
                    +-----------------------+
                    | id, name, icon        |
                    | category              |
                    | auth: AuthStrategy    |
                    | panels: string[]      |
                    | actions: Action[]     |
                    | emits: EventType[]    |
                    | subscribesTo: Event[] |
                    | checkAuth()           |
                    | listResources()       |
                    | getResource()         |
                    | executeAction()       |
                    | startEventSource?()   |
                    | initialize?()         |
                    | dispose?()            |
                    +-----------------------+
                           |
          +----------------+----------------+
          |                |                |
     +--------+      +--------+      +--------+
     | EAS    |      | Vercel |      | Sentry |  ... 12 providers
     +--------+      +--------+      +--------+
```

### Three Laws

1. **Contract-first**: The `IntegrationProvider` interface is the single source of truth. Type safety enforces correctness at compile time.
2. **Additive-only**: Adding a new provider is a file addition + one line in `ALL_PROVIDERS`. No existing code changes.
3. **Opt-in subscriptions**: No provider is forced to handle events. `subscribesTo: []` is valid and common.

---

## 2. Provider Manifest Specification

### 2.1 The IntegrationProvider Contract

Source: `lib/ide/integration-manifest.ts`

```typescript
export interface IntegrationProvider {
  // -- Identity --
  id: string;                        // Unique identifier (e.g., 'eas', 'vercel')
  name: string;                      // Human-readable name
  icon: string;                      // Lucide icon name (e.g., 'Smartphone')
  category: IntegrationCategory;     // Classification bucket
  description: string;               // One-line summary

  // -- Auth --
  auth: AuthStrategy;
  checkAuth(): Promise<{ ok: boolean; error?: string }>;

  // -- Panels --
  panels: string[];                  // Panel IDs this provider contributes

  // -- Resources (read-only CRUD) --
  listResources(type: string, query?: string, limit?: number): Promise<IntegrationResource[]>;
  getResource(type: string, id: string): Promise<IntegrationResource | null>;

  // -- Actions (side-effectful operations) --
  actions: IntegrationAction[];
  executeAction(actionId: string, params: Record<string, unknown>): Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
  }>;

  // -- Events --
  emits: CapabilityEventType[];      // Events this provider can produce
  subscribesTo: CapabilityEventType[]; // Events this provider reacts to
  startEventSource?(): Disposable;   // Start polling/webhook listener

  // -- Lifecycle --
  initialize?(): Promise<void>;      // Called once on registration
  dispose?(): void;                  // Called on deregistration
}
```

Every field is mandatory except those marked with `?`. Optional lifecycle methods allow providers to set up persistent connections (`initialize`) and tear them down (`dispose`), and optional event sources (`startEventSource`) enable real-time polling or webhook listeners.

### 2.2 Integration Categories

```typescript
type IntegrationCategory =
  | 'registry'       // Docker Hub, npm, PyPI, GHCR
  | 'compute'        // Ollama, StackBlitz, CodeSandbox
  | 'deploy'         // Vercel, Fly.io, AWS
  | 'appdev'         // EAS, App Store Connect, TestFlight
  | 'ml'             // HuggingFace, Kaggle, W&B, MLflow
  | 'ci'             // GitHub Actions, CircleCI, Buildkite
  | 'observability'  // Sentry, Datadog, Grafana
  | 'project'        // Linear, Jira, PagerDuty
  | 'vcs'            // GitHub, GitLab, Bitbucket
  | 'testing'        // API Tester, Cypress, Playwright
  | 'preview';       // Frontend Preview, Browser DevTools
```

Categories serve two purposes: (1) UI grouping in the integration marketplace panel, and (2) workflow preset filtering. A provider belongs to exactly one category.

### 2.3 Auth Strategies

Five auth strategies cover every integration pattern:

| Strategy | Type Signature | Use Case | Example Provider |
|----------|---------------|----------|------------------|
| **api_key** | `{ type: 'api_key'; envKey: string; headerName?: string }` | Bearer token from env | Vercel (`VERCEL_TOKEN`), Sentry (`SENTRY_AUTH_TOKEN`) |
| **oauth** | `{ type: 'oauth'; provider: string; scopes: string[] }` | OAuth2 flow with scopes | Future: GitHub (with fine-grained scopes) |
| **jwt** | `{ type: 'jwt'; issuer: string; keyFile?: string }` | Self-signed JWT from key file | App Store Connect (`.p8` key) |
| **local_socket** | `{ type: 'local_socket'; socketPath: string }` | Local process on known port | Ollama (`http://127.0.0.1:11434`) |
| **none** | `{ type: 'none' }` | No auth required | StackBlitz (anonymous sandboxes) |

#### Auth Contract

Every provider MUST implement `checkAuth()`:

```typescript
// api_key example (Vercel)
async checkAuth() {
  const res = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN ?? ''}` },
  });
  return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
}

// local_socket example (Ollama)
async checkAuth() {
  const res = await fetch('http://127.0.0.1:11434/api/version');
  return res.ok
    ? { ok: true }
    : { ok: false, error: `Ollama not reachable: HTTP ${res.status}` };
}

// none example (StackBlitz)
async checkAuth() {
  return { ok: true };
}
```

`checkAuth()` MUST be side-effect free. It verifies credentials, not modifies state.

### 2.4 Resource Model

Resources are read-only typed data objects:

```typescript
interface IntegrationResource<T = unknown> {
  id: string;              // Unique identifier within type
  type: string;            // Resource type (e.g., 'builds', 'deployments')
  label: string;           // Human-readable label
  data: T;                 // Provider-specific payload
  metadata?: Record<string, unknown>;
}
```

The resource API follows a universal CRUD-read pattern:

| Method | Purpose | Side Effects |
|--------|---------|--------------|
| `listResources(type, query?, limit?)` | Paginated list of resources | None |
| `getResource(type, id)` | Single resource by ID | None |

Resources are provider-specific in their `type` strings:

| Provider | Resource Types |
|----------|---------------|
| EAS | `builds`, `updates` |
| Vercel | `deployments`, `projects`, `domains` |
| Docker Hub | `repositories`, `images`, `tags` |
| Ollama | `models`, `running` |
| GitHub Actions | `workflows`, `runs`, `jobs`, `artifacts` |
| Sentry | `issues`, `events`, `releases` |
| npm Registry | `packages`, `versions`, `vulnerabilities` |
| GitLab | `projects`, `pipelines`, `merge_requests`, `issues` |
| App Store Connect | `builds`, `beta_groups`, `testers`, `apps` |
| Kaggle | `datasets`, `notebooks`, `competitions` |
| W&B | `runs`, `experiments`, `artifacts`, `sweeps` |
| StackBlitz | `projects`, `templates` |

### 2.5 Action Contract

Actions are side-effectful operations with explicit safety metadata:

```typescript
interface IntegrationAction {
  id: string;                      // Unique within provider
  label: string;                   // Button label
  description: string;             // Tooltip text
  destructive: boolean;            // true = requires confirmation dialog
  requires?: EntityType[];         // Input entity types needed
  produces?: EntityType[];         // Output entity types generated
}
```

The `requires` and `produces` fields create a typed data flow graph. If an action requires `['build']`, the UI can verify a build entity exists in the entity store before enabling the action button. If an action produces `['release']`, downstream actions that require `['release']` become available.

#### Destructive Actions Across Providers

| Provider | Action | Destructive | Why |
|----------|--------|-------------|-----|
| EAS | `cancel_build` | YES | Kills in-progress build |
| Vercel | `rollback` | YES | Reverts production deployment |
| Docker Hub | `delete_tag` | YES | Removes published image tag |
| Ollama | `delete_model` | YES | Removes locally cached model |
| GitHub Actions | `cancel_run` | YES | Kills running CI workflow |
| W&B | `stop_run` | YES | Terminates running experiment |

Non-destructive actions (deploy, build, submit, log) execute freely. Destructive actions trigger a confirmation dialog via the safety model (Section 10).

### 2.6 Event Model

Each provider declares:

- **`emits`**: Events this provider can produce (output capabilities)
- **`subscribesTo`**: Events this provider reacts to (input triggers)

```typescript
// EAS example
emits: ['eas.build.started', 'eas.build.ready', 'eas.update.published'],
subscribesTo: ['commit.merged', 'commit.pushed'],

// Vercel example
emits: ['deploy.started', 'deploy.ready', 'deploy.failed'],
subscribesTo: ['commit.pushed', 'ci.workflow.completed'],
```

Events are strongly typed. The full `CapabilityEvents` interface defines 30+ event types with their payloads:

```typescript
interface CapabilityEvents {
  // Source control (4 events)
  'commit.pushed':    { repo: SharedEntities['repo']; commit: SharedEntities['commit'] };
  'commit.merged':    { repo: SharedEntities['repo']; commit: SharedEntities['commit']; targetBranch: string };
  'pr.opened':        { repo: SharedEntities['repo']; number: number; title: string };
  'pr.merged':        { repo: SharedEntities['repo']; number: number };

  // Build / CI (5 events)
  'build.started':    { build: SharedEntities['build']; trigger: string };
  'build.completed':  { build: SharedEntities['build']; duration: number };
  'build.failed':     { build: SharedEntities['build']; error: string };
  'ci.workflow.started':   { workflowId: string; repo: SharedEntities['repo'] };
  'ci.workflow.completed': { workflowId: string; success: boolean; duration: number };

  // Deploy (4 events)
  'deploy.started':   { environment: string; version: string };
  'deploy.ready':     { environment: string; url: string; version: string };
  'deploy.failed':    { environment: string; error: string };
  'deploy.rollback':  { environment: string; fromVersion: string; toVersion: string };

  // App Dev / Mobile (6 events)
  'eas.build.started':     { platform: 'ios' | 'android'; profile: string };
  'eas.build.ready':       { platform: 'ios' | 'android'; artifact: SharedEntities['artifact'] };
  'eas.update.published':  { channel: string; runtimeVersion: string };
  'testflight.submitted':  { buildNumber: string; version: string };
  'testflight.approved':   { buildNumber: string; group: string };
  'testflight.feedback':   { buildNumber: string; tester: string; message: string };

  // App Store Review (3 events)
  'appstore.review.started':  { version: string };
  'appstore.review.approved': { version: string };
  'appstore.review.rejected': { version: string; reason: string };

  // ML / Models (3 events)
  'model.benchmark.completed': { model: SharedEntities['model']; score: number; baseline: number };
  'model.deployed':    { model: SharedEntities['model']; endpoint: string };
  'model.downloaded':  { model: SharedEntities['model']; path: string };

  // Observability (3 events)
  'crash.spike':     { service: string; rate: number; build?: SharedEntities['build'] };
  'alert.fired':     { incident: SharedEntities['incident']; source: string };
  'alert.resolved':  { incidentId: string };

  // Registry (2 events)
  'package.published': { name: string; version: string; registry: string };
  'image.pushed':      { repository: string; tag: string; digest: string };

  // Preview (3 events)
  'preview.device.changed':       { device: SharedEntities['device'] };
  'preview.orientation.changed':  { orientation: 'portrait' | 'landscape' };
  'preview.url.changed':          { url: string };
}
```

### 2.7 SharedEntities

SharedEntities are typed data objects that flow between panels via the CapabilityBus entity store. They represent the universal vocabulary of the IDE:

```typescript
interface SharedEntities {
  repo:     { owner: string; name: string; branch: string; url: string };
  commit:   { sha: string; message: string; author: string; timestamp: number };
  build:    { id: string; status: 'queued' | 'building' | 'success' | 'failed';
              platform?: string; profile?: string; artifact?: string };
  artifact: { id: string; name: string; url: string; size?: number; type: string };
  release:  { version: string; channel: string; platform: string; buildId?: string };
  model:    { id: string; name: string; provider: string; version?: string };
  endpoint: { url: string; method: string; status?: number };
  incident: { id: string; severity: 'critical' | 'high' | 'medium' | 'low'; title: string };
  device:   { name: string; platform: 'ios' | 'android' | 'web';
              width: number; height: number; scale: number };
}
```

Entity types serve as the `requires`/`produces` annotations on actions. This creates compile-time verification that data flows make sense: an action requiring `['build']` cannot be triggered unless a build entity exists.

---

## 3. CapabilityBus Architecture

Source: `lib/ide/capability-bus.ts`

The CapabilityBus is the nervous system of the IDE. It is explicitly NOT the EventBus:

| | EventBus | CapabilityBus |
|---|---------|---------------|
| **Scope** | IDE internal events | Cross-integration events |
| **Examples** | `panel:opened`, `theme:changed` | `build.completed`, `deploy.ready` |
| **Typing** | Generic string events | Strongly typed `CapabilityEvents` |
| **Entity Store** | No | Yes |
| **Action Dispatch** | No | Yes |

### 3.1 Event Flow

```mermaid
sequenceDiagram
    participant GitHub as GitHub Panel
    participant Bus as CapabilityBus
    participant EAS as EAS Panel
    participant TF as TestFlight Panel

    GitHub->>Bus: emit('commit.merged', { repo, commit, targetBranch: 'main' })
    Bus->>Bus: Log event + timestamp
    Bus->>EAS: handler('commit.merged') fires
    EAS->>Bus: emit('eas.build.started', { platform: 'ios', profile: 'production' })
    Bus->>Bus: Log event + timestamp
    Note over EAS: Build completes...
    EAS->>Bus: emit('eas.build.ready', { platform: 'ios', artifact })
    Bus->>TF: handler('eas.build.ready') fires
    TF->>Bus: dispatchAction({ targetProvider: 'appstore-connect', actionId: 'submit_testflight' })
```

### 3.2 Subscription API

```typescript
// Typed subscription — handler receives correct payload type
const dispose = capBus.on('deploy.ready', (data) => {
  // data is typed as { environment: string; url: string; version: string }
  console.log(`Deployed v${data.version} to ${data.url}`);
});

// One-shot subscription — auto-disposes after first fire
capBus.once('build.completed', (data) => {
  showNotification(`Build finished in ${data.duration}ms`);
});

// Wildcard — catches ALL events (for debugging/timeline panel)
capBus.onAny((event, data) => {
  console.debug(`[CapBus] ${event}`, data);
});
```

Every subscription returns a `Disposable` with a `dispose()` method. This prevents memory leaks — panels dispose their subscriptions when unmounted.

### 3.3 Event Emission

```typescript
capBus.emit('build.completed', {
  build: { id: 'bld_123', status: 'success', platform: 'ios' },
  duration: 45000,
});
```

On emission, the bus:
1. Appends to the event log (capped at 100 entries, FIFO)
2. Fires all exact-match handlers (wrapped in try/catch — one handler crash does not kill others)
3. Fires all wildcard handlers (same error isolation)

The `disposed` flag prevents zombie emissions after bus teardown.

### 3.4 Action Dispatch (Request/Response)

Actions are the imperative counterpart to events. Where events say "this happened", actions say "do this".

```typescript
// Registration (done by provider panels)
capBus.registerAction('vercel', 'deploy', async (request) => {
  const result = await VercelProvider.executeAction('deploy', request.params);
  return {
    requestId: request.id,
    ok: result.ok,
    result: result.result,
    error: result.error,
    timestamp: Date.now(),
  };
});

// Dispatch (done by workflow engine or other panels)
const result = await capBus.dispatchAction({
  sourcePanel: 'ci-results',
  targetProvider: 'vercel',
  actionId: 'deploy',
  params: { projectId: 'prj_abc123' },
});
```

The key format is `${providerId}:${actionId}`. If no handler is registered, the dispatch returns `{ ok: false, error: 'No handler for action vercel:deploy' }`. This is safe failure — no exceptions, no hanging promises.

### 3.5 Entity Store

The entity store is a namespaced key-value store for shared state:

```typescript
// Set entity (source-attributed)
capBus.setEntity('build', 'current', buildData, 'eas');

// Get entity
const build = capBus.getEntity('build', 'current');

// List all entities of a type
const allBuilds = capBus.listEntities('build');
// Returns: [{ key: 'current', data: {...}, source: 'eas' }]
```

**Namespace format**: `${type}:${key}` (e.g., `build:current`, `repo:main`).

This means two providers can both store `build` entities without collision, as long as they use different keys. Source attribution (`source: 'eas'`) enables auditing which provider set which entity.

### 3.6 Event Log

The bus maintains a ring buffer of the last 100 events:

```typescript
const log = capBus.getEventLog();
// Returns: [{ event: 'commit.pushed', data: {...}, timestamp: 1707654321000 }, ...]
```

This powers the timeline panel, enabling users to see the full event history of their session. Events are stored with timestamps for chronological reconstruction.

### 3.7 Singleton Pattern

The CapabilityBus is a singleton:

```typescript
const bus = getCapabilityBus(); // Always returns the same instance
```

In development mode, the singleton auto-registers a wildcard handler that logs all events to the console with styled output. The `_resetCapabilityBus()` function exists for testing teardown.

---

## 4. Workflow Chains (Panel-to-Panel Integration)

Source: `lib/ide/panel-workflows.ts`

Workflows are declarative multi-panel layouts with event-driven connections between them.

### 4.1 Workflow Structure

```typescript
interface PanelWorkflow {
  id: string;
  name: string;
  description: string;
  icon: string;                    // Lucide icon
  category: WorkflowCategory;     // appdev | webdev | mlops | devops | fullstack | debug | custom
  panels: WorkflowPanel[];        // Which panels to open and where
  connections: WorkflowConnection[]; // Event chains between panels
  tags: string[];                  // For search/filter
}
```

### 4.2 Panel Positioning

```typescript
interface WorkflowPanel {
  panelId: string;
  position: 'left' | 'center' | 'right' | 'bottom';
  weight?: number; // 1-3, controls relative width
}
```

Weights control relative panel widths. A panel with `weight: 3` gets 3x the space of `weight: 1`. The `bottom` position is reserved for terminal/output panels.

### 4.3 Workflow Connections

Connections are the automation layer — they wire events to actions:

```typescript
interface WorkflowConnection {
  trigger: CapabilityEventType;         // Source event
  targetProvider: string;               // Which provider handles it
  targetAction: string;                 // Which action to execute
  paramMapping?: Record<string, string>; // Data flow between event and action
  autoExecute: boolean;                 // true = auto-fire, false = user confirms
  label: string;                        // Human-readable description
}
```

The `paramMapping` field maps event payload fields to action parameters using dot-notation paths:

```typescript
{
  trigger: 'commit.merged',
  targetProvider: 'eas',
  targetAction: 'start_build',
  paramMapping: { branch: 'commit.branch' },
  autoExecute: false,
  label: 'Merged to main -> Trigger EAS Build',
}
```

### 4.4 All 8 Built-in Workflow Presets

#### 1. App Dev Pipeline (`appdev-pipeline`)

**Category**: `appdev` | **Icon**: Smartphone

**Description**: Git -> EAS Build -> TestFlight -> Crash Reports

| Panel | Position | Weight |
|-------|----------|--------|
| git | left | 1 |
| eas-build | center | 2 |
| testflight | right | 1 |
| terminal | bottom | 1 |

**Connections**:
| Trigger | Target | Action | Auto | Label |
|---------|--------|--------|------|-------|
| `commit.merged` | eas | `start_build` | No | Merged to main -> Trigger EAS Build |
| `eas.build.ready` | appstore-connect | `submit_testflight` | No | Build ready -> Submit to TestFlight |

**Tags**: mobile, ios, android, expo, testflight

---

#### 2. Full Stack Dev (`webdev-fullstack`)

**Category**: `webdev` | **Icon**: Globe

**Description**: Editor + Terminal + Browser Preview + Docker

| Panel | Position | Weight |
|-------|----------|--------|
| editor | center | 3 |
| frontend-preview | right | 2 |
| terminal | bottom | 1 |
| docker | left | 1 |

**Connections**: None (manual workflow)

**Tags**: web, frontend, backend, docker

---

#### 3. Deploy Pipeline (`deploy-pipeline`)

**Category**: `devops` | **Icon**: Rocket

**Description**: Git -> CI/CD -> Deploy -> Observe

| Panel | Position | Weight |
|-------|----------|--------|
| git | left | 1 |
| github-actions | center | 1 |
| vercel-deploy | right | 1 |
| terminal | bottom | 1 |

**Connections**:
| Trigger | Target | Action | Auto | Label |
|---------|--------|--------|------|-------|
| `commit.pushed` | github-actions | `trigger_workflow` | No | Push -> Trigger CI workflow |
| `ci.workflow.completed` | vercel | `deploy` | No | CI passed -> Deploy to Vercel |

**Tags**: ci, cd, deploy, vercel, github-actions

---

#### 4. ML Experiment (`ml-experiment`)

**Category**: `mlops` | **Icon**: Brain

**Description**: HuggingFace -> Model Catalog -> Inference -> Benchmark

| Panel | Position | Weight |
|-------|----------|--------|
| extensions | left | 1 |
| models | center | 1 |
| terminal | bottom | 1 |

**Connections**:
| Trigger | Target | Action | Auto | Label |
|---------|--------|--------|------|-------|
| `model.benchmark.completed` | wandb | `log_metric` | Yes | Benchmark done -> Log to W&B |

**Tags**: ml, ai, huggingface, ollama, benchmark

---

#### 5. Frontend Preview (`frontend-preview`)

**Category**: `webdev` | **Icon**: Monitor

**Description**: Code + Device Preview + Responsive Testing

| Panel | Position | Weight |
|-------|----------|--------|
| editor | left | 2 |
| frontend-preview | center | 3 |
| terminal | bottom | 1 |

**Connections**: None

**Tags**: frontend, preview, responsive, ios, android

---

#### 6. Mobile Testing (`mobile-testing`)

**Category**: `appdev` | **Icon**: Tablet

**Description**: Device Preview + EAS + Crash Reports + Logs

| Panel | Position | Weight |
|-------|----------|--------|
| frontend-preview | left | 2 |
| eas-build | center | 1 |
| sentry | right | 1 |
| terminal | bottom | 1 |

**Connections**:
| Trigger | Target | Action | Auto | Label |
|---------|--------|--------|------|-------|
| `crash.spike` | sentry | `open_issue` | No | Crash spike -> Open Sentry issue |

**Tags**: mobile, testing, crash, sentry, eas

---

#### 7. Debug Mode (`debug-mode`)

**Category**: `debug` | **Icon**: Bug

**Description**: Editor + Debug + Terminal + Problems

| Panel | Position | Weight |
|-------|----------|--------|
| editor | center | 2 |
| debug | left | 1 |
| problems | right | 1 |
| terminal | bottom | 1 |

**Connections**: None

**Tags**: debug, breakpoints, errors

---

#### 8. Monitoring (`monitoring`)

**Category**: `devops` | **Icon**: Activity

**Description**: Health + Sentry + Docker + Logs

| Panel | Position | Weight |
|-------|----------|--------|
| health | left | 1 |
| sentry | center | 1 |
| docker | right | 1 |
| terminal | bottom | 1 |

**Connections**:
| Trigger | Target | Action | Auto | Label |
|---------|--------|--------|------|-------|
| `alert.fired` | sentry | `show_details` | Yes | Alert -> Show crash details |

**Tags**: monitoring, health, sentry, docker

---

### 4.5 Creating Custom Workflows

Custom workflows follow the same `PanelWorkflow` interface. To create one:

```typescript
const myWorkflow: PanelWorkflow = {
  id: 'my-custom-pipeline',
  name: 'Custom API Pipeline',
  description: 'API Development -> Test -> Deploy',
  icon: 'Workflow',
  category: 'custom',
  panels: [
    { panelId: 'editor', position: 'center', weight: 2 },
    { panelId: 'api-tester', position: 'right' },
    { panelId: 'vercel-deploy', position: 'right' },
    { panelId: 'terminal', position: 'bottom' },
  ],
  connections: [
    {
      trigger: 'ci.workflow.completed',
      targetProvider: 'vercel',
      targetAction: 'deploy',
      autoExecute: false,
      label: 'Tests passed -> Deploy API',
    },
  ],
  tags: ['api', 'rest', 'deploy'],
};
```

Custom workflows can be persisted in user settings and loaded alongside built-in presets.

### 4.6 Workflow Helpers

```typescript
getWorkflow('deploy-pipeline');              // Find by ID
getWorkflowsByCategory('devops');            // Filter by category
searchWorkflows('mobile');                   // Full-text search across name, description, tags
```

---

## 5. Suggested Panel Groups

### 5.1 By Development Scenario

#### Mobile App Development
| Group | Panels | Why |
|-------|--------|-----|
| Build & Ship | git + eas-build + testflight + terminal | Complete mobile CI/CD |
| Test & Monitor | frontend-preview + eas-build + sentry + terminal | Build, preview, catch crashes |
| Design Review | frontend-preview + editor + terminal | Code with live device preview |

#### Web Development
| Group | Panels | Why |
|-------|--------|-----|
| Full Stack | editor + frontend-preview + docker + terminal | Code, preview, containers |
| Deploy & Observe | git + github-actions + vercel-deploy + terminal | CI/CD pipeline |
| Frontend Focus | editor + frontend-preview + terminal | Responsive design work |

#### ML/AI Workflows
| Group | Panels | Why |
|-------|--------|-----|
| Experiment | extensions + models + terminal | Browse models, run inference |
| Train & Track | editor + experiment-tracker + terminal | Code + W&B metrics |
| Data & Compute | kaggle-datasets + ollama-models + terminal | Download data, run local models |

#### DevOps / SRE
| Group | Panels | Why |
|-------|--------|-----|
| Incident Response | health + sentry + docker + terminal | Triage production issues |
| Deploy Pipeline | git + github-actions + vercel-deploy + terminal | Full CI/CD visibility |
| Container Ops | docker-images + docker-builds + terminal | Image management |

### 5.2 Event Chain Compatibility

When choosing panel groups, consider which panels produce events that other panels consume:

```
commit.pushed ──> GitHub Actions (trigger_workflow)
                  Vercel (deploy)
                  EAS (start_build)

build.completed ──> Docker Hub (push_image)

eas.build.ready ──> App Store Connect (submit_testflight)
                    Sentry (watch for crashes)

ci.workflow.completed ──> Vercel (deploy)

deploy.ready ──> Sentry (monitor for crashes)

crash.spike ──> Sentry (open_issue)

alert.fired ──> Sentry (show_details)

model.benchmark.completed ──> W&B (log_metric)
```

Panels that produce events consumed by other panels in the same group create powerful automated chains.

---

## 6. Smart Recognizer

The Smart Recognizer analyzes project structure to suggest relevant integrations. Based on detected files and dependencies, it recommends providers and workflows.

### 6.1 Detection Rules

| Detection Signal | Suggested Providers | Suggested Workflow |
|-----------------|--------------------|--------------------|
| `package.json` has `"expo"` | EAS, App Store Connect | App Dev Pipeline |
| `package.json` has `"react-native"` | EAS, App Store Connect | Mobile Testing |
| `package.json` has `"next"` | Vercel | Full Stack Dev |
| `Dockerfile` exists | Docker Hub | Deploy Pipeline |
| `docker-compose.yml` exists | Docker Hub | Monitoring |
| `.github/workflows/` exists | GitHub Actions | Deploy Pipeline |
| `vercel.json` exists | Vercel | Deploy Pipeline |
| `.gitlab-ci.yml` exists | GitLab | Deploy Pipeline |
| `requirements.txt` has `wandb` | W&B | ML Experiment |
| `requirements.txt` has `kaggle` | Kaggle | ML Experiment |
| `package.json` has `"@sentry/*"` | Sentry | Monitoring |
| `.sentryclirc` exists | Sentry | Monitoring |
| `Modelfile` or `Ollama` references | Ollama | ML Experiment |
| `.npmrc` exists | npm Registry | Full Stack Dev |

### 6.2 Framework-Specific Recommendations

```typescript
// Pseudo-code for Smart Recognizer
function detectProjectType(projectFiles: string[], packageJson?: PackageJson): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Mobile (Expo/RN)
  if (packageJson?.dependencies?.['expo']) {
    recommendations.push(
      { provider: 'eas', priority: 'high', reason: 'Expo project detected' },
      { provider: 'appstore-connect', priority: 'medium', reason: 'iOS distribution' },
      { provider: 'sentry', priority: 'medium', reason: 'Crash reporting for mobile' },
    );
  }

  // Next.js
  if (packageJson?.dependencies?.['next']) {
    recommendations.push(
      { provider: 'vercel', priority: 'high', reason: 'Next.js deployment' },
      { provider: 'sentry', priority: 'medium', reason: 'Error tracking' },
    );
  }

  // Docker
  if (projectFiles.includes('Dockerfile')) {
    recommendations.push(
      { provider: 'docker-hub', priority: 'high', reason: 'Container registry' },
    );
  }

  // CI/CD
  if (projectFiles.some(f => f.startsWith('.github/workflows/'))) {
    recommendations.push(
      { provider: 'github-actions', priority: 'high', reason: 'CI/CD workflows detected' },
    );
  }

  // ML
  if (packageJson?.dependencies?.['wandb'] || projectFiles.includes('wandb/')) {
    recommendations.push(
      { provider: 'wandb', priority: 'high', reason: 'W&B experiment tracking' },
      { provider: 'kaggle', priority: 'low', reason: 'Dataset browsing' },
    );
  }

  return recommendations;
}
```

### 6.3 Onboarding Flow

When a user opens a project for the first time:

1. Smart Recognizer scans project files and `package.json`
2. Generates ranked provider recommendations
3. Displays a non-blocking suggestion panel: "We detected an Expo project. Enable EAS + TestFlight?"
4. User selects integrations to activate
5. Selected providers are registered via `registerProvider()`
6. Matching workflow preset is suggested

---

## 7. Provider Implementation Guide

### 7.1 Step-by-Step: Adding a New Provider

**Step 1**: Create the provider file.

```
lib/ide/providers/{your-provider}-provider.ts
```

**Step 2**: Implement the `IntegrationProvider` interface.

Use this skeleton:

```typescript
// =============================================================================
// {your-provider}-provider.ts — {Service Name} Integration
//
// {One-line description of what this provider does.}
// =============================================================================

import type { IntegrationProvider, CapabilityEventType } from '../integration-manifest';

const BASE_URL = 'https://api.example.com/v1';

export const YourProvider: IntegrationProvider = {
  // -- Identity --
  id: 'your-provider',
  name: 'Your Service',
  icon: 'IconName',          // Lucide icon name
  category: 'deploy',        // Pick from IntegrationCategory
  description: 'One-line description.',

  // -- Auth --
  auth: { type: 'api_key', envKey: 'YOUR_TOKEN' },

  async checkAuth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${BASE_URL}/verify`, {
        headers: { Authorization: `Bearer ${process.env.YOUR_TOKEN ?? ''}` },
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  // -- Panels --
  panels: ['your-panel-id'],

  // -- Resources --
  async listResources(type, _query?, _limit?) {
    switch (type) {
      case 'items':
        return []; // Replace with actual API call
      default:
        return [];
    }
  },

  async getResource(type, id) {
    switch (type) {
      case 'items':
        return { id, type: 'items', label: `Item ${id}`, data: {} };
      default:
        return null;
    }
  },

  // -- Actions --
  actions: [
    {
      id: 'do_thing',
      label: 'Do Thing',
      description: 'Performs the thing.',
      destructive: false,
      produces: ['artifact'],
    },
  ],

  async executeAction(actionId, params) {
    switch (actionId) {
      case 'do_thing':
        return { ok: true, result: { done: true } };
      default:
        return { ok: false, error: `Unknown action: ${actionId}` };
    }
  },

  // -- Events --
  emits: [] satisfies CapabilityEventType[],
  subscribesTo: [] satisfies CapabilityEventType[],
};
```

**Step 3**: Register in `providers/index.ts`.

Add two lines:

```typescript
// In the named exports section:
export { YourProvider } from './your-provider';

// In the imports for ALL_PROVIDERS:
import { YourProvider } from './your-provider';

// In the ALL_PROVIDERS array:
export const ALL_PROVIDERS: IntegrationProvider[] = [
  // ... existing providers ...
  YourProvider,
];
```

**Step 4**: If you need new event types, add them to `CapabilityEvents` in `integration-manifest.ts`. This is the ONLY file outside your provider that changes. All existing providers remain untouched.

### 7.2 Testing Checklist

Before merging a new provider:

- [ ] **Compiles**: `tsc --noEmit` passes (IntegrationProvider contract satisfied)
- [ ] **checkAuth()** returns `{ ok: true }` when credentials are valid
- [ ] **checkAuth()** returns `{ ok: false, error: '...' }` when credentials are invalid/missing
- [ ] **listResources()** returns `[]` for unknown types (not throws)
- [ ] **getResource()** returns `null` for unknown types (not throws)
- [ ] **executeAction()** returns `{ ok: false, error: '...' }` for unknown action IDs (not throws)
- [ ] **Destructive actions** have `destructive: true` flag set
- [ ] **emits** array contains only valid `CapabilityEventType` values
- [ ] **subscribesTo** array contains only valid `CapabilityEventType` values
- [ ] **id** is unique across all providers in `ALL_PROVIDERS`
- [ ] **category** is a valid `IntegrationCategory`
- [ ] **icon** is a valid Lucide icon name
- [ ] Provider added to both named exports AND `ALL_PROVIDERS` in `index.ts`

### 7.3 Common Patterns

**Pattern: API endpoint mapping for resources**

```typescript
async listResources(type, query, limit = 20) {
  const endpoints: Record<string, string> = {
    deployments: '/v6/deployments',
    projects: '/v9/projects',
    domains: '/v5/domains',
  };
  const path = endpoints[type];
  if (!path) return [];
  // Fetch from path...
}
```

**Pattern: Using `satisfies` for event type safety**

```typescript
emits: [
  'deploy.started',
  'deploy.ready',
  'deploy.failed',
] satisfies CapabilityEventType[],
```

The `satisfies` keyword ensures every string in the array is a valid `CapabilityEventType` at compile time. A typo like `'deploy.redy'` will fail compilation.

---

## 8. Invariance Guarantees

These are the mathematical invariants of the system. If any of these are violated, it is a bug.

### 8.1 Provider Independence

**Invariant**: Adding provider X does NOT modify provider Y.

**Proof**: Providers are independent const objects. They share no mutable state. The only shared dependency is the `IntegrationProvider` type, which is read-only. Each provider is a separate file with zero imports from other providers.

```
providers/
  eas-provider.ts          # imports only from ../integration-manifest
  vercel-provider.ts       # imports only from ../integration-manifest
  sentry-provider.ts       # imports only from ../integration-manifest
  ...
```

No provider imports another provider. The import graph is a flat star with `integration-manifest.ts` at the center.

### 8.2 Subscription Opt-In

**Invariant**: CapabilityBus subscriptions are opt-in. No provider is forced to handle any event.

**Proof**: `subscribesTo: []` is valid and used by multiple providers (StackBlitz, npm Registry, Kaggle). The bus does not enforce that emitted events have subscribers. An event with zero subscribers simply logs and continues.

### 8.3 Entity Store Namespacing

**Invariant**: Entity store entries are namespaced as `${type}:${key}`. Two providers using different keys for the same type cannot collide.

**Proof**: The `setEntity` method computes the key as `\`${type}:${key}\``. The `getEntity` method performs an exact match on this composite key. Different keys produce different store entries.

### 8.4 Declarative Workflow Connections

**Invariant**: Workflow connections are pure data declarations. They contain no executable code, no imports, no provider references beyond string IDs.

**Proof**: `WorkflowConnection` is a plain interface with only primitive fields (`string`, `boolean`, `Record<string, string>`). The workflow engine interprets these declarations at runtime; they carry no behavior.

### 8.5 Provider Lifecycle Independence

**Invariant**: Each provider's lifecycle (`initialize`/`dispose`) is independent. Initializing provider A does not affect provider B. Disposing provider A does not affect provider B.

**Proof**: `registerProvider()` calls `provider.initialize?.()` only on the registered provider. `unregisterProvider()` calls `provider.dispose?.()` only on the target provider. The provider map uses `id` as the key, and each entry is independent.

### 8.6 Error Isolation

**Invariant**: A handler crash in the CapabilityBus does not prevent other handlers from firing.

**Proof**: The `emit` method iterates handlers in a `for...of` loop with individual `try/catch` blocks:

```typescript
for (const handler of Array.from(set)) {
  try {
    (handler as CapHandler<K>)(data);
  } catch (err) {
    console.error(`[CapBus] Handler error for "${event}":`, err);
  }
}
```

A thrown exception in handler 1 is caught and logged. Handler 2 still fires.

---

## 9. MCP Compatibility Layer (Future)

The `IntegrationProvider` interface maps cleanly to the Model Context Protocol (MCP) schema, enabling future bidirectional bridging.

### 9.1 Mapping Table

| IntegrationProvider | MCP Concept | Direction |
|--------------------|-------------|-----------|
| `listResources()` | MCP Resources | Provider -> MCP Server |
| `getResource()` | MCP Resource (single) | Provider -> MCP Server |
| `executeAction()` | MCP Tools | Provider -> MCP Server |
| `emits` events | MCP Notifications | Provider -> MCP Client |
| `subscribesTo` events | MCP Notification Handlers | MCP Client -> Provider |

### 9.2 Resources -> MCP Resources

```typescript
// IntegrationProvider
listResources('deployments', 'production', 10)
// Returns: IntegrationResource[]

// MCP equivalent
{
  uri: 'vercel://deployments?query=production&limit=10',
  mimeType: 'application/json',
  name: 'Vercel Deployments',
}
```

Each `IntegrationResource` maps to an MCP resource URI with the pattern:
`${providerId}://${resourceType}/${resourceId}`

### 9.3 Actions -> MCP Tools

```typescript
// IntegrationAction
{
  id: 'deploy',
  label: 'Deploy',
  description: 'Trigger a new deployment.',
  destructive: false,
  requires: ['repo'],
  produces: ['build'],
}

// MCP Tool equivalent
{
  name: 'vercel_deploy',
  description: 'Trigger a new deployment.',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Vercel project ID' },
    },
    required: ['projectId'],
  },
}
```

The `requires` array maps to `inputSchema.required`, and `produces` maps to the tool's output schema.

### 9.4 Events -> MCP Notifications

```typescript
// CapabilityEvent emission
capBus.emit('deploy.ready', { environment: 'production', url: '...', version: '1.0.0' });

// MCP Notification equivalent
{
  method: 'notifications/deploy.ready',
  params: { environment: 'production', url: '...', version: '1.0.0' },
}
```

### 9.5 Bridge Pattern

The bridge translates between protocols without modifying either side:

```
  IntegrationProvider          MCP Bridge             MCP Client
  ==================         ===========             ===========
  listResources()  -------->  resources/list  ------> AI Agent
  executeAction()  -------->  tools/call      ------> AI Agent
  emit(event)      -------->  notification    ------> AI Agent
  subscribesTo     <--------  notification    <------ AI Agent
```

The bridge is stateless — it translates calls, not stores state. Provider lifecycle remains managed by the Integration Registry, not the MCP bridge.

---

## 10. Safety & Consent Model

### 10.1 Destructive Action Confirmation

Every `IntegrationAction` carries a `destructive: boolean` flag. The UI layer MUST enforce:

```
if (action.destructive) {
  const confirmed = await showConfirmDialog(
    `${action.label}: ${action.description}. This action cannot be undone. Continue?`
  );
  if (!confirmed) return;
}
await provider.executeAction(action.id, params);
```

Currently destructive actions across all 12 providers:

| Provider | Action | Risk |
|----------|--------|------|
| EAS | cancel_build | Kills queued/in-progress build |
| Vercel | rollback | Reverts production to prior version |
| Docker Hub | delete_tag | Removes published image tag permanently |
| Ollama | delete_model | Deletes locally cached model |
| GitHub Actions | cancel_run | Kills running CI workflow |
| W&B | stop_run | Terminates running experiment |

### 10.2 Workflow Connection Consent

Workflow connections have an `autoExecute` flag:

| autoExecute | Behavior |
|-------------|----------|
| `false` | User sees a toast notification: "CI passed. Deploy to Vercel?" with Accept/Dismiss buttons |
| `true` | Action fires immediately without user interaction |

**Default is `false`** for most connections. The only `autoExecute: true` connections in built-in presets are:
- ML Experiment: benchmark completed -> log to W&B (non-destructive logging)
- Monitoring: alert fired -> show Sentry details (non-destructive UI navigation)

**Rule**: `autoExecute: true` MUST NEVER be combined with `destructive: true` actions.

### 10.3 Auth Check Before Execution

The `checkProviderStatus()` function verifies auth before any action:

```typescript
async function checkProviderStatus(id: string): Promise<ProviderStatus> {
  const provider = _providers.get(id);
  if (!provider) return 'disconnected';
  if (provider.auth.type === 'none') return 'connected';

  try {
    const result = await provider.checkAuth();
    return result.ok ? 'connected' : 'error';
  } catch {
    return 'error';
  }
}
```

Provider status values:

| Status | Meaning | UI Indicator |
|--------|---------|-------------|
| `connected` | Auth valid, provider functional | Green dot |
| `disconnected` | Provider not registered | Grey dot |
| `error` | Auth check failed or threw | Red dot |
| `unconfigured` | Auth type requires setup | Yellow dot |

### 10.4 Error Boundaries

The CapabilityBus wraps every handler invocation in `try/catch`. A crash in one handler does not cascade to others. The `dispatchAction()` method similarly catches errors and returns structured error results:

```typescript
try {
  return await handler(fullRequest);
} catch (err) {
  return {
    requestId: fullRequest.id,
    ok: false,
    error: err instanceof Error ? err.message : 'Action failed',
    timestamp: Date.now(),
  };
}
```

No unhandled promise rejections. No silent failures. Every error path produces a typed result.

### 10.5 Audit Trail

The CapabilityBus event log (100-entry ring buffer) serves as an audit trail. Every event emission is timestamped and recorded, enabling post-incident reconstruction of what happened and in what order.

---

## 11. Eval-First Engineering

### 11.1 Connection Verification

Every provider implements `checkAuth()` as the first eval gate. Before any resource listing or action execution, the provider can verify its connection:

```typescript
const status = await checkProviderStatus('vercel');
if (status !== 'connected') {
  showError(`Vercel is ${status}. Configure VERCEL_TOKEN to proceed.`);
  return;
}
```

### 11.2 Side-Effect-Free Resource Queries

Resource operations (`listResources`, `getResource`) are read-only. They query external APIs but do not modify state. This means resources can be queried freely for display, search, and validation without risk.

### 11.3 Typed Action Results

Every action returns a typed result:

```typescript
{ ok: true, result: { deploymentId: 'dpl_abc123' } }
// or
{ ok: false, error: 'projectId is required' }
```

No exceptions leak to callers. No `undefined` returns. The `ok` boolean discriminates success from failure unambiguously.

### 11.4 Provider Status Matrix

All 12 providers across 4 possible states:

| Provider | Auth Type | Status When Token Missing | Status When Token Valid | Status When Service Down |
|----------|-----------|--------------------------|----------------------|------------------------|
| EAS | api_key | error | connected | error |
| App Store Connect | jwt | error | connected | error |
| Docker Hub | api_key | error | connected | error |
| Ollama | local_socket | error | connected | error |
| Vercel | api_key | error | connected | error |
| npm Registry | api_key | error | connected | error |
| Sentry | api_key | error | connected | error |
| GitHub Actions | api_key | error | connected | error |
| StackBlitz | none | connected | connected | connected |
| Kaggle | api_key | error | connected | error |
| W&B | api_key | error | connected | error |
| GitLab | api_key | error | connected | error |

StackBlitz is the only provider that is always `connected` (auth type `none`).

### 11.5 Integration Health Dashboard

A recommended eval-first panel displays:

```
Integration Status
==================
  EAS                  [connected]    3 builds, 2 updates
  App Store Connect    [error]        JWT key not configured
  Docker Hub           [connected]    12 images
  Ollama               [connected]    4 models loaded
  Vercel               [connected]    8 deployments
  npm Registry         [unconfigured] NPM_TOKEN not set
  Sentry               [connected]    2 active alerts
  GitHub Actions       [connected]    5 workflows
  StackBlitz           [connected]    No auth required
  Kaggle               [unconfigured] KAGGLE_KEY not set
  W&B                  [unconfigured] WANDB_API_KEY not set
  GitLab               [disconnected] Not registered
```

This dashboard queries `checkProviderStatus()` for all registered providers and displays resource counts from `listResources()` where connected.

---

## Appendix A: Provider Quick Reference

| # | ID | Name | Category | Auth | Env Key | Panels | Emits | Subscribes |
|---|-----|------|----------|------|---------|--------|-------|------------|
| 1 | `eas` | Expo Application Services | appdev | api_key | `EXPO_TOKEN` | eas-build, eas-update | eas.build.started, eas.build.ready, eas.update.published | commit.merged, commit.pushed |
| 2 | `appstore-connect` | App Store Connect | appdev | jwt | .p8 key | testflight, appstore-review, certificates | testflight.submitted/approved/feedback, appstore.review.* | eas.build.ready |
| 3 | `docker-hub` | Docker Hub | registry | api_key | `DOCKER_TOKEN` | docker-images, docker-builds | image.pushed | build.completed |
| 4 | `ollama` | Ollama | compute | local_socket | localhost:11434 | ollama-models, ollama-chat | model.downloaded, model.deployed | model.benchmark.completed |
| 5 | `vercel` | Vercel | deploy | api_key | `VERCEL_TOKEN` | vercel-deploy, vercel-logs | deploy.started/ready/failed | commit.pushed, ci.workflow.completed |
| 6 | `npm-registry` | npm Registry | registry | api_key | `NPM_TOKEN` | package-browser, deps-audit | package.published | (none) |
| 7 | `sentry` | Sentry | observability | api_key | `SENTRY_AUTH_TOKEN` | sentry-crashes, sentry-performance | crash.spike, alert.fired/resolved | deploy.ready, eas.build.ready |
| 8 | `github-actions` | GitHub Actions | ci | api_key | `GITHUB_TOKEN` | github-actions | ci.workflow.started/completed, build.completed | commit.pushed, pr.opened |
| 9 | `stackblitz` | StackBlitz | compute | none | (none) | live-sandbox | (none) | (none) |
| 10 | `kaggle` | Kaggle | ml | api_key | `KAGGLE_KEY` | kaggle-datasets, kaggle-notebooks | (none) | (none) |
| 11 | `wandb` | Weights & Biases | ml | api_key | `WANDB_API_KEY` | experiment-tracker, metrics-dashboard | model.benchmark.completed | model.deployed |
| 12 | `gitlab` | GitLab | vcs | api_key | `GITLAB_TOKEN` | gitlab-repos, gitlab-ci | commit.pushed, pr.opened/merged, ci.workflow.* | (none) |

## Appendix B: Event Flow Diagram

```mermaid
graph LR
    subgraph Source Control
        CP[commit.pushed]
        CM[commit.merged]
        PO[pr.opened]
        PM[pr.merged]
    end

    subgraph CI/CD
        CWS[ci.workflow.started]
        CWC[ci.workflow.completed]
        BC[build.completed]
    end

    subgraph App Dev
        EBS[eas.build.started]
        EBR[eas.build.ready]
        EUP[eas.update.published]
        TFS[testflight.submitted]
        TFA[testflight.approved]
    end

    subgraph Deploy
        DS[deploy.started]
        DR[deploy.ready]
        DF[deploy.failed]
    end

    subgraph Observability
        CS[crash.spike]
        AF[alert.fired]
        AR[alert.resolved]
    end

    subgraph Registry
        PP[package.published]
        IP[image.pushed]
    end

    CP --> CWS
    CP --> DS
    CM --> EBS
    CWC --> DR
    BC --> IP
    EBR --> TFS
    DR --> CS
    AF --> AR
```

## Appendix C: Source File Map

| File | Purpose | Line Count |
|------|---------|------------|
| `lib/ide/integration-manifest.ts` | Provider contract, events, entities, registry | 254 |
| `lib/ide/capability-bus.ts` | Cross-panel event bus, actions, entity store | 287 |
| `lib/ide/panel-workflows.ts` | 8 workflow presets, search helpers | 277 |
| `lib/ide/providers/index.ts` | Re-exports, ALL_PROVIDERS array | 68 |
| `lib/ide/providers/eas-provider.ts` | EAS Build & Update | 118 |
| `lib/ide/providers/appstore-connect-provider.ts` | TestFlight, App Store | 126 |
| `lib/ide/providers/docker-hub-provider.ts` | Container registry | 122 |
| `lib/ide/providers/ollama-provider.ts` | Local LLM management | 186 |
| `lib/ide/providers/vercel-provider.ts` | Vercel deployment | 91 |
| `lib/ide/providers/npm-registry-provider.ts` | npm package registry | 91 |
| `lib/ide/providers/sentry-provider.ts` | Crash reporting & alerts | 91 |
| `lib/ide/providers/github-actions-provider.ts` | CI/CD workflows | 92 |
| `lib/ide/providers/stackblitz-provider.ts` | Live code sandbox | 89 |
| `lib/ide/providers/kaggle-provider.ts` | Datasets & notebooks | 103 |
| `lib/ide/providers/wandb-provider.ts` | Experiment tracking | 125 |
| `lib/ide/providers/gitlab-provider.ts` | VCS & CI pipelines | 128 |
