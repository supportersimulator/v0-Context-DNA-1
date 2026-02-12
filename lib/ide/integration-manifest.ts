// =============================================================================
// integration-manifest.ts — Universal Integration Provider System
//
// Every external integration (Docker Hub, Ollama, Vercel, EAS, TestFlight,
// npm, Sentry, GitHub Actions, StackBlitz, Kaggle, W&B, GitLab, etc.)
// implements IntegrationProvider. This is the typed contract that makes
// adding new integrations a matter of filling out an interface — no rewiring.
//
// Four pillars per integration:
//   1. Auth    (OAuth / API key / local socket)
//   2. Resources (list / get / search)
//   3. Actions (safe, auditable commands)
//   4. Events  (poll / webhook → CapabilityBus)
// =============================================================================

import type { Disposable } from './event-bus';

// ---------------------------------------------------------------------------
// Integration Categories
// ---------------------------------------------------------------------------

export type IntegrationCategory =
  | 'registry'     // Docker Hub, npm, PyPI, GHCR
  | 'compute'      // Ollama, StackBlitz, CodeSandbox
  | 'deploy'       // Vercel, Fly.io, AWS
  | 'appdev'       // EAS, App Store Connect, TestFlight, Xcode Cloud
  | 'ml'           // HuggingFace, Kaggle, W&B, MLflow
  | 'ci'           // GitHub Actions, CircleCI, Buildkite
  | 'observability' // Sentry, Datadog, Grafana
  | 'project'      // Linear, Jira, PagerDuty
  | 'vcs'          // GitHub, GitLab, Bitbucket
  | 'testing'      // API Tester, Cypress, Playwright
  | 'preview';     // Frontend Preview, Browser DevTools

// ---------------------------------------------------------------------------
// Auth Strategies
// ---------------------------------------------------------------------------

export type AuthStrategy =
  | { type: 'api_key'; envKey: string; headerName?: string }
  | { type: 'oauth'; provider: string; scopes: string[] }
  | { type: 'jwt'; issuer: string; keyFile?: string }
  | { type: 'local_socket'; socketPath: string }
  | { type: 'none' };

// ---------------------------------------------------------------------------
// Shared Entities — typed data that flows between panels
// ---------------------------------------------------------------------------

export interface SharedEntities {
  repo:     { owner: string; name: string; branch: string; url: string };
  commit:   { sha: string; message: string; author: string; timestamp: number };
  build:    { id: string; status: 'queued' | 'building' | 'success' | 'failed'; platform?: string; profile?: string; artifact?: string };
  artifact: { id: string; name: string; url: string; size?: number; type: string };
  release:  { version: string; channel: string; platform: string; buildId?: string };
  model:    { id: string; name: string; provider: string; version?: string };
  endpoint: { url: string; method: string; status?: number };
  incident: { id: string; severity: 'critical' | 'high' | 'medium' | 'low'; title: string };
  device:   { name: string; platform: 'ios' | 'android' | 'web'; width: number; height: number; scale: number };
}

export type EntityType = keyof SharedEntities;
export type Entity<T extends EntityType> = SharedEntities[T];

// ---------------------------------------------------------------------------
// Capability Events — typed cross-panel events
// ---------------------------------------------------------------------------

export interface CapabilityEvents {
  // Source control
  'commit.pushed':       { repo: SharedEntities['repo']; commit: SharedEntities['commit'] };
  'commit.merged':       { repo: SharedEntities['repo']; commit: SharedEntities['commit']; targetBranch: string };
  'pr.opened':           { repo: SharedEntities['repo']; number: number; title: string };
  'pr.merged':           { repo: SharedEntities['repo']; number: number };

  // Build / CI
  'build.started':       { build: SharedEntities['build']; trigger: string };
  'build.completed':     { build: SharedEntities['build']; duration: number };
  'build.failed':        { build: SharedEntities['build']; error: string };
  'ci.workflow.started': { workflowId: string; repo: SharedEntities['repo'] };
  'ci.workflow.completed': { workflowId: string; success: boolean; duration: number };

  // Deploy
  'deploy.started':      { environment: string; version: string };
  'deploy.ready':        { environment: string; url: string; version: string };
  'deploy.failed':       { environment: string; error: string };
  'deploy.rollback':     { environment: string; fromVersion: string; toVersion: string };

  // App Dev / Mobile
  'eas.build.started':   { platform: 'ios' | 'android'; profile: string };
  'eas.build.ready':     { platform: 'ios' | 'android'; artifact: SharedEntities['artifact'] };
  'eas.update.published': { channel: string; runtimeVersion: string };
  'testflight.submitted': { buildNumber: string; version: string };
  'testflight.approved':  { buildNumber: string; group: string };
  'testflight.feedback':  { buildNumber: string; tester: string; message: string };
  'appstore.review.started': { version: string };
  'appstore.review.approved': { version: string };
  'appstore.review.rejected': { version: string; reason: string };

  // ML / Models
  'model.benchmark.completed': { model: SharedEntities['model']; score: number; baseline: number };
  'model.deployed':      { model: SharedEntities['model']; endpoint: string };
  'model.downloaded':    { model: SharedEntities['model']; path: string };

  // Observability
  'crash.spike':         { service: string; rate: number; build?: SharedEntities['build'] };
  'alert.fired':         { incident: SharedEntities['incident']; source: string };
  'alert.resolved':      { incidentId: string };

  // Registry
  'package.published':   { name: string; version: string; registry: string };
  'image.pushed':        { repository: string; tag: string; digest: string };

  // Preview
  'preview.device.changed': { device: SharedEntities['device'] };
  'preview.orientation.changed': { orientation: 'portrait' | 'landscape' };
  'preview.url.changed': { url: string };
}

export type CapabilityEventType = keyof CapabilityEvents;

// ---------------------------------------------------------------------------
// Integration Resource
// ---------------------------------------------------------------------------

export interface IntegrationResource<T = unknown> {
  id: string;
  type: string;
  label: string;
  data: T;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Integration Action
// ---------------------------------------------------------------------------

export interface IntegrationAction {
  id: string;
  label: string;
  description: string;
  /** Whether this action is destructive (requires confirmation) */
  destructive: boolean;
  /** Required entity types as input */
  requires?: EntityType[];
  /** Entity types produced as output */
  produces?: EntityType[];
}

// ---------------------------------------------------------------------------
// Integration Provider — THE CONTRACT
// ---------------------------------------------------------------------------

export interface IntegrationProvider {
  // -- Identity --
  id: string;
  name: string;
  icon: string;           // Lucide icon name
  category: IntegrationCategory;
  description: string;

  // -- Auth --
  auth: AuthStrategy;
  /** Check if credentials are configured and valid */
  checkAuth(): Promise<{ ok: boolean; error?: string }>;

  // -- Panels this integration contributes --
  panels: string[];

  // -- Resources --
  /** List resources (paginated) */
  listResources(type: string, query?: string, limit?: number): Promise<IntegrationResource[]>;
  /** Get a single resource by ID */
  getResource(type: string, id: string): Promise<IntegrationResource | null>;

  // -- Actions --
  /** Available actions for this integration */
  actions: IntegrationAction[];
  /** Execute an action */
  executeAction(actionId: string, params: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }>;

  // -- Events --
  /** Events this integration can emit */
  emits: CapabilityEventType[];
  /** Events this integration subscribes to (for cross-panel triggers) */
  subscribesTo: CapabilityEventType[];
  /** Start polling/listening for events */
  startEventSource?(): Disposable;

  // -- Lifecycle --
  /** Initialize the provider (called once on registration) */
  initialize?(): Promise<void>;
  /** Tear down (called on deregistration) */
  dispose?(): void;
}

// ---------------------------------------------------------------------------
// Integration Registry — manages all providers
// ---------------------------------------------------------------------------

const _providers = new Map<string, IntegrationProvider>();
const _listeners = new Set<() => void>();

export function registerProvider(provider: IntegrationProvider): void {
  _providers.set(provider.id, provider);
  provider.initialize?.();
  _listeners.forEach((fn) => fn());
}

export function unregisterProvider(id: string): void {
  const provider = _providers.get(id);
  if (provider) {
    provider.dispose?.();
    _providers.delete(id);
    _listeners.forEach((fn) => fn());
  }
}

export function getProvider(id: string): IntegrationProvider | undefined {
  return _providers.get(id);
}

export function getAllProviders(): IntegrationProvider[] {
  return Array.from(_providers.values());
}

export function getProvidersByCategory(category: IntegrationCategory): IntegrationProvider[] {
  return getAllProviders().filter((p) => p.category === category);
}

export function onProvidersChanged(fn: () => void): Disposable {
  _listeners.add(fn);
  return { dispose: () => _listeners.delete(fn) };
}

// ---------------------------------------------------------------------------
// Provider Status
// ---------------------------------------------------------------------------

export type ProviderStatus = 'connected' | 'disconnected' | 'error' | 'unconfigured';

export async function checkProviderStatus(id: string): Promise<ProviderStatus> {
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
