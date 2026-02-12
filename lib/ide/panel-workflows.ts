// =============================================================================
// panel-workflows.ts — Multi-Panel Workflow Definitions
//
// Defines saved multi-panel layouts that open related panels together,
// plus workflow chains where panel events trigger actions in other panels.
//
// This is what turns independent panels into a coordinated IDE experience.
// =============================================================================

import type { CapabilityEventType } from './integration-manifest';

// ---------------------------------------------------------------------------
// Panel Workflow — orchestrated multi-panel layout + event chains
// ---------------------------------------------------------------------------

export interface PanelWorkflow {
  id: string;
  name: string;
  description: string;
  icon: string;          // Lucide icon name
  category: WorkflowCategory;
  /** Panels that participate in this workflow */
  panels: WorkflowPanel[];
  /** Event chains — when event X fires, trigger action Y */
  connections: WorkflowConnection[];
  /** Tags for search/filter */
  tags: string[];
}

export type WorkflowCategory =
  | 'appdev'     // Mobile app development pipeline
  | 'webdev'     // Web development pipeline
  | 'mlops'      // ML model training → deployment
  | 'devops'     // CI/CD → deploy → observe
  | 'fullstack'  // Full-stack development
  | 'debug'      // Debugging / investigation
  | 'custom';    // User-defined

export interface WorkflowPanel {
  panelId: string;
  /** Position hint for layout: left, center, right, bottom */
  position: 'left' | 'center' | 'right' | 'bottom';
  /** Relative width weight (1-3) */
  weight?: number;
}

export interface WorkflowConnection {
  /** Source: which event triggers this connection */
  trigger: CapabilityEventType;
  /** Target provider + action to execute */
  targetProvider: string;
  targetAction: string;
  /** Optional: map trigger event data to action params */
  paramMapping?: Record<string, string>;
  /** Whether this connection auto-executes or requires confirmation */
  autoExecute: boolean;
  /** Human-readable description */
  label: string;
}

// ---------------------------------------------------------------------------
// Built-in Workflow Presets
// ---------------------------------------------------------------------------

export const WORKFLOW_PRESETS: PanelWorkflow[] = [
  // ── App Development Pipeline ──
  {
    id: 'appdev-pipeline',
    name: 'App Dev Pipeline',
    description: 'Git → EAS Build → TestFlight → Crash Reports',
    icon: 'Smartphone',
    category: 'appdev',
    panels: [
      { panelId: 'git', position: 'left' },
      { panelId: 'eas-build', position: 'center', weight: 2 },
      { panelId: 'testflight', position: 'right' },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [
      {
        trigger: 'commit.merged',
        targetProvider: 'eas',
        targetAction: 'start_build',
        paramMapping: { branch: 'commit.branch' },
        autoExecute: false,
        label: 'Merged to main → Trigger EAS Build',
      },
      {
        trigger: 'eas.build.ready',
        targetProvider: 'appstore-connect',
        targetAction: 'submit_testflight',
        autoExecute: false,
        label: 'Build ready → Submit to TestFlight',
      },
    ],
    tags: ['mobile', 'ios', 'android', 'expo', 'testflight'],
  },

  // ── Web Development ──
  {
    id: 'webdev-fullstack',
    name: 'Full Stack Dev',
    description: 'Editor + Terminal + Browser Preview + Docker',
    icon: 'Globe',
    category: 'webdev',
    panels: [
      { panelId: 'editor', position: 'center', weight: 3 },
      { panelId: 'frontend-preview', position: 'right', weight: 2 },
      { panelId: 'terminal', position: 'bottom' },
      { panelId: 'docker', position: 'left' },
    ],
    connections: [],
    tags: ['web', 'frontend', 'backend', 'docker'],
  },

  // ── Deploy Pipeline ──
  {
    id: 'deploy-pipeline',
    name: 'Deploy Pipeline',
    description: 'Git → CI/CD → Deploy → Observe',
    icon: 'Rocket',
    category: 'devops',
    panels: [
      { panelId: 'git', position: 'left' },
      { panelId: 'github-actions', position: 'center' },
      { panelId: 'vercel-deploy', position: 'right' },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [
      {
        trigger: 'commit.pushed',
        targetProvider: 'github-actions',
        targetAction: 'trigger_workflow',
        autoExecute: false,
        label: 'Push → Trigger CI workflow',
      },
      {
        trigger: 'ci.workflow.completed',
        targetProvider: 'vercel',
        targetAction: 'deploy',
        autoExecute: false,
        label: 'CI passed → Deploy to Vercel',
      },
    ],
    tags: ['ci', 'cd', 'deploy', 'vercel', 'github-actions'],
  },

  // ── ML Experiment Pipeline ──
  {
    id: 'ml-experiment',
    name: 'ML Experiment',
    description: 'HuggingFace → Model Catalog → Inference → Benchmark',
    icon: 'Brain',
    category: 'mlops',
    panels: [
      { panelId: 'extensions', position: 'left' },    // HF tab
      { panelId: 'models', position: 'center' },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [
      {
        trigger: 'model.benchmark.completed',
        targetProvider: 'wandb',
        targetAction: 'log_metric',
        autoExecute: true,
        label: 'Benchmark done → Log to W&B',
      },
    ],
    tags: ['ml', 'ai', 'huggingface', 'ollama', 'benchmark'],
  },

  // ── Frontend Preview ──
  {
    id: 'frontend-preview',
    name: 'Frontend Preview',
    description: 'Code + Device Preview + Responsive Testing',
    icon: 'Monitor',
    category: 'webdev',
    panels: [
      { panelId: 'editor', position: 'left', weight: 2 },
      { panelId: 'frontend-preview', position: 'center', weight: 3 },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [],
    tags: ['frontend', 'preview', 'responsive', 'ios', 'android'],
  },

  // ── Mobile Testing ──
  {
    id: 'mobile-testing',
    name: 'Mobile Testing',
    description: 'Device Preview + EAS + Crash Reports + Logs',
    icon: 'Tablet',
    category: 'appdev',
    panels: [
      { panelId: 'frontend-preview', position: 'left', weight: 2 },
      { panelId: 'eas-build', position: 'center' },
      { panelId: 'sentry', position: 'right' },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [
      {
        trigger: 'crash.spike',
        targetProvider: 'sentry',
        targetAction: 'open_issue',
        autoExecute: false,
        label: 'Crash spike → Open Sentry issue',
      },
    ],
    tags: ['mobile', 'testing', 'crash', 'sentry', 'eas'],
  },

  // ── Debug Mode ──
  {
    id: 'debug-mode',
    name: 'Debug Mode',
    description: 'Editor + Debug + Terminal + Problems',
    icon: 'Bug',
    category: 'debug',
    panels: [
      { panelId: 'editor', position: 'center', weight: 2 },
      { panelId: 'debug', position: 'left' },
      { panelId: 'problems', position: 'right' },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [],
    tags: ['debug', 'breakpoints', 'errors'],
  },

  // ── Monitoring ──
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Health + Sentry + Docker + Logs',
    icon: 'Activity',
    category: 'devops',
    panels: [
      { panelId: 'health', position: 'left' },
      { panelId: 'sentry', position: 'center' },
      { panelId: 'docker', position: 'right' },
      { panelId: 'terminal', position: 'bottom' },
    ],
    connections: [
      {
        trigger: 'alert.fired',
        targetProvider: 'sentry',
        targetAction: 'show_details',
        autoExecute: true,
        label: 'Alert → Show crash details',
      },
    ],
    tags: ['monitoring', 'health', 'sentry', 'docker'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getWorkflow(id: string): PanelWorkflow | undefined {
  return WORKFLOW_PRESETS.find((w) => w.id === id);
}

export function getWorkflowsByCategory(category: WorkflowCategory): PanelWorkflow[] {
  return WORKFLOW_PRESETS.filter((w) => w.category === category);
}

export function searchWorkflows(query: string): PanelWorkflow[] {
  const q = query.toLowerCase();
  return WORKFLOW_PRESETS.filter(
    (w) =>
      w.name.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q) ||
      w.tags.some((t) => t.includes(q)),
  );
}
