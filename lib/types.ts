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

export type TabId = 'home' | 'activity' | 'professor' | 'search' | 'health' | 'models' | 'injection' | 'install' | 'synaptic' | 'voice';

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
  { id: 'synaptic', label: 'Synaptic', icon: '⚡' },
  { id: 'install', label: 'Install', icon: '📥' },
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

export type BackendType = 'mlx' | 'ollama' | 'llamacpp';

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
  backend: BackendType; // Which runtime to use
  appleSiliconOnly?: boolean; // If true, only show on Apple Silicon
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
}

export interface HardwareInfo {
  os: string;
  arch: string;
  python_arch: string;
  ram_gb: number;
  is_apple_silicon: boolean;
  has_metal: boolean;
  is_rosetta: boolean;
  chip_name: string | null;
  cpu_cores: number | null;
  gpu_info: string | null;
  mlx_available: boolean;
  ollama_available: boolean;
  recommended_backend: BackendType;
  recommended_model: string;
  recommended_model_name: string;
  recommended_model_size: string;
  install_command: string;
  notes: string;
  warnings: string[];
  all_models: Array<{
    size: string;
    id: string;
    name: string;
    ram_required: number;
    description: string;
    recommended: boolean;
    fits_in_ram: boolean;
  }>;
}

export interface UserPlan {
  tier: 'free' | 'pro' | 'advanced';
  canSwitchModels: boolean;
  canDeleteModels: boolean;
  maxModels: number;
}

// Available models catalog - MLX models first (recommended for Apple Silicon)
// =============================================================================
// WORKSPACE ANALYSIS TYPES
// =============================================================================

export interface DetectedProject {
  name: string;
  path: string;
  type: 'git_repo' | 'submodule' | 'package' | 'service' | 'module';
  framework?: string;
  language?: string;
  description?: string;
  confidence: number; // 0-1
  selected: boolean; // User can toggle
}

export interface DetectedService {
  name: string;
  path: string;
  type: 'backend' | 'frontend' | 'api' | 'worker' | 'infrastructure' | 'database';
  framework?: string;
  port?: number;
  description?: string;
}

export interface HierarchyProfile {
  repo_type: 'monorepo' | 'submodule-monorepo' | 'polyrepo' | 'standard';
  root_path: string;
  projects: DetectedProject[];
  services: DetectedService[];
  infrastructure: {
    docker: boolean;
    terraform: boolean;
    kubernetes: boolean;
    docker_compose_paths: string[];
  };
  conventions: {
    naming_style: 'snake_case' | 'camelCase' | 'kebab-case' | 'mixed';
    config_pattern: string[];
    test_pattern: string[];
  };
  machine_id: string;
  created_at: string;
  version: number;
}

export interface WorkspaceAnalysis {
  status: 'scanning' | 'complete' | 'error';
  profile: HierarchyProfile | null;
  questions: ClarifyingQuestion[];
  suggestions: string[];
  error?: string;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: { label: string; value: string; recommended?: boolean }[];
  context?: string;
  answered?: string;
}

export interface DeviceInfo {
  device_id: string;
  machine_id: string;
  fingerprint: string;
  os: string;
  os_version: string;
  arch: string;
  hostname: string;
  username: string;
  registered_at?: string;
}

export interface SystemAnalysis {
  device: DeviceInfo;
  hardware: HardwareInfo | null;
  workspace: WorkspaceAnalysis | null;
}

// =============================================================================
// INSTALLATION WIZARD TYPES
// =============================================================================

export type InstallPriority = 'required' | 'recommended' | 'optional';

export type ComponentCategory =
  | 'runtime'
  | 'version_control'
  | 'ide'
  | 'extension'
  | 'ai_backend'
  | 'container';

export interface InstallComponent {
  id: string;
  name: string;
  description: string;
  priority: InstallPriority;
  category: ComponentCategory;
  is_installed: boolean;
  installed_version?: string;
  install_command?: string;
  verify_command?: string;
  estimated_time?: number; // seconds
}

export interface InstallationPlan {
  steps: InstallStep[];
  total_steps: number;
  estimated_total_time: number;
  custom_paths?: {
    workspace?: string;
    context_dna?: string;
  };
  use_aarons_baseline: boolean;
}

export interface InstallStep {
  order: number;
  component_id: string;
  name: string;
  description: string;
  category: string;
  priority: string;
  install_command?: string;
  verify_command?: string;
  estimated_time: number;
}

export interface InstallStepResult {
  component_id: string;
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped' | 'timeout' | 'error';
  output?: string;
  error?: string;
}

export interface InstallationStatus {
  status: 'idle' | 'analyzing' | 'planning' | 'installing' | 'complete' | 'complete_with_errors' | 'error';
  progress: number;
  current_step?: string | null;
  steps_completed: string[];
  errors: string[];
  plan?: InstallationPlan | null;
}

export interface InstallWizardAnalysis {
  hardware: HardwareInfo | null;
  device: DeviceInfo | null;  // Device fingerprint for AWS security verification
  environment: {
    tools: Record<string, {
      installed: boolean;
      version?: string;
      path?: string;
      install_command?: string;
    }>;
    extensions: Array<{
      id: string;
      name: string;
      installed: boolean;
      required: boolean;
    }>;
    workspaces: string[];
    missing_critical: string[];
    missing_recommended: string[];
    ready_for_context_dna: boolean;
    install_recommendations: string[];
  };
  components: InstallComponent[];
  aarons_baseline: Record<string, any>;
  ready_for_context_dna: boolean;
  missing_required: InstallComponent[];
  // Scan metadata (from concurrent analyzer)
  scan_times?: Record<string, number>;  // Time taken for each scan in seconds
  scan_errors?: string[];  // Any errors during scanning
}

export interface InstallExecutionResult {
  status: string;
  results: InstallStepResult[];
  errors: string[];
  success_count: number;
  total_count: number;
}

export const AVAILABLE_MODELS: AvailableModel[] = [
  // ==========================================================================
  // MLX MODELS (Apple Silicon Native - Recommended)
  // ==========================================================================
  {
    id: 'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit',
    name: 'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit',
    displayName: 'Qwen 2.5 Coder 7B (MLX)',
    description: 'Native Apple Silicon - fastest coding assistant',
    size: '4.2 GB',
    sizeBytes: 4200000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: true,
    tier: 'free',
    backend: 'mlx',
    appleSiliconOnly: true,
  },
  {
    id: 'mlx-community/Qwen2.5-Coder-14B-Instruct-4bit',
    name: 'mlx-community/Qwen2.5-Coder-14B-Instruct-4bit',
    displayName: 'Qwen 2.5 Coder 14B (MLX)',
    description: 'Native Apple Silicon - best quality coding',
    size: '8.5 GB',
    sizeBytes: 8500000000,
    ramRequired: '16 GB',
    category: 'coding',
    recommended: false,
    tier: 'pro',
    backend: 'mlx',
    appleSiliconOnly: true,
  },
  {
    id: 'mlx-community/Qwen2.5-Coder-14B-Instruct-8bit',
    name: 'mlx-community/Qwen2.5-Coder-14B-Instruct-8bit',
    displayName: 'Qwen 2.5 Coder 14B 8-bit (MLX)',
    description: 'Native Apple Silicon - maximum quality',
    size: '14.5 GB',
    sizeBytes: 14500000000,
    ramRequired: '24 GB',
    category: 'coding',
    recommended: false,
    tier: 'advanced',
    backend: 'mlx',
    appleSiliconOnly: true,
  },
  {
    id: 'mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit-mlx',
    name: 'mlx-community/DeepSeek-Coder-V2-Lite-Instruct-4bit-mlx',
    displayName: 'DeepSeek Coder V2 Lite (MLX)',
    description: 'Native Apple Silicon - excellent completion',
    size: '4.0 GB',
    sizeBytes: 4000000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'free',
    backend: 'mlx',
    appleSiliconOnly: true,
  },
  // ==========================================================================
  // OLLAMA MODELS (Cross-Platform)
  // ==========================================================================
  {
    id: 'qwen2.5-coder:7b',
    name: 'qwen2.5-coder:7b',
    displayName: 'Qwen 2.5 Coder 7B (Ollama)',
    description: 'Cross-platform - fast coding assistant',
    size: '4.5 GB',
    sizeBytes: 4500000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'free',
    backend: 'ollama',
  },
  {
    id: 'qwen2.5-coder:14b',
    name: 'qwen2.5-coder:14b',
    displayName: 'Qwen 2.5 Coder 14B (Ollama)',
    description: 'Cross-platform - better reasoning',
    size: '9.0 GB',
    sizeBytes: 9000000000,
    ramRequired: '16 GB',
    category: 'coding',
    recommended: false,
    tier: 'pro',
    backend: 'ollama',
  },
  {
    id: 'llama3.1:8b',
    name: 'llama3.1:8b',
    displayName: 'Llama 3.1 8B (Ollama)',
    description: 'General purpose with strong reasoning',
    size: '4.7 GB',
    sizeBytes: 4700000000,
    ramRequired: '10 GB',
    category: 'general',
    recommended: false,
    tier: 'pro',
    backend: 'ollama',
  },
  {
    id: 'codellama:7b',
    name: 'codellama:7b',
    displayName: 'Code Llama 7B (Ollama)',
    description: 'Meta code generation specialist',
    size: '3.8 GB',
    sizeBytes: 3800000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'free',
    backend: 'ollama',
  },
  {
    id: 'nomic-embed-text',
    name: 'nomic-embed-text',
    displayName: 'Nomic Embed Text (Ollama)',
    description: 'Fast embeddings for semantic search',
    size: '274 MB',
    sizeBytes: 274000000,
    ramRequired: '2 GB',
    category: 'embedding',
    recommended: true,
    tier: 'free',
    backend: 'ollama',
  },
  {
    id: 'deepseek-coder:6.7b',
    name: 'deepseek-coder:6.7b',
    displayName: 'DeepSeek Coder 6.7B (Ollama)',
    description: 'Excellent for code completion',
    size: '3.8 GB',
    sizeBytes: 3800000000,
    ramRequired: '8 GB',
    category: 'coding',
    recommended: false,
    tier: 'advanced',
    backend: 'ollama',
  },
  {
    id: 'llama3.1:70b',
    name: 'llama3.1:70b',
    displayName: 'Llama 3.1 70B (Ollama)',
    description: 'Top-tier reasoning (GPU required)',
    size: '40 GB',
    sizeBytes: 40000000000,
    ramRequired: '48 GB',
    category: 'general',
    recommended: false,
    tier: 'advanced',
    backend: 'ollama',
  },
];
