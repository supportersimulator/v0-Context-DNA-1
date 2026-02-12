// =============================================================================
// repo-sandbox.ts — GitHub Repo Sandbox Manager
//
// Foundation for testing any GitHub repo from the Extensions panel.
// Three-tier capability:
//   Tier 1: ANALYZE — Clone repo, detect stack, report dependencies
//   Tier 2: EXECUTE — Run tests/build in sandbox (Terminal API or Docker)
//   Tier 3: LOAD AS PANEL — If contextdna-panel.json found, mount via iframe
// =============================================================================

import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoSandbox {
  id: string;
  repoUrl: string;
  branch: string;
  status: 'cloning' | 'analyzing' | 'building' | 'ready' | 'error';
  analysis?: RepoAnalysis;
  /** Docker container ID (Electron only) */
  containerId?: string;
  error?: string;
  createdAt: number;
}

export interface RepoAnalysis {
  /** Primary language (e.g. 'typescript', 'python', 'go') */
  language: string;
  /** Detected framework (next, django, express, flask, etc.) */
  framework?: string;
  /** Whether the repo has a test runner configured */
  hasTests: boolean;
  /** Whether the repo has a Dockerfile */
  hasDockerfile: boolean;
  /** Whether the repo has a .devcontainer/ directory */
  hasDevcontainer: boolean;
  /** Entry points (package.json main, setup.py, etc.) */
  entryPoints: string[];
  /** Top-level dependency names */
  dependencies: string[];
  /** Context DNA panel manifest, if present */
  panelManifest?: PanelManifest;
}

export interface PanelManifest {
  panelId: string;
  label: string;
  description: string;
  /** Bundled entry point (e.g. 'dist/panel.js') */
  entry: string;
  services: { required: string[]; optional: string[] };
  permissions: string[];
}

// ---------------------------------------------------------------------------
// In-memory sandbox store (survives within session, not persisted)
// ---------------------------------------------------------------------------

const sandboxes = new Map<string, RepoSandbox>();

// ---------------------------------------------------------------------------
// Shell execution helper
// ---------------------------------------------------------------------------

async function shellExec(command: string, signal?: AbortSignal): Promise<string> {
  const base = getServiceUrl('helper_agent');
  const res = await fetch(`${base}/api/shell/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, timeout: 30000 }),
    signal,
  });
  if (!res.ok) throw new Error(`Shell exec failed: ${res.status}`);
  const json = await res.json() as { stdout?: string; stderr?: string };
  return json.stdout ?? json.stderr ?? '';
}

// ---------------------------------------------------------------------------
// Repo URL normalization
// ---------------------------------------------------------------------------

function normalizeRepoUrl(input: string): string {
  // Handle: owner/repo, https://github.com/owner/repo, git@github.com:owner/repo.git
  const shortMatch = input.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/);
  if (shortMatch) return `https://github.com/${shortMatch[1]}.git`;

  if (input.startsWith('https://') || input.startsWith('git@')) {
    return input.endsWith('.git') ? input : `${input}.git`;
  }

  return input;
}

function sandboxId(): string {
  return `sb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Tier 1: Analyze — Clone + detect stack
// ---------------------------------------------------------------------------

async function analyzeRepo(
  clonePath: string,
  signal?: AbortSignal,
): Promise<RepoAnalysis> {
  const analysis: RepoAnalysis = {
    language: 'unknown',
    hasTests: false,
    hasDockerfile: false,
    hasDevcontainer: false,
    entryPoints: [],
    dependencies: [],
  };

  // Check for key files
  const lsOutput = await shellExec(`ls -1a "${clonePath}" 2>/dev/null`, signal);
  const files = lsOutput.split('\n').map((f) => f.trim()).filter(Boolean);

  analysis.hasDockerfile = files.includes('Dockerfile') || files.includes('dockerfile');
  analysis.hasDevcontainer = files.includes('.devcontainer');

  // Detect language + framework from package.json
  if (files.includes('package.json')) {
    try {
      const pkgRaw = await shellExec(`cat "${clonePath}/package.json"`, signal);
      const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
      analysis.language = 'typescript';

      const deps = {
        ...(pkg.dependencies as Record<string, string> ?? {}),
        ...(pkg.devDependencies as Record<string, string> ?? {}),
      };
      analysis.dependencies = Object.keys(deps).slice(0, 30);

      // Framework detection
      if (deps.next) analysis.framework = 'next';
      else if (deps.nuxt) analysis.framework = 'nuxt';
      else if (deps['@sveltejs/kit']) analysis.framework = 'sveltekit';
      else if (deps.express) analysis.framework = 'express';
      else if (deps.fastify) analysis.framework = 'fastify';
      else if (deps.react) analysis.framework = 'react';
      else if (deps.vue) analysis.framework = 'vue';

      // Test detection
      const scripts = pkg.scripts as Record<string, string> ?? {};
      analysis.hasTests = !!scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1';

      // Entry points
      if (pkg.main) analysis.entryPoints.push(String(pkg.main));
      if (scripts.start) analysis.entryPoints.push(`npm start → ${scripts.start}`);
      if (scripts.dev) analysis.entryPoints.push(`npm run dev → ${scripts.dev}`);
    } catch {
      // Malformed package.json
    }
  }

  // Python detection
  if (files.includes('pyproject.toml') || files.includes('setup.py') || files.includes('requirements.txt')) {
    analysis.language = 'python';
    if (files.includes('manage.py')) analysis.framework = 'django';
    analysis.hasTests = files.includes('pytest.ini') || files.includes('tests') || files.includes('test');
    if (files.includes('setup.py')) analysis.entryPoints.push('setup.py');
    if (files.includes('manage.py')) analysis.entryPoints.push('manage.py');
  }

  // Go detection
  if (files.includes('go.mod')) {
    analysis.language = 'go';
    analysis.entryPoints.push('go.mod');
  }

  // Rust detection
  if (files.includes('Cargo.toml')) {
    analysis.language = 'rust';
    analysis.entryPoints.push('Cargo.toml');
  }

  // Context DNA panel manifest
  if (files.includes('contextdna-panel.json')) {
    try {
      const manifestRaw = await shellExec(`cat "${clonePath}/contextdna-panel.json"`, signal);
      analysis.panelManifest = JSON.parse(manifestRaw) as PanelManifest;
    } catch {
      // Malformed manifest
    }
  }

  return analysis;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Clone + analyze a GitHub repo. Returns a sandbox handle.
 */
export async function createRepoSandbox(
  repoUrl: string,
  branch?: string,
  signal?: AbortSignal,
): Promise<RepoSandbox> {
  const id = sandboxId();
  const url = normalizeRepoUrl(repoUrl);
  const branchFlag = branch ? `--branch ${branch}` : '';
  const clonePath = `/tmp/contextdna-sandbox/${id}`;

  const sandbox: RepoSandbox = {
    id,
    repoUrl: url,
    branch: branch ?? 'main',
    status: 'cloning',
    createdAt: Date.now(),
  };
  sandboxes.set(id, sandbox);

  try {
    // Clone (shallow for speed)
    await shellExec(`mkdir -p /tmp/contextdna-sandbox && git clone --depth 1 ${branchFlag} "${url}" "${clonePath}"`, signal);

    sandbox.status = 'analyzing';
    sandboxes.set(id, { ...sandbox });

    // Analyze
    sandbox.analysis = await analyzeRepo(clonePath, signal);
    sandbox.status = 'ready';
  } catch (err) {
    sandbox.status = 'error';
    sandbox.error = err instanceof Error ? err.message : 'Clone failed';
  }

  sandboxes.set(id, { ...sandbox });
  return sandbox;
}

/**
 * Run a command inside a sandbox directory.
 */
export async function execInSandbox(
  sbId: string,
  command: string,
  signal?: AbortSignal,
): Promise<string> {
  const sb = sandboxes.get(sbId);
  if (!sb) throw new Error(`Sandbox ${sbId} not found`);

  const clonePath = `/tmp/contextdna-sandbox/${sbId}`;
  return shellExec(`cd "${clonePath}" && ${command}`, signal);
}

/**
 * Get a sandbox by ID.
 */
export function getSandbox(sbId: string): RepoSandbox | undefined {
  return sandboxes.get(sbId);
}

/**
 * List all active sandboxes.
 */
export function listSandboxes(): RepoSandbox[] {
  return Array.from(sandboxes.values());
}

/**
 * Clean up sandbox (remove clone directory).
 */
export async function destroySandbox(sbId: string): Promise<void> {
  const sb = sandboxes.get(sbId);
  if (!sb) return;

  try {
    await shellExec(`rm -rf "/tmp/contextdna-sandbox/${sbId}"`);
  } catch {
    // Best effort cleanup
  }

  sandboxes.delete(sbId);
}
