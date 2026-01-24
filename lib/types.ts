export type LearningType = 'win' | 'fix' | 'pattern' | 'sop' | 'insight' | 'gotcha';

export interface Learning {
  id: string;
  type: LearningType;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
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

export type TabId = 'home' | 'activity' | 'professor' | 'search' | 'health';

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

export const LEARNING_TYPE_CONFIG: Record<LearningType, { emoji: string; color: string; label: string }> = {
  win: { emoji: '🏆', color: 'text-type-win', label: 'Win' },
  fix: { emoji: '🔧', color: 'text-type-fix', label: 'Fix' },
  pattern: { emoji: '🔄', color: 'text-type-pattern', label: 'Pattern' },
  sop: { emoji: '📋', color: 'text-type-sop', label: 'SOP' },
  insight: { emoji: '💡', color: 'text-type-insight', label: 'Insight' },
  gotcha: { emoji: '⚠️', color: 'text-type-gotcha', label: 'Gotcha' },
};
