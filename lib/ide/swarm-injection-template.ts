// =============================================================================
// swarm-injection-template.ts — ContextDNA Cursor Swarm Injection Template v1
//
// From electron-ide-context-dna.md specification:
//   Give the swarm a shared "project brain" in <2–4k tokens
//   Prevent rework + hallucinated architecture
//   Force repo-grounded answers (files, symbols, diffs, tests)
//   Make outputs easy to merge by an integrator agent
//
// This module provides:
//   1. SwarmInjectionTemplate — the 8-section context packet every swarm run starts with
//   2. AgentOutputSchema — the per-agent output contract (TOUCH, FINDINGS, DIFF, TESTS, RISKS)
//   3. Token budget controls per role
//   4. Template serialization to compact prompt format
//   5. "spawn10" generator — produces N agent task prompts from a single template
//
// Architecture:
//   ContextDNA injects this template FIRST.
//   Then each agent receives: template + role assignment + output contract.
//   OpenHands agents never "think globally" — they ask ContextDNA.
// =============================================================================

import { AGENT_ROLE_PROFILES, getToolPromptForRole } from './openhands-bridge';

// ---------------------------------------------------------------------------
// Token Budget Controls — per role
// ---------------------------------------------------------------------------

export interface TokenBudget {
  maxOutputTokens: number;
  maxContextTokens: number;
  failOnLonger: boolean;
}

/** Token budgets by role — keeps swarm cost bounded */
export const ROLE_TOKEN_BUDGETS: Record<string, TokenBudget> = {
  planner:    { maxOutputTokens: 1500, maxContextTokens: 4000, failOnLonger: false },
  search:     { maxOutputTokens: 800,  maxContextTokens: 3000, failOnLonger: true  },
  patch:      { maxOutputTokens: 1500, maxContextTokens: 4000, failOnLonger: false },
  test:       { maxOutputTokens: 1000, maxContextTokens: 3000, failOnLonger: true  },
  review:     { maxOutputTokens: 1200, maxContextTokens: 3000, failOnLonger: true  },
  ops:        { maxOutputTokens: 800,  maxContextTokens: 2000, failOnLonger: true  },
  doc:        { maxOutputTokens: 800,  maxContextTokens: 2000, failOnLonger: true  },
  deps:       { maxOutputTokens: 800,  maxContextTokens: 2000, failOnLonger: true  },
  safety:     { maxOutputTokens: 1200, maxContextTokens: 3000, failOnLonger: true  },
  integrator: { maxOutputTokens: 3000, maxContextTokens: 8000, failOnLonger: false },
  full:       { maxOutputTokens: 2000, maxContextTokens: 6000, failOnLonger: false },
};

// ---------------------------------------------------------------------------
// Per-Agent Output Schema — TOUCH, FINDINGS, DIFF, TESTS, RISKS
//
// From doc: "Tell every agent to respond with exactly this format.
// That one convention alone makes your integrator step 2–3× faster."
// ---------------------------------------------------------------------------

export interface AgentOutput {
  /** File paths the agent touched or referenced */
  touch: string[];
  /** Key findings with file:line citations */
  findings: AgentFinding[];
  /** Proposed code changes in diff or edit-instruction format */
  diff: AgentDiff | null;
  /** Test commands and files to validate the change */
  tests: AgentTestPlan;
  /** Top risks with severity and mitigation */
  risks: AgentRisk[];
}

export interface AgentFinding {
  file: string;
  line?: number;
  finding: string;
}

export interface AgentDiff {
  /** 'unified' for standard diff, 'edit_instructions' for file:line anchored edits */
  format: 'unified' | 'edit_instructions';
  content: string;
  explanation: string[];
}

export interface AgentTestPlan {
  commands: string[];
  files: string[];
  coverage: string;
}

export interface AgentRisk {
  severity: 'critical' | 'high' | 'medium' | 'low';
  item: string;
  mitigation: string;
}

/** Compact prompt instructions for the per-agent output schema */
export const AGENT_OUTPUT_PROMPT = `REQUIRED OUTPUT FORMAT (strict JSON):
{
  "touch": ["path/to/file1.ts", "path/to/file2.py"],
  "findings": [{"file":"path","line":42,"finding":"what you found"}],
  "diff": {"format":"unified|edit_instructions","content":"...","explanation":["bullet1"]},
  "tests": {"commands":["pytest -k test_x"],"files":["tests/test_x.py"],"coverage":"what it validates"},
  "risks": [{"severity":"high","item":"what might break","mitigation":"how to prevent"}]
}
Rules:
- Cite file paths + line numbers for every claim
- If proposing code, use diff-style or edit instructions with exact file/line anchors
- No prose essays — bullets and structured data only
- If missing info: ask ONE targeted question OR proceed with labeled assumptions`;

// ---------------------------------------------------------------------------
// Swarm Injection Template — 8 Sections
// ---------------------------------------------------------------------------

export interface SwarmInjectionTemplate {
  // Section 0: Header
  header: {
    runId: string;
    repo: string;
    branch: string;
    goal: string;
    successCriteria: string[];
    nonGoals: string[];
  };

  // Section 1: Current System Map
  systemMap: {
    services: ServiceEntry[];
    keyFlows: FlowEntry[];
    invariants: string[];
  };

  // Section 2: Known Truths (from ContextDNA memory)
  knownTruths: {
    decisions: DecisionEntry[];
    landmines: LandmineEntry[];
    preferredPatterns: string[];
    forbiddenChanges: string[];
  };

  // Section 3: Sources of Truth (markdown docs)
  sourcesOfTruth: DocReference[];

  // Section 4: Repo Hotspots
  repoHotspots: {
    likelyFiles: HotspotFile[];
    relatedTests: TestFile[];
    configTouchpoints: HotspotFile[];
  };

  // Section 5: Change Strategy
  changeStrategy: {
    approach: string;
    migration: 'none' | 'additive' | 'deprecate-old' | 'data-migration';
    backwardCompatibility: string;
    fallbackRequired: boolean;
    fallbackMechanism?: string;
  };

  // Section 6: Swarm Protocol (roles + constraints)
  swarmProtocol: {
    globalConstraints: string[];
    maxOutputPerAgent: number;
    roles: SwarmRole[];
  };

  // Section 7: Integrator Instructions
  integratorInstructions: {
    mergeInto: string[];
    rejectIf: string[];
  };
}

export interface ServiceEntry {
  name: string;
  responsibility: string;
}

export interface FlowEntry {
  name: string;
  entrypoint: string;
  modules: string[];
  outputs: string;
}

export interface DecisionEntry {
  id: string;
  rule: string;
  why: string;
}

export interface LandmineEntry {
  item: string;
  symptom: string;
  howToAvoid: string;
}

export interface DocReference {
  title: string;
  path: string;
  extract: string;
}

export interface HotspotFile {
  path: string;
  why: string;
}

export interface TestFile {
  path: string;
  covers: string;
}

export interface SwarmRole {
  role: string;
  count: number;
  toolProfile: keyof typeof AGENT_ROLE_PROFILES;
  outputContract: string;
}

// ---------------------------------------------------------------------------
// Default Roles — from doc specification
// ---------------------------------------------------------------------------

export const DEFAULT_SWARM_ROLES: SwarmRole[] = [
  { role: 'Architect/Planner', count: 1, toolProfile: 'review',
    outputContract: 'Plan (≤10 steps) + Risk list + Touch list (files)' },
  { role: 'Doc-Extractor', count: 2, toolProfile: 'search',
    outputContract: 'Key requirements + constraints + acceptance checks' },
  { role: 'Repo Archaeologist', count: 2, toolProfile: 'search',
    outputContract: 'Where to change + call graph notes + existing patterns' },
  { role: 'Patch Drafter', count: 3, toolProfile: 'patch',
    outputContract: 'Proposed diff + explanation (≤8 bullets)' },
  { role: 'Test Engineer', count: 1, toolProfile: 'test',
    outputContract: 'Test plan + specific tests to add/modify + commands' },
  { role: 'Safety/Regression', count: 1, toolProfile: 'review',
    outputContract: 'Edge cases + failure modes + rollback/fallback checks' },
];

// ---------------------------------------------------------------------------
// Template Serialization — compact format for system prompt injection
// ---------------------------------------------------------------------------

/**
 * Serialize a SwarmInjectionTemplate to a compact text block (~2-4k tokens).
 * Injected at the top of every swarm agent's system prompt.
 */
export function serializeTemplate(t: SwarmInjectionTemplate): string {
  const lines: string[] = [];

  // Section 0: Header
  lines.push('=== SWARM CONTEXT PACKET ===');
  lines.push(`Run: ${t.header.runId}`);
  lines.push(`Repo: ${t.header.repo} @ ${t.header.branch}`);
  lines.push(`Goal: ${t.header.goal}`);
  lines.push('Success criteria:');
  t.header.successCriteria.forEach(c => lines.push(`  - ${c}`));
  if (t.header.nonGoals.length) {
    lines.push('Non-goals:');
    t.header.nonGoals.forEach(g => lines.push(`  - ${g}`));
  }

  // Section 1: System Map
  lines.push('\n--- SYSTEM MAP ---');
  t.systemMap.services.forEach(s => lines.push(`  ${s.name}: ${s.responsibility}`));
  if (t.systemMap.keyFlows.length) {
    lines.push('Key flows:');
    t.systemMap.keyFlows.forEach(f =>
      lines.push(`  ${f.name}: ${f.entrypoint} → ${f.modules.join(' → ')} → ${f.outputs}`));
  }
  lines.push('Invariants (DO NOT BREAK):');
  t.systemMap.invariants.forEach(i => lines.push(`  !! ${i}`));

  // Section 2: Known Truths
  lines.push('\n--- KNOWN TRUTHS ---');
  if (t.knownTruths.decisions.length) {
    lines.push('Decisions:');
    t.knownTruths.decisions.forEach(d => lines.push(`  [${d.id}] ${d.rule} — ${d.why}`));
  }
  if (t.knownTruths.landmines.length) {
    lines.push('Landmines:');
    t.knownTruths.landmines.forEach(l => lines.push(`  ⚠ ${l.item}: ${l.symptom} → ${l.howToAvoid}`));
  }
  if (t.knownTruths.preferredPatterns.length) {
    lines.push('Patterns: ' + t.knownTruths.preferredPatterns.join(', '));
  }
  if (t.knownTruths.forbiddenChanges.length) {
    lines.push('FORBIDDEN:');
    t.knownTruths.forbiddenChanges.forEach(f => lines.push(`  X ${f}`));
  }

  // Section 3: Sources of Truth
  if (t.sourcesOfTruth.length) {
    lines.push('\n--- DOCS (prefer these over guessing) ---');
    t.sourcesOfTruth.forEach(d => lines.push(`  DOC: ${d.title} → ${d.path} — ${d.extract}`));
  }

  // Section 4: Repo Hotspots
  lines.push('\n--- HOTSPOTS ---');
  t.repoHotspots.likelyFiles.forEach(f => lines.push(`  ${f.path}: ${f.why}`));
  if (t.repoHotspots.relatedTests.length) {
    lines.push('Tests:');
    t.repoHotspots.relatedTests.forEach(f => lines.push(`  ${f.path}: ${f.covers}`));
  }

  // Section 5: Change Strategy
  lines.push('\n--- CHANGE STRATEGY ---');
  lines.push(`Approach: ${t.changeStrategy.approach}`);
  lines.push(`Migration: ${t.changeStrategy.migration}`);
  lines.push(`Backward compat: ${t.changeStrategy.backwardCompatibility}`);
  if (t.changeStrategy.fallbackRequired) {
    lines.push(`Fallback: ${t.changeStrategy.fallbackMechanism || 'REQUIRED — not yet specified'}`);
  }

  // Section 6: Swarm Protocol
  lines.push('\n--- SWARM PROTOCOL ---');
  t.swarmProtocol.globalConstraints.forEach(c => lines.push(`  RULE: ${c}`));
  lines.push(`Max output per agent: ${t.swarmProtocol.maxOutputPerAgent} tokens`);

  // Section 7: Integrator Instructions
  lines.push('\n--- INTEGRATOR ---');
  lines.push('Merge into:');
  t.integratorInstructions.mergeInto.forEach(m => lines.push(`  - ${m}`));
  lines.push('Reject if:');
  t.integratorInstructions.rejectIf.forEach(r => lines.push(`  - ${r}`));

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Agent Task Prompt Generator — "spawn10"
//
// Given a template + roles, generates individual agent task prompts.
// Each prompt includes: template context + role assignment + tools + output contract.
// ---------------------------------------------------------------------------

export interface AgentTaskPrompt {
  agentId: string;
  role: string;
  systemPrompt: string;
  tokenBudget: TokenBudget;
}

/**
 * Generate N agent task prompts from a swarm injection template.
 *
 * @example
 *   const template = buildTemplate({ ... });
 *   const prompts = generateAgentPrompts(template);
 *   // → 10 prompts, one per role (counts from DEFAULT_SWARM_ROLES)
 *   // Each includes: context packet + role + tools + output schema
 */
export function generateAgentPrompts(
  template: SwarmInjectionTemplate,
  roles?: SwarmRole[],
): AgentTaskPrompt[] {
  const effectiveRoles = roles ?? template.swarmProtocol.roles;
  const serialized = serializeTemplate(template);
  const prompts: AgentTaskPrompt[] = [];
  let agentIdx = 0;

  for (const role of effectiveRoles) {
    for (let i = 0; i < role.count; i++) {
      agentIdx++;
      const agentId = `${template.header.runId}-agent-${agentIdx}`;
      const toolPrompt = getToolPromptForRole(role.toolProfile);
      const budget = ROLE_TOKEN_BUDGETS[role.toolProfile] ?? ROLE_TOKEN_BUDGETS.full;

      const systemPrompt = [
        serialized,
        '',
        `--- YOUR ROLE: ${role.role} (agent ${agentIdx}) ---`,
        `Output contract: ${role.outputContract}`,
        `Max output: ${budget.maxOutputTokens} tokens`,
        budget.failOnLonger ? 'STRICT: response MUST fit within token limit.' : '',
        '',
        '--- AVAILABLE TOOLS ---',
        toolPrompt,
        '',
        AGENT_OUTPUT_PROMPT,
        '',
        'REMEMBER: Call context_query (Librarian) when uncertain about file locations or architecture.',
        'REMEMBER: No prose essays. Structured output only.',
      ].filter(Boolean).join('\n');

      prompts.push({ agentId, role: role.role, systemPrompt, tokenBudget: budget });
    }
  }

  return prompts;
}

// ---------------------------------------------------------------------------
// Template Builder — convenience for creating templates
// ---------------------------------------------------------------------------

export interface TemplateBuildOptions {
  runId?: string;
  repo?: string;
  branch?: string;
  goal: string;
  successCriteria?: string[];
  nonGoals?: string[];
  services?: ServiceEntry[];
  invariants?: string[];
  decisions?: DecisionEntry[];
  landmines?: LandmineEntry[];
  docs?: DocReference[];
  hotspots?: HotspotFile[];
  tests?: TestFile[];
  roles?: SwarmRole[];
}

/**
 * Build a SwarmInjectionTemplate with sensible defaults.
 * Only `goal` is required — everything else can be populated later
 * (e.g., by querying the Librarian).
 */
export function buildTemplate(opts: TemplateBuildOptions): SwarmInjectionTemplate {
  const now = new Date();
  const runId = opts.runId ?? `R-${now.toISOString().slice(0, 10)}-${now.toISOString().slice(11, 16).replace(':', '')}`;

  return {
    header: {
      runId,
      repo: opts.repo ?? 'er-simulator-superrepo',
      branch: opts.branch ?? 'main',
      goal: opts.goal,
      successCriteria: opts.successCriteria ?? [],
      nonGoals: opts.nonGoals ?? [],
    },
    systemMap: {
      services: opts.services ?? [],
      keyFlows: [],
      invariants: opts.invariants ?? [],
    },
    knownTruths: {
      decisions: opts.decisions ?? [],
      landmines: opts.landmines ?? [],
      preferredPatterns: [],
      forbiddenChanges: [],
    },
    sourcesOfTruth: opts.docs ?? [],
    repoHotspots: {
      likelyFiles: opts.hotspots ?? [],
      relatedTests: opts.tests ?? [],
      configTouchpoints: [],
    },
    changeStrategy: {
      approach: 'minimal diff, incremental, behind flags when risky',
      migration: 'none',
      backwardCompatibility: 'required',
      fallbackRequired: false,
    },
    swarmProtocol: {
      globalConstraints: [
        'No prose essays — structured output only.',
        'Must cite file paths + symbols for any claim.',
        'If proposing code, use diff-style or edit instructions with exact file/line anchors.',
        'If missing info: ask one targeted question OR proceed with labeled assumptions.',
      ],
      maxOutputPerAgent: 1200,
      roles: opts.roles ?? DEFAULT_SWARM_ROLES,
    },
    integratorInstructions: {
      mergeInto: [
        'single coherent implementation plan',
        'minimal safe patch',
        'complete test plan',
        'explicit invariants check',
      ],
      rejectIf: [
        'violates invariants',
        'changes forbidden files',
        'introduces new dependency without justification',
        'lacks tests when behavior changes',
      ],
    },
  };
}
