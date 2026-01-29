import type { Stats, Learning, ConsultResponse, HealthStatus, DailyWins, InjectionData, OllamaModel, ModelStatus, UserPlan, ModelDownloadProgress } from './types';

// API URLs - configurable via environment variables
const MEMORY_API = process.env.NEXT_PUBLIC_MEMORY_API || 'http://127.0.0.1:3456';
const HELPER_API = process.env.NEXT_PUBLIC_HELPER_API || 'http://127.0.0.1:8080';

// API Authentication token (optional - for production deployments)
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || '';

// WebSocket reconnection limits
const MAX_WS_RECONNECT_ATTEMPTS = 5;

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  }
  return headers;
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${MEMORY_API}/api/stats`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch stats: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchRecent(limit = 10): Promise<{ recent: Learning[] }> {
  const res = await fetch(`${MEMORY_API}/api/recent?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch recent: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchRecentLearnings(limit = 20): Promise<{ count: number; learnings: Learning[] }> {
  const res = await fetch(`${HELPER_API}/api/learnings/recent?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch learnings: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchLearningsForInjection(injectionId: string): Promise<Learning[]> {
  const res = await fetch(`${HELPER_API}/api/learnings/injection/${injectionId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch learnings: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.learnings || [];
}

export async function fetchLearningsSince(timestamp: string, limit = 20): Promise<Learning[]> {
  const res = await fetch(`${HELPER_API}/api/learnings/since/${encodeURIComponent(timestamp)}?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch learnings: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.learnings || [];
}

export function subscribeToLearnings(
  onLearning: (learning: Learning) => void,
  onStatusChange?: (status: ConnectionStatus) => void
): () => void {
  const clientId = generateClientId();
  const wsUrl = `${HELPER_API.replace('http', 'ws')}/ws/learnings?client_id=${clientId}`;

  let ws: WebSocket | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let isManualClose = false;

  const connect = () => {
    if (isManualClose) return;

    // Check max reconnect attempts
    if (reconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
      console.error('WebSocket: Max reconnection attempts reached');
      onStatusChange?.('error');
      return;
    }

    onStatusChange?.('connecting');

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0; // Reset on successful connection
        onStatusChange?.('connected');
        heartbeatInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat', client_id: clientId }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.event === 'learning_captured' && message.data) {
            onLearning(message.data);
          }
        } catch (e) {
          console.error('Failed to parse learning message:', e);
        }
      };

      ws.onclose = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = null;

        if (isManualClose) {
          onStatusChange?.('disconnected');
          return;
        }

        onStatusChange?.('disconnected');

        // Exponential backoff for reconnection (max 30s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        onStatusChange?.('error');
      };
    } catch (e) {
      onStatusChange?.('error');
      // Retry with backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      reconnectTimeout = setTimeout(connect, delay);
    }
  };

  connect();

  return () => {
    isManualClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    ws?.close();
  };
}

export async function fetchDailyWins(days = 14): Promise<DailyWins[]> {
  const res = await fetch(`${MEMORY_API}/api/wins/daily?days=${days}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch daily wins: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function searchLearnings(query: string, limit = 20): Promise<{ results: Learning[]; count: number }> {
  const res = await fetch(`${MEMORY_API}/api/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) {
    throw new Error(`Failed to search: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function recordLearning(type: 'win' | 'fix' | 'pattern', data: { title: string; content: string; tags: string[] }): Promise<void> {
  const res = await fetch(`${MEMORY_API}/api/${type}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to record ${type}: ${res.status} ${res.statusText}`);
  }
}

export async function consultProfessor(task: string): Promise<ConsultResponse> {
  const res = await fetch(`${HELPER_API}/consult/unified`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt: task, mode: 'hybrid' }),
  });
  if (!res.ok) {
    throw new Error(`Failed to consult: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  // Health endpoint doesn't require auth
  const res = await fetch(`${MEMORY_API}/api/health`);
  if (!res.ok) {
    return {
      docker: false,
      postgresql: false,
      redis: false,
      opensearch: false,
      jaeger: false,
      ollama: false,
      api: false,
    };
  }
  const data = await res.json();
  return {
    docker: true,
    postgresql: data.status === 'healthy',
    redis: data.status === 'healthy',
    opensearch: data.status === 'healthy',
    jaeger: true,
    ollama: true,
    api: true,
  };
}

// =============================================================================
// INJECTION VISUALIZATION API
// =============================================================================

export async function fetchLatestInjection(): Promise<InjectionData | null> {
  const res = await fetch(`${HELPER_API}/api/injection/latest`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch latest injection: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // API returns { found: true, injection: {...} } or { found: false, message: "..." }
  if (data.found && data.injection) {
    return data.injection;
  }
  return null;
}

export async function fetchInjectionHistory(limit = 20): Promise<InjectionData[]> {
  const res = await fetch(`${HELPER_API}/api/injection/history?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch injection history: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // API returns { count: N, history: [...] } with full injection data
  return data.history || [];
}

export async function fetchInjectionById(id: string): Promise<InjectionData | null> {
  const res = await fetch(`${HELPER_API}/api/injection/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch injection: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  // API returns { found: true, injection: {...} } or { found: false, message: "..." }
  if (data.found && data.injection) {
    return data.injection;
  }
  return null;
}

// Generate unique client ID for multi-IDE support
function generateClientId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const platform = typeof window !== 'undefined' ? 'web' : 'node';
  return `${platform}_${timestamp}_${random}`;
}

// Connection status type
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface InjectionSubscriptionOptions {
  onInjection: (data: InjectionData) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  clientId?: string; // Optional: provide your own client ID for tracking
}

export function subscribeToInjections(
  optionsOrCallback: InjectionSubscriptionOptions | ((data: InjectionData) => void)
): () => void {
  // Support both old callback-only API and new options API
  const options: InjectionSubscriptionOptions = typeof optionsOrCallback === 'function'
    ? { onInjection: optionsOrCallback }
    : optionsOrCallback;

  const { onInjection, onStatusChange } = options;
  const clientId = options.clientId || generateClientId();

  // WebSocket connection for real-time injection updates
  // Includes client ID for multi-IDE tracking
  const wsUrl = `${HELPER_API.replace('http', 'ws')}/ws/injections?client_id=${clientId}`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let isManualClose = false;

  const updateStatus = (status: ConnectionStatus) => {
    onStatusChange?.(status);
  };

  const connect = () => {
    if (isManualClose) return;

    // Check max reconnect attempts
    if (reconnectAttempts >= MAX_WS_RECONNECT_ATTEMPTS) {
      console.error('WebSocket: Max reconnection attempts reached for injections');
      updateStatus('error');
      return;
    }

    updateStatus('connecting');

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0; // Reset on successful connection
        updateStatus('connected');

        // Send registration message with client metadata
        ws?.send(JSON.stringify({
          type: 'register',
          client_id: clientId,
          platform: typeof window !== 'undefined' ? 'web' : 'electron',
          timestamp: new Date().toISOString(),
        }));

        // Start heartbeat to keep connection alive
        heartbeatInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat', client_id: clientId }));
          }
        }, 30000); // Heartbeat every 30s
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle different message types
          switch (message.event || message.type) {
            case 'injection_complete':
              onInjection(message.data);
              break;
            case 'heartbeat_ack':
              // Heartbeat acknowledged - connection is healthy
              break;
            case 'broadcast':
              // Broadcast from another IDE - still process the injection
              if (message.data) {
                onInjection(message.data);
              }
              break;
          }
        } catch (e) {
          console.error('Failed to parse injection message:', e);
        }
      };

      ws.onclose = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = null;

        if (isManualClose) {
          updateStatus('disconnected');
          return;
        }

        updateStatus('disconnected');

        // Exponential backoff for reconnection (max 30s)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;

        reconnectTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        updateStatus('error');
        ws?.close();
      };
    } catch (error) {
      console.error('Failed to connect to injection WebSocket:', error);
      updateStatus('error');

      // Retry with backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      reconnectTimeout = setTimeout(connect, delay);
    }
  };

  connect();

  // Return cleanup function
  return () => {
    isManualClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (ws) {
      // Send disconnect message before closing
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'disconnect', client_id: clientId }));
      }
      ws.close();
    }
    updateStatus('disconnected');
  };
}

// =============================================================================
// LLM MODELS API
// =============================================================================

const OLLAMA_API = process.env.NEXT_PUBLIC_OLLAMA_API || 'http://127.0.0.1:11434';
const LOCAL_LLM_API = process.env.NEXT_PUBLIC_LOCAL_LLM_API || 'http://127.0.0.1:5043';

// Import types
import type {
  HardwareInfo,
  DeviceInfo,
  WorkspaceAnalysis,
  SystemAnalysis,
  HierarchyProfile,
  InstallWizardAnalysis,
  InstallationPlan,
  InstallationStatus,
  InstallExecutionResult,
} from './types';

/**
 * Fetch installed models from Ollama
 */
export async function fetchInstalledModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status}`);
    }
    const data = await res.json();
    return data.models || [];
  } catch (error) {
    console.error('Failed to fetch installed models:', error);
    return [];
  }
}

/**
 * Check if Ollama is running
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get the currently active model from local LLM server config
 */
export async function getActiveModel(): Promise<string | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.active_model || null;
  } catch {
    // Try to get from Ollama directly if local server not running
    try {
      const models = await fetchInstalledModels();
      // Return first installed model as default
      return models.length > 0 ? models[0].name : null;
    } catch {
      return null;
    }
  }
}

/**
 * Fetch full model status (installed models, active model, download progress)
 */
export async function fetchModelStatus(): Promise<ModelStatus> {
  const [installedModels, ollamaRunning, activeModel] = await Promise.all([
    fetchInstalledModels(),
    checkOllamaHealth(),
    getActiveModel(),
  ]);

  return {
    installedModels,
    activeModel,
    downloadProgress: [], // Will be populated by WebSocket
    ollamaRunning,
  };
}

/**
 * Fetch user's subscription plan/permissions
 */
export async function fetchUserPlan(): Promise<UserPlan> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/plan`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      // Default to free tier if can't fetch
      return {
        tier: 'free',
        canSwitchModels: false,
        canDeleteModels: false,
        maxModels: 1,
      };
    }
    return res.json();
  } catch {
    // Default permissions for development/testing
    return {
      tier: 'advanced', // Dev mode gets full access
      canSwitchModels: true,
      canDeleteModels: true,
      maxModels: 10,
    };
  }
}

/**
 * Download/pull a model from Ollama
 */
export async function downloadModel(
  modelName: string,
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!res.ok) {
      throw new Error(`Failed to start download: ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let downloadedBytes = 0;
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.total) {
            totalBytes = data.total;
          }
          if (data.completed) {
            downloadedBytes = data.completed;
          }

          const progress = totalBytes > 0
            ? Math.round((downloadedBytes / totalBytes) * 100)
            : 0;

          onProgress?.({
            modelId: modelName,
            status: data.status === 'success' ? 'complete' : 'downloading',
            progress,
            downloadedBytes,
            totalBytes,
          });

          if (data.status === 'success') {
            return true;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Model download failed:', error);
    onProgress?.({
      modelId: modelName,
      status: 'error',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: error instanceof Error ? error.message : 'Download failed',
    });
    return false;
  }
}

/**
 * Switch to a different installed model
 */
export async function switchModel(modelName: string): Promise<boolean> {
  try {
    // First verify model is installed
    const models = await fetchInstalledModels();
    const isInstalled = models.some(m => m.name === modelName || m.model === modelName);

    if (!isInstalled) {
      throw new Error(`Model ${modelName} is not installed`);
    }

    // Update local LLM server config
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/switch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ model: modelName }),
    });

    if (!res.ok) {
      // If local server not running, just preload model in Ollama
      const preloadRes = await fetch(`${OLLAMA_API}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: 'test',
          stream: false,
          options: { num_predict: 1 },
        }),
      });
      return preloadRes.ok;
    }

    return true;
  } catch (error) {
    console.error('Failed to switch model:', error);
    return false;
  }
}

/**
 * Delete an installed model
 */
export async function deleteModel(modelName: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_API}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
    });

    return res.ok;
  } catch (error) {
    console.error('Failed to delete model:', error);
    return false;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// =============================================================================
// HARDWARE DETECTION & MEMORY MANAGEMENT
// =============================================================================

/**
 * Fetch hardware information including Apple Silicon detection,
 * Rosetta 2 status, RAM, and model recommendations
 */
export async function fetchHardwareInfo(): Promise<HardwareInfo | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/hardware`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Memory statistics for model loading decisions
 */
export interface MemoryStats {
  total_gb: number;
  available_gb: number;
  used_gb: number;
  percent_used: number;
  cache_reclaimable_gb: number;
  realistic_available_gb: number;
  can_purge: boolean;
  purge_estimate_gb: number;
}

/**
 * Fetch current memory statistics
 */
export async function fetchMemoryStats(): Promise<MemoryStats | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/memory-stats`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Get memory purge info (how much RAM can be freed)
 */
export async function fetchMemoryPurgeInfo(): Promise<{
  can_purge: boolean;
  estimated_free_gb: number;
  requires_admin: boolean;
  platform: string;
} | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/memory-purge-info`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Purge system memory cache (macOS only, requires admin)
 */
export async function purgeMemory(): Promise<{
  success: boolean;
  freed_gb?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/memory-purge`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Memory purge failed',
    };
  }
}

// =============================================================================
// MLX BACKEND API
// =============================================================================

export interface MLXStatus {
  is_apple_silicon: boolean;
  has_metal: boolean;
  is_rosetta: boolean;
  python_arch: string;
  chip_name: string | null;
  ram_gb: number;
  mlx_installed: boolean;
  mlx_version: string | null;
  metal_available?: boolean;
  loaded_models: string[];
  install_instructions: string | null;
  warnings: string[];
}

export interface MLXDownloadResult {
  success: boolean;
  model_id: string;
  message?: string;
  steps: string[];
  errors: string[];
}

export interface MLXConfigureResult {
  success: boolean;
  model_id: string;
  backend: string;
  message?: string;
  steps: string[];
  errors: string[];
}

/**
 * Get MLX backend status - Apple Silicon native inference
 */
export async function fetchMLXStatus(): Promise<MLXStatus | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/mlx/status`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Download an MLX model from HuggingFace
 */
export async function downloadMLXModel(
  modelId: string,
  force = false,
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<MLXDownloadResult> {
  try {
    // Set initial progress
    onProgress?.({
      modelId,
      status: 'downloading',
      progress: 10,
      downloadedBytes: 0,
      totalBytes: 0,
    });

    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/mlx/download`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ model_id: modelId, force }),
    });

    const result = await res.json();

    if (result.success) {
      onProgress?.({
        modelId,
        status: 'complete',
        progress: 100,
        downloadedBytes: 0,
        totalBytes: 0,
      });
    } else {
      onProgress?.({
        modelId,
        status: 'error',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        error: result.errors?.join(', ') || 'Download failed',
      });
    }

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Download failed';
    onProgress?.({
      modelId,
      status: 'error',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      error: errorMsg,
    });
    return {
      success: false,
      model_id: modelId,
      steps: [],
      errors: [errorMsg],
    };
  }
}

/**
 * Configure an MLX model as the active model
 */
export async function configureMLXModel(
  modelId: string,
  options: { preload?: boolean; setAsDefault?: boolean } = {}
): Promise<MLXConfigureResult> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/mlx/configure`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model_id: modelId,
        preload: options.preload ?? false,
        set_as_default: options.setAsDefault ?? true,
      }),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      model_id: modelId,
      backend: 'mlx',
      steps: [],
      errors: [error instanceof Error ? error.message : 'Configuration failed'],
    };
  }
}

/**
 * Unload MLX model(s) from memory
 */
export async function unloadMLXModel(modelId?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/mlx/unload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ model_id: modelId }),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unload failed',
    };
  }
}

// =============================================================================
// INFERENCE TEST API
// =============================================================================

export interface InferenceRequest {
  prompt: string;
  system?: string;
  model_ref?: string;
  backend?: 'mlx' | 'ollama' | 'llamacpp';
  max_tokens?: number;
}

export interface InferenceResult {
  result: string;
  backend: string;
  user_mode?: string;
  is_staff?: boolean;
  is_beta_user?: boolean;
  error?: string;
}

/**
 * Test inference with local LLM
 * For development: uses direct Ollama API
 * For production: would use /contextdna/llm/infer with auth
 */
export async function testInference(request: InferenceRequest): Promise<InferenceResult> {
  const { prompt, system, model_ref, backend = 'ollama', max_tokens = 512 } = request;

  // For development, use direct Ollama API (no auth required)
  // This bypasses the authenticated /infer endpoint
  if (backend === 'ollama') {
    try {
      const res = await fetch(`${OLLAMA_API}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model_ref || 'qwen2.5-coder:7b',
          prompt: system ? `System: ${system}\n\nUser: ${prompt}` : prompt,
          stream: false,
          options: {
            num_predict: max_tokens,
            temperature: 0.7,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        return { result: '', backend: 'ollama', error: `Ollama error: ${error}` };
      }

      const data = await res.json();
      return {
        result: data.response || '',
        backend: 'ollama',
      };
    } catch (error) {
      return {
        result: '',
        backend: 'ollama',
        error: error instanceof Error ? error.message : 'Inference failed',
      };
    }
  }

  // For MLX, use the local LLM API (requires server running)
  if (backend === 'mlx') {
    try {
      const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/mlx/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          prompt,
          system,
          model_id: model_ref,
          max_tokens,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        return { result: '', backend: 'mlx', error: `MLX error: ${error}` };
      }

      const data = await res.json();
      return {
        result: data.result || data.response || '',
        backend: 'mlx',
      };
    } catch (error) {
      return {
        result: '',
        backend: 'mlx',
        error: error instanceof Error ? error.message : 'MLX inference failed',
      };
    }
  }

  return { result: '', backend, error: `Unsupported backend: ${backend}` };
}

// =============================================================================
// WORKSPACE & DEVICE ANALYSIS API
// =============================================================================

/**
 * Perform comprehensive system analysis: device info + hardware + workspace
 * This is the main entry point for the "Analyze System" button
 */
export async function analyzeSystem(workspacePath?: string): Promise<SystemAnalysis> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/system/analyze`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ workspace_path: workspacePath }),
    });
    if (!res.ok) {
      throw new Error(`System analysis failed: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    // Fallback: try to get individual components
    const [device, hardware] = await Promise.all([
      fetchDeviceInfo().catch(() => null),
      fetchHardwareInfo().catch(() => null),
    ]);

    return {
      device: device || {
        device_id: 'unknown',
        machine_id: 'unknown',
        fingerprint: 'unknown',
        os: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        os_version: 'unknown',
        arch: 'unknown',
        hostname: 'unknown',
        username: 'unknown',
      },
      hardware,
      workspace: null,
    };
  }
}

/**
 * Fetch device identification info (fingerprint, device ID, OS details)
 */
export async function fetchDeviceInfo(): Promise<DeviceInfo> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/device/info`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('Failed to fetch device info');
    return res.json();
  } catch {
    // Return basic info from browser if server unavailable
    return {
      device_id: 'browser_' + Math.random().toString(36).substring(2, 10),
      machine_id: 'unknown',
      fingerprint: 'unknown',
      os: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      os_version: 'unknown',
      arch: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('arm') ? 'arm64' : 'x64') : 'unknown',
      hostname: 'unknown',
      username: 'unknown',
    };
  }
}

/**
 * Analyze workspace/codebase structure
 */
export async function analyzeWorkspace(rootPath?: string): Promise<WorkspaceAnalysis> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/workspace/analyze`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ root_path: rootPath }),
    });
    if (!res.ok) throw new Error('Workspace analysis failed');
    return res.json();
  } catch (error) {
    return {
      status: 'error',
      profile: null,
      questions: [],
      suggestions: [],
      error: error instanceof Error ? error.message : 'Analysis failed',
    };
  }
}

/**
 * Save confirmed hierarchy profile to PostgreSQL
 */
export async function saveHierarchyProfile(profile: HierarchyProfile): Promise<{ success: boolean; version: number }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/hierarchy/save`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error('Failed to save hierarchy');
    return res.json();
  } catch (error) {
    return { success: false, version: 0 };
  }
}

/**
 * Get saved hierarchy profile from PostgreSQL
 */
export async function fetchHierarchyProfile(): Promise<HierarchyProfile | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/hierarchy/current`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || null;
  } catch {
    return null;
  }
}

/**
 * List hierarchy profile versions (for rollback)
 */
export async function listHierarchyVersions(limit = 10): Promise<Array<{
  version: number;
  created_at: string;
  source: string;
  notes?: string;
}>> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/hierarchy/versions?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.versions || [];
  } catch {
    return [];
  }
}

/**
 * Answer a clarifying question during workspace analysis
 */
export async function answerClarifyingQuestion(
  questionId: string,
  answer: string
): Promise<WorkspaceAnalysis> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/workspace/answer`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ question_id: questionId, answer }),
    });
    if (!res.ok) throw new Error('Failed to submit answer');
    return res.json();
  } catch (error) {
    return {
      status: 'error',
      profile: null,
      questions: [],
      suggestions: [],
      error: error instanceof Error ? error.message : 'Failed to submit answer',
    };
  }
}

/**
 * Check hardware and memory compatibility for a specific model
 */
export function checkModelCompatibility(
  hardware: HardwareInfo | null,
  memory: MemoryStats | null,
  model: { backend: string; ramRequired: string; appleSiliconOnly?: boolean }
): {
  compatible: boolean;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!hardware) {
    issues.push('Unable to detect hardware - local LLM server may not be running');
    return { compatible: false, issues, warnings };
  }

  // Check Apple Silicon requirement
  if (model.appleSiliconOnly && !hardware.is_apple_silicon) {
    issues.push('This model requires Apple Silicon (M1/M2/M3/M4/M5)');
  }

  // Check MLX backend availability
  if (model.backend === 'mlx' && !hardware.mlx_available) {
    if (hardware.is_apple_silicon) {
      warnings.push('MLX not installed - run the installer to enable Apple Silicon acceleration');
    } else {
      issues.push('MLX requires Apple Silicon - use an Ollama model instead');
    }
  }

  // Check Ollama availability
  if (model.backend === 'ollama' && !hardware.ollama_available) {
    warnings.push('Ollama not running - start Ollama to use this model');
  }

  // Check Rosetta 2 warning for MLX
  if (model.backend === 'mlx' && hardware.is_rosetta) {
    warnings.push(
      'Python is running under Rosetta 2 - MLX requires native ARM64 Python for GPU acceleration'
    );
  }

  // Check RAM requirements
  const ramRequired = parseInt(model.ramRequired.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(ramRequired)) {
    const availableRam = memory?.realistic_available_gb ?? hardware.ram_gb;

    if (ramRequired > hardware.ram_gb) {
      issues.push(`Model requires ${ramRequired}GB RAM but system only has ${hardware.ram_gb}GB`);
    } else if (memory && ramRequired > availableRam) {
      if (memory.can_purge && memory.purge_estimate_gb > 0) {
        warnings.push(
          `Low available RAM (${availableRam.toFixed(1)}GB). ` +
          `Purging cache could free ~${memory.purge_estimate_gb.toFixed(1)}GB.`
        );
      } else {
        warnings.push(
          `Low available RAM (${availableRam.toFixed(1)}GB). ` +
          `Close other applications before loading this model.`
        );
      }
    }
  }

  return {
    compatible: issues.length === 0,
    issues,
    warnings,
  };
}

// =============================================================================
// INSTALLATION WIZARD API
// =============================================================================

/**
 * Phase 1: Analyze system for installation wizard
 * Returns hardware, environment, components, and Aaron's baseline recommendations
 */
export async function installWizardAnalyze(): Promise<InstallWizardAnalysis> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/install/wizard/analyze`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`Install wizard analysis failed: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Analysis failed');
  }
}

/**
 * Phase 2: Generate installation plan based on user selections
 */
export async function installWizardPlan(options: {
  selected_components: string[];
  use_aarons_baseline?: boolean;
  custom_paths?: {
    workspace?: string;
    context_dna?: string;
  };
}): Promise<{ plan: InstallationPlan; ready: boolean }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/install/wizard/plan`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        selected_components: options.selected_components,
        use_aarons_baseline: options.use_aarons_baseline ?? true,
        custom_paths: options.custom_paths,
      }),
    });
    if (!res.ok) {
      throw new Error(`Install wizard plan failed: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Plan generation failed');
  }
}

/**
 * Phase 3: Execute the installation plan
 */
export async function installWizardExecute(options?: {
  dry_run?: boolean;
  skip_installed?: boolean;
}): Promise<InstallExecutionResult> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/install/wizard/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        dry_run: options?.dry_run ?? false,
        skip_installed: options?.skip_installed ?? true,
      }),
    });
    if (!res.ok) {
      throw new Error(`Install wizard execution failed: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Execution failed');
  }
}

/**
 * Get current installation status
 */
export async function installWizardStatus(): Promise<InstallationStatus> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/install/wizard/status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Install wizard status failed: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    return {
      status: 'error',
      progress: 0,
      current_step: null,
      steps_completed: [],
      errors: [error instanceof Error ? error.message : 'Status check failed'],
      plan: null,
    };
  }
}

/**
 * Reset installation wizard state
 */
export async function installWizardReset(): Promise<{ status: string; message: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/install/wizard/reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Install wizard reset failed: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Reset failed',
    };
  }
}
