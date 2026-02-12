// =============================================================================
// librarian-schema.ts — ContextDNA Repo Librarian API Contract
//
// From electron-ide-context-dna.md specification:
//   "One local, persistent service that provides fast recall (exact file paths,
//    symbols, doc sections) and structured answers (JSON payloads for agents)."
//
// Endpoint: POST /v1/context/query
//
// This module provides:
//   1. Request/Response TypeScript types (matching the JSON schema from the doc)
//   2. Intent enum (locate, explain, trace, impact, tests, deps, docs, decision)
//   3. Client function for querying the Librarian
//   4. System prompt for the Librarian local LLM
//   5. Mid-task protocol helpers (step 1: locate, step 2: impact, step 3: tests)
//
// Architecture:
//   Agents call Librarian mid-task to stay grounded.
//   Librarian outputs structured JSON only. No essays.
//   Cheap models "nimbly navigate" like premium ones.
// =============================================================================

import { getServiceUrl } from './service-registry';

// ---------------------------------------------------------------------------
// Intent — what kind of answer the agent wants
// ---------------------------------------------------------------------------

export type LibrarianIntent =
  | 'locate'   // "where is X implemented?"
  | 'explain'  // "summarize how a component works"
  | 'trace'    // "what calls what?"
  | 'impact'   // "if I change this, what breaks?"
  | 'tests'    // "what tests cover this?"
  | 'deps'     // "what are the imports/services?"
  | 'docs'     // "what doc explains this?"
  | 'decision'; // "what prior decision governs this?"

// ---------------------------------------------------------------------------
// Request Schema
// ---------------------------------------------------------------------------

export interface LibrarianRequest {
  request_id: string;
  repo_id: string;
  branch?: string;
  intent: LibrarianIntent;
  query: string;
  focus?: {
    paths_hint?: string[];
    languages?: string[];
    symbols_hint?: string[];
  };
  constraints?: LibrarianConstraints;
  context?: LibrarianContext;
}

export interface LibrarianConstraints {
  max_files?: number;        // default: 10
  max_snippets?: number;     // default: 8
  max_docs?: number;         // default: 5
  max_tokens_output?: number; // default: 1200
  include_snippets?: boolean;
  include_signatures?: boolean;
  include_tests?: boolean;
  confidence_threshold?: number; // 0-1, default: 0.35
}

export interface LibrarianContext {
  task_goal?: string;
  current_files_open?: string[];
  recent_changes?: Array<{
    path: string;
    summary: string;
    commit?: string;
  }>;
  project_invariants?: string[];
  known_decisions?: Array<{
    id: string;
    rule: string;
    why: string;
  }>;
}

// ---------------------------------------------------------------------------
// Response Schema
// ---------------------------------------------------------------------------

export interface LibrarianResponse {
  request_id: string;
  repo_id: string;
  branch: string;
  intent: LibrarianIntent;
  answer: LibrarianAnswer;
  telemetry: LibrarianTelemetry;
}

export interface LibrarianAnswer {
  summary: string;
  files: LibrarianFile[];
  docs: LibrarianDoc[];
  tests: LibrarianTest[];
  deps: LibrarianDep[];
  decisions: LibrarianDecision[];
  risks: LibrarianRisk[];
  followups: LibrarianFollowup[];
  confidence: number; // 0-1
}

export interface LibrarianFile {
  path: string;
  relevance: number;
  why: string;
  symbols: Array<{
    name: string;
    kind: 'function' | 'class' | 'module' | 'const' | 'type' | 'interface';
    signature?: string;
  }>;
  snippets?: Array<{
    range: { start_line: number; end_line: number };
    content: string;
    reason: string;
  }>;
}

export interface LibrarianDoc {
  path: string;
  relevance: number;
  why: string;
  anchors: string[];
}

export interface LibrarianTest {
  path: string;
  relevance: number;
  why: string;
  commands: string[];
}

export interface LibrarianDep {
  kind: 'import' | 'service' | 'api' | 'database';
  from: string;
  to: string;
  why: string;
}

export interface LibrarianDecision {
  id: string;
  relevance: number;
  rule: string;
  why: string;
}

export interface LibrarianRisk {
  severity: 'critical' | 'high' | 'medium' | 'low';
  item: string;
  mitigation: string;
}

export interface LibrarianFollowup {
  question: string;
  why: string;
}

export interface LibrarianTelemetry {
  used_indexes: string[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// Client — query the Librarian service
// ---------------------------------------------------------------------------

/**
 * Query the ContextDNA Librarian for repo-grounded context.
 *
 * @example
 *   // Agent wants to know where injection is assembled
 *   const result = await queryLibrarian({
 *     request_id: crypto.randomUUID(),
 *     repo_id: 'contextdna',
 *     intent: 'locate',
 *     query: 'where is the webhook injection assembled and applied?',
 *     constraints: { max_files: 8, include_snippets: true },
 *   });
 */
export async function queryLibrarian(
  request: LibrarianRequest,
): Promise<LibrarianResponse | null> {
  const base = getServiceUrl('contextdna') || 'http://127.0.0.1:8080';
  try {
    const res = await fetch(`${base}/v1/context/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Mid-Task Protocol Helpers
//
// From doc: "Step 1: locate → Step 2: impact → Step 3: tests"
// This is what makes cheap agents "nimbly navigate" like premium ones.
// ---------------------------------------------------------------------------

/** Step 1 — Before doing anything: find where the work lives */
export function buildLocateRequest(
  query: string,
  repoId = 'er-simulator-superrepo',
): LibrarianRequest {
  return {
    request_id: generateRequestId(),
    repo_id: repoId,
    intent: 'locate',
    query,
    constraints: {
      max_files: 10,
      max_snippets: 8,
      include_snippets: true,
      include_signatures: true,
      include_tests: true,
    },
  };
}

/** Step 2 — After planning a change: what breaks? */
export function buildImpactRequest(
  changedFiles: string[],
  changedSymbols: string[],
  repoId = 'er-simulator-superrepo',
): LibrarianRequest {
  return {
    request_id: generateRequestId(),
    repo_id: repoId,
    intent: 'impact',
    query: `If we change ${changedFiles.join(', ')}, what breaks?`,
    focus: {
      paths_hint: changedFiles,
      symbols_hint: changedSymbols,
    },
    constraints: {
      max_files: 12,
      include_tests: true,
    },
  };
}

/** Step 3 — Before finalizing: minimum validation plan */
export function buildTestRequest(
  changedFiles: string[],
  repoId = 'er-simulator-superrepo',
): LibrarianRequest {
  return {
    request_id: generateRequestId(),
    repo_id: repoId,
    intent: 'tests',
    query: `List minimum tests + commands to validate changes to ${changedFiles.join(', ')}`,
    focus: { paths_hint: changedFiles },
    constraints: {
      max_files: 8,
      include_tests: true,
    },
  };
}

function generateRequestId(): string {
  // Use crypto.randomUUID if available, fallback to timestamp
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Librarian LLM System Prompt
//
// From doc: "Use this as the system prompt for the local model behind Librarian."
// ---------------------------------------------------------------------------

export const LIBRARIAN_SYSTEM_PROMPT = `You are ContextDNA Repo Librarian, a local navigation and recall model for a software monorepo.

PRIMARY JOB: Return accurate, repo-grounded pointers: file paths, symbols, minimal snippets, tests, docs, dependencies, risks, and follow-up questions.

HARD RULES:
1) OUTPUT MUST BE VALID JSON ONLY. No markdown, no prose outside JSON.
2) Do not invent files, symbols, or test paths. If unsure, return lower confidence and ask a follow-up.
3) Prefer precision over breadth: return the smallest set of most relevant files/snippets.
4) Cite evidence via file path + line ranges when snippets are included.
5) Never rewrite user goals; reflect them concisely.
6) Respect constraints.* fields exactly (max_files, max_snippets, etc.). If constraints are missing, default: max_files=10, max_snippets=8, max_docs=5.

AVAILABLE INDEXES (assume your service can provide these results to you):
- file_tree: list of repo paths
- symbols_index: functions/classes and their file locations
- ripgrep: text search results with file+line
- docs_index: markdown headings/anchors
- decisions_memory: curated project decisions/invariants
- tests_index: mapping code areas -> tests (heuristic ok, but mark confidence)

INTENTS:
- locate: find where something is implemented
- explain: summarize how a component works (with pointers)
- trace: identify call/flow chain across files
- impact: list what will break if a change is made
- tests: list tests & commands to validate change
- deps: list important imports/services touched
- docs: point to design docs and anchors
- decision: point to prior decisions/invariants relevant to the query

RESPONSE SHAPE (must follow):
{
  "request_id": "...",
  "repo_id": "...",
  "branch": "...",
  "intent": "...",
  "answer": {
    "summary": "...",
    "files": [ ... ],
    "docs": [ ... ],
    "tests": [ ... ],
    "deps": [ ... ],
    "decisions": [ ... ],
    "risks": [ ... ],
    "followups": [ ... ],
    "confidence": 0.0-1.0
  },
  "telemetry": {
    "used_indexes": [ ... ],
    "notes": [ ... ]
  }
}

FILE ENTRY SHAPE:
{
  "path": "path/to/file",
  "relevance": 0.0-1.0,
  "why": "one sentence",
  "symbols": [{"name":"", "kind":"function|class|module|const", "signature":""}],
  "snippets": [{"range":{"start_line":0,"end_line":0},"content":"...","reason":"..."}]
}

If you cannot answer with confidence >= constraints.confidence_threshold, include followups and set confidence low.

Return JSON only.`;
