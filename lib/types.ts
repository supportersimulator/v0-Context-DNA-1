export type LearningType = 'win' | 'fix' | 'pattern' | 'sop' | 'insight' | 'gotcha';

export interface Learning {
  id: string;
  type: LearningType;
  title: string;
  content: string;
  tags: string[];
  timestamp: string;
  created_at: string; // Maintain for backward compatibility
  session_id?: string;
  injection_id?: string;
  source?: string;
  metadata?: Record<string, any>;
  relevance?: number;
}

export interface Stats {
  total: number;
  wins: number;
  fixes: number;
  patterns: number;
  sops: number;
  today: number;
  streak: number;
  last_updated: string;
}

export interface DailyWins {
  date: string;
  count: number;
  wins: Learning[];
}

export interface ConsultResponse {
  context: {
    the_one_thing: string;
    landmines: string[];
    patterns: string[];
    context: string;
  };
}

export interface HealthStatus {
  docker: boolean;
  postgresql: boolean;
  redis: boolean;
  opensearch: boolean;
  jaeger: boolean;
  ollama: boolean;
  api: boolean;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  latency?: number;
  port?: number;
  icon: string;
}

export type TabId = 'home' | 'activity' | 'professor' | 'search' | 'health' | 'models' | 'injection';

export interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

export const DEFAULT_TABS: Tab[] = [
  { id: 'home', label: 'Home', icon: '🧠' },
  { id: 'activity', label: 'Activity', icon: '📊' },
  { id: 'professor', label: 'Professor', icon: '🎓' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'health', label: 'Health', icon: '💚' },
  { id: 'models', label: 'Models', icon: '🤖' },
];

// Injection tab is special - shown via focus mode toggle, not in main tab list
export const INJECTION_TAB: Tab = { id: 'injection', label: 'Live Injection', icon: '💉' };

export const LEARNING_TYPE_CONFIG: Record<LearningType, { emoji: string; color: string; label: string }> = {
  win: { emoji: '🏆', color: 'text-type-win', label: 'Win' },
  fix: { emoji: '🔧', color: 'text-type-fix', label: 'Fix' },
  pattern: { emoji: '🔄', color: 'text-type-pattern', label: 'Pattern' },
  sop: { emoji: '📋', color: 'text-type-sop', label: 'SOP' },
  insight: { emoji: '💡', color: 'text-type-insight', label: 'Insight' },
  gotcha: { emoji: '⚠️', color: 'text-type-gotcha', label: 'Gotcha' },
};

// =============================================================================
// INJECTION VISUALIZATION TYPES
// =============================================================================

export type RiskLevel = 'critical' | 'high' | 'moderate' | 'low';

export interface InjectionTrigger {
  hook: string;
  prompt: string;
  session_id: string;
}

export interface InjectionAnalysis {
  detected_domains: string[];
  risk_level: RiskLevel;
  first_try_likelihood: number | string;
  generation_time_ms: number;
  sections_included: string[];
  ab_variant: string;
  mode: string;
}

export interface Landmine {
  icon: string;
  text: string;
}

export interface Pattern {
  text: string;
  file?: string;
  lines?: string;
}

export interface SOP {
  id: string;
  title: string;
  summary: string;
  relevance_score: number;
  full_content?: string;
}

export interface InjectionWisdom {
  the_one_thing: string;
  landmines: Landmine[];
  patterns: Pattern[];
  context: string;
}

export interface InjectionProtocol {
  risk_level: string;
  first_try_percent: number;
  recommendation: string;
}

export interface SilverPlatter {
  safety: {
    found: boolean;
    content: string[];
  };
  wisdom: InjectionWisdom;
  sops: SOP[];
  protocol: InjectionProtocol;
}

export interface InjectionData {
  id: string;
  timestamp: string;
  trigger: InjectionTrigger;
  analysis: InjectionAnalysis;
  silver_platter: SilverPlatter;
  raw_output: string;
}

export interface InjectionHistoryItem {
  id: string;
  timestamp: string;
  prompt: string;
  risk_level: RiskLevel;
  first_try: string;
}

export const RISK_LEVEL_CONFIG: Record<RiskLevel, { color: string; bgColor: string; label: string }> = {
  critical: { color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'CRITICAL' },
  high: { color: 'text-orange-400', bgColor: 'bg-orange-500/20', label: 'HIGH' },
  moderate: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', label: 'MODERATE' },
  low: { color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'LOW' },
};

// =============================================================================
// LLM MODELS TYPES
// =============================================================================

export interface OllamaModel {
  name: string;
  model: string;
  size: number;        // Size in bytes
  digest: string;      // Model digest/hash
  modified_at: string; // ISO timestamp
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface AvailableModel {
  id: string;
  name: string;
  displayName: string;
  description: string;
  size: string;        // Human readable, e.g., "4.5 GB"
  sizeBytes: number;
  ramRequired: string; // e.g., "8 GB"
  category: 'coding' | 'general' | 'embedding' | 'multimodal';
  recommended: boolean;
  tier: 'free' | 'pro' | 'advanced'; // Required subscription tier
}

export interface ModelDownloadProgress {
  modelId: string;
  status: 'queued' | 'downloading' | 'verifying' | 'complete' | 'error';
  progress: number;  // 0-100
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

export interface ModelStatus {
  installedModels: OllamaModel[];
  activeModel: string | null;
  downloadProgress: ModelDownloadProgress[];
  ollamaRunning: boolean;
  ollamaInstalled: boolean;
  ollamaInstallPath: string | null;
  ollamaHasModels: boolean;
  ollamaInstallMethod: 'brew' | 'download' | 'curl';
}

export interface UserPlan {
  tier: 'free' | 'pro' | 'advanced';
  canSwitchModels: boolean;
  canDeleteModels: boolean;
  maxModels: number;
}

// Available models catalog - can be extended
export const AVAILABLE_MODELS: AvailableModel[] = [
  {
    id: 'qwen2.5-coder:14b-instruct-q4_K_M',
    name: 'qwen2.5-coder:14b-instruct-q4_K_M',
    displayName: 'Qwen 2.5 Coder 14B Instruct (4-bit)',
    description: 'Top-tier coding assistant with instruction following - Aaron\'s choice',
    size: '8.9 GB',
    sizeBytes: 8900000000,
    ramRequired: '16 GB',
    category: 'coding',
    recommended: true,
    tier: 'pro',
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'qwen2.5-coder:7b',
    displayName: 'Qwen 2.5 Coder 7B',
    description: 'Fast coding assistant, balanced performance',
    size: '4.5 GB',
    sizeBytes: 4500000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'free',
  },
  {
    id: 'qwen2.5-coder:14b',
    name: 'qwen2.5-coder:14b',
    displayName: 'Qwen 2.5 Coder 14B',
    description: 'Larger model with better reasoning',
    size: '9.0 GB',
    sizeBytes: 9000000000,
    ramRequired: '16 GB',
    category: 'coding',
    recommended: false,
    tier: 'pro',
  },
  {
    id: 'llama3.1:8b',
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B',
    description: 'General purpose with strong reasoning',
    size: '4.7 GB',
    sizeBytes: 4700000000,
    ramRequired: '10 GB',
    category: 'general',
    recommended: false,
    tier: 'pro',
  },
  {
    id: 'codellama:7b',
    name: 'codellama:7b',
    displayName: 'Code Llama 7B',
    description: 'Meta code generation specialist',
    size: '3.8 GB',
    sizeBytes: 3800000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'free',
  },
  {
    id: 'nomic-embed-text',
    name: 'nomic-embed-text',
    displayName: 'Nomic Embed Text',
    description: 'Fast embeddings for semantic search',
    size: '274 MB',
    sizeBytes: 274000000,
    ramRequired: '2 GB',
    category: 'embedding',
    recommended: true,
    tier: 'free',
  },
  {
    id: 'deepseek-coder:6.7b',
    name: 'deepseek-coder:6.7b',
    displayName: 'DeepSeek Coder 6.7B',
    description: 'Excellent for code completion',
    size: '3.8 GB',
    sizeBytes: 3800000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'advanced',
  },
  {
    id: 'llama3.1:70b',
    name: 'llama3.1:70b',
    displayName: 'Llama 3.1 70B',
    description: 'Top-tier reasoning (GPU required)',
    size: '40 GB',
    sizeBytes: 40000000000,
    ramRequired: '48 GB',
    category: 'general',
    recommended: false,
    tier: 'advanced',
  },
];
