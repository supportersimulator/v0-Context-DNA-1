// ---------------------------------------------------------------------------
// Model Catalog — single source of truth for all AI providers and models.
// Inspired by Cursor's Settings → Models panel.
// ---------------------------------------------------------------------------

export type ProviderId = 'anthropic' | 'openai' | 'deepseek' | 'google' | 'bedrock' | 'local' | 'huggingface';

export interface ProviderDef {
  id: ProviderId;
  name: string;
  envKey: string;
  baseUrlConfigurable: boolean;
  defaultBaseUrl?: string;
}

export interface ModelDef {
  id: string;                 // unique: 'anthropic/opus', 'deepseek/chat'
  provider: ProviderId;
  displayName: string;
  apiModelId: string;         // actual string sent to API
  costPerMInput: number;      // $ per million input tokens
  costPerMOutput: number;     // $ per million output tokens
  supportsSubscription: boolean;
  supportsApi: boolean;
  category: 'coding' | 'general' | 'reasoning';
  defaultEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrlConfigurable: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrlConfigurable: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrlConfigurable: true,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    envKey: 'HF_TOKEN',
    baseUrlConfigurable: true,
    defaultBaseUrl: 'https://api-inference.huggingface.co',
  },
];

// ---------------------------------------------------------------------------
// Model Catalog
// ---------------------------------------------------------------------------

export const MODEL_CATALOG: ModelDef[] = [
  // ── Anthropic ──
  {
    id: 'anthropic/opus',
    provider: 'anthropic',
    displayName: 'Opus 4.6',
    apiModelId: 'claude-opus-4-6',
    costPerMInput: 15.0,
    costPerMOutput: 75.0,
    supportsSubscription: true,
    supportsApi: true,
    category: 'general',
    defaultEnabled: true,
  },
  {
    id: 'anthropic/sonnet',
    provider: 'anthropic',
    displayName: 'Sonnet 4.5',
    apiModelId: 'claude-sonnet-4-5-20250929',
    costPerMInput: 3.0,
    costPerMOutput: 15.0,
    supportsSubscription: true,
    supportsApi: true,
    category: 'coding',
    defaultEnabled: true,
  },
  {
    id: 'anthropic/haiku',
    provider: 'anthropic',
    displayName: 'Haiku 4.5',
    apiModelId: 'claude-haiku-4-5-20251001',
    costPerMInput: 0.25,
    costPerMOutput: 1.25,
    supportsSubscription: true,
    supportsApi: true,
    category: 'coding',
    defaultEnabled: false,
  },

  // ── DeepSeek ──
  {
    id: 'deepseek/chat',
    provider: 'deepseek',
    displayName: 'DeepSeek Chat',
    apiModelId: 'deepseek-chat',
    costPerMInput: 0.28,
    costPerMOutput: 0.42,
    supportsSubscription: false,
    supportsApi: true,
    category: 'coding',
    defaultEnabled: false,
  },
  {
    id: 'deepseek/reasoner',
    provider: 'deepseek',
    displayName: 'DeepSeek Reasoner',
    apiModelId: 'deepseek-reasoner',
    costPerMInput: 0.55,
    costPerMOutput: 2.19,
    supportsSubscription: false,
    supportsApi: true,
    category: 'reasoning',
    defaultEnabled: false,
  },

  // ── OpenAI ──
  {
    id: 'openai/gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    apiModelId: 'gpt-4o',
    costPerMInput: 2.5,
    costPerMOutput: 10.0,
    supportsSubscription: false,
    supportsApi: true,
    category: 'general',
    defaultEnabled: false,
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    apiModelId: 'gpt-4o-mini',
    costPerMInput: 0.15,
    costPerMOutput: 0.60,
    supportsSubscription: false,
    supportsApi: true,
    category: 'coding',
    defaultEnabled: false,
  },
  {
    id: 'openai/o1',
    provider: 'openai',
    displayName: 'o1',
    apiModelId: 'o1',
    costPerMInput: 15.0,
    costPerMOutput: 60.0,
    supportsSubscription: false,
    supportsApi: true,
    category: 'reasoning',
    defaultEnabled: false,
  },

  // ── HuggingFace (Inference API) ──
  {
    id: 'huggingface/qwen2.5-72b',
    provider: 'huggingface',
    displayName: 'Qwen 2.5 72B',
    apiModelId: 'Qwen/Qwen2.5-72B-Instruct',
    costPerMInput: 0,
    costPerMOutput: 0,
    supportsSubscription: false,
    supportsApi: true,
    category: 'general',
    defaultEnabled: false,
  },
  {
    id: 'huggingface/llama-3.1-8b',
    provider: 'huggingface',
    displayName: 'Llama 3.1 8B',
    apiModelId: 'meta-llama/Llama-3.1-8B-Instruct',
    costPerMInput: 0,
    costPerMOutput: 0,
    supportsSubscription: false,
    supportsApi: true,
    category: 'general',
    defaultEnabled: false,
  },
  {
    id: 'huggingface/mistral-7b',
    provider: 'huggingface',
    displayName: 'Mistral 7B',
    apiModelId: 'mistralai/Mistral-7B-Instruct-v0.3',
    costPerMInput: 0,
    costPerMOutput: 0,
    supportsSubscription: false,
    supportsApi: true,
    category: 'coding',
    defaultEnabled: false,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getProvider(id: ProviderId): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getModel(id: string): ModelDef | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function getEnabledModels(
  enabledOverrides: Record<string, boolean>,
): ModelDef[] {
  return MODEL_CATALOG.filter(
    (m) => enabledOverrides[m.id] ?? m.defaultEnabled,
  );
}

export function groupByProvider(
  models: ModelDef[],
): Record<ProviderId, ModelDef[]> {
  const groups: Partial<Record<ProviderId, ModelDef[]>> = {};
  for (const m of models) {
    if (!groups[m.provider]) groups[m.provider] = [];
    groups[m.provider]!.push(m);
  }
  return groups as Record<ProviderId, ModelDef[]>;
}
