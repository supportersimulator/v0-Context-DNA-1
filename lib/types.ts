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

export type TabId = 'home' | 'activity' | 'professor' | 'search' | 'health' | 'injection';

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
