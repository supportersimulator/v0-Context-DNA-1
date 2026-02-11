// =============================================================================
// Phase 9A: Shared TypeScript types for all API clients
// Maps 1:1 to backend Python dataclasses/Pydantic models
// =============================================================================

// ---------------------------------------------------------------------------
// API Configuration
// ---------------------------------------------------------------------------

export const API_BASE = {
  memory: process.env.NEXT_PUBLIC_MEMORY_API || 'http://127.0.0.1:3456',
  helper: process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080',
  llm: process.env.NEXT_PUBLIC_LOCAL_LLM_API || 'http://127.0.0.1:5043',
} as const;

const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

export function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  return headers;
}

export class APIError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
    this.name = 'APIError';
  }
}

// ---------------------------------------------------------------------------
// Swarm Types (maps to memory/swarm_controller.py)
// ---------------------------------------------------------------------------

export type SwarmAgentRole =
  | 'CODE_ARCHAEOLOGIST'
  | 'PATCH_DRAFTER'
  | 'TEST_WRITER'
  | 'RISK_REVIEWER'
  | 'PERFORMANCE_REVIEWER';

export type SwarmRunStatus =
  | 'pending'
  | 'running'
  | 'collecting'
  | 'harmonizing'
  | 'integrating'
  | 'complete'
  | 'failed';

export interface SwarmAgentResult {
  agent_id: string;
  role: string;
  output: string;
  tokens_used: number;
  cost_usd: number;
  elapsed_s: number;
  error: string | null;
}

export interface SwarmCostEstimate {
  input_tokens: number;
  output_tokens: number;
  total_usd: number;
}

export interface SwarmRun {
  run_id: string;
  task: string;
  status: SwarmRunStatus;
  agent_results: Record<string, SwarmAgentResult>;
  integrated_result: string | null;
  cost_estimate: SwarmCostEstimate;
  created_at: number;
  completed_at: number | null;
  error?: string;
}

export interface SwarmRunRequest {
  task: string;
  context?: Record<string, unknown>;
  roles?: SwarmAgentRole[];
}

export interface SwarmRunResponse {
  run_id: string;
  status: string;
  task: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Librarian Types (maps to memory/librarian.py)
// ---------------------------------------------------------------------------

export type LibrarianIntent =
  | 'locate'
  | 'explain'
  | 'trace'
  | 'impact'
  | 'tests'
  | 'deps'
  | 'docs'
  | 'decision';

export interface LibrarianFileResult {
  path: string;
  relevance: number;
  snippet?: string;
  line_range?: [number, number];
}

export interface LibrarianSnippetResult {
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  relevance: number;
}

export interface LibrarianSOPResult {
  title: string;
  summary: string;
  relevance: number;
}

export interface LibrarianQueryRequest {
  agent_id: string;
  intent: LibrarianIntent;
  query: string;
  max_files?: number;
  include_snippets?: boolean;
  focus_dirs?: string[];
}

export interface LibrarianQueryResponse {
  files: LibrarianFileResult[];
  snippets: LibrarianSnippetResult[];
  related_sops: LibrarianSOPResult[];
  confidence: number;
  query_time_ms?: number;
}

// ---------------------------------------------------------------------------
// Harmonizer Types (maps to memory/harmonizer.py)
// ---------------------------------------------------------------------------

export type HarmonizerCategory =
  | 'syntax_valid'
  | 'style_consistent'
  | 'security_safe'
  | 'logic_sound'
  | 'dependency_safe'
  | 'test_aligned'
  | 'architecture_aligned';

export type GateVerdict = 'pass' | 'warn' | 'fail';
export type OverallVerdict = 'accept' | 'review' | 'reject';

export interface GateResult {
  category: HarmonizerCategory;
  verdict: GateVerdict;
  explanation: string;
  confidence: number;
}

export interface HarmonizerCheckRequest {
  code: string;
  language?: string;
  context?: Record<string, unknown>;
}

export interface HarmonizerCheckResponse {
  gate_results: GateResult[];
  overall_verdict: OverallVerdict;
  summary: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Evidence Pipeline Types (maps to memory/observability_store.py)
// ---------------------------------------------------------------------------

export interface EvidencePipelineStats {
  claims: number;
  outcomes: number;
  quarantine: number;
  promotions: number;
  applied_to_wisdom: number;
}

export interface EvidenceClaim {
  id: string;
  statement: string;
  source: string;
  confidence: number;
  status: 'pending' | 'promoted' | 'rejected' | 'quarantined';
  created_at: string;
}

export interface EvidencePromotion {
  claim_id: string;
  statement: string;
  promoted_at: string;
  confidence: number;
  outcome_count: number;
}

// ---------------------------------------------------------------------------
// 8th Intelligence Types (maps to agent_service /contextdna/8th-intelligence)
// ---------------------------------------------------------------------------

export interface EighthIntelligenceRequest {
  subtask: string;
  agent_id?: string;
}

export interface EighthIntelligenceResponse {
  status: string;
  patterns: string[];
  intuitions: string[];
  gotchas: string[];
  guidance: string;
  confidence: number;
  source: string;
}

export interface EighthIntelligenceStatus {
  status: string;
  mode: string;
  uptime_seconds?: number;
}

// ---------------------------------------------------------------------------
// Session Types (maps to agent_service /api/session/briefing)
// ---------------------------------------------------------------------------

export interface SessionBriefing {
  session_id: string;
  summary: string;
  sections: {
    recent_wins?: Array<{ title: string; timestamp: string }>;
    failure_patterns?: Array<{ pattern: string; occurrences: number }>;
    mansion_warnings?: Array<{ warning: string; source: string }>;
    evidence_pipeline?: EvidencePipelineStats;
    system_health?: Record<string, boolean>;
  };
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Mode Types (maps to agent_service /api/mode/status)
// ---------------------------------------------------------------------------

export type OperatingMode = 'lite' | 'heavy' | 'transitioning';

export interface ModeStatus {
  mode: OperatingMode;
  features: {
    redis: boolean;
    postgresql: boolean;
    docker: boolean;
    websocket: boolean;
    swarm: boolean;
    evidence_pipeline: boolean;
    real_time_sync: boolean;
  };
  services: {
    context_dna_api: boolean;
    agent_service: boolean;
    vllm_mlx: boolean;
    redis: boolean;
    postgresql: boolean;
  };
  sync_state?: {
    last_sync: string | null;
    pending_changes: number;
  };
}
