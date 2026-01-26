import type { Stats, Learning, ConsultResponse, HealthStatus, DailyWins, InjectionData, ModelStatus, OllamaModel, ModelDownloadProgress, UserPlan } from './types';

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
  // Calculate stats from Helper Agent's learnings (source of truth)
  try {
    const res = await fetch(`${HELPER_API}/api/learnings/recent?limit=1000`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch learnings: ${res.status}`);
    }
    const data = await res.json();
    const learnings = data.learnings || [];

    // Calculate stats from learnings
    const today = new Date().toISOString().split('T')[0];
    const wins = learnings.filter((l: Learning) => l.type === 'win').length;
    const fixes = learnings.filter((l: Learning) => l.type === 'fix').length;
    const patterns = learnings.filter((l: Learning) => l.type === 'pattern').length;
    const todayCount = learnings.filter((l: Learning) =>
      l.timestamp?.startsWith(today)
    ).length;

    // Calculate streak (days with consecutive activity)
    const uniqueDays = new Set(
      learnings.map((l: Learning) => l.timestamp?.split('T')[0]).filter(Boolean)
    );
    const streak = calculateStreak(Array.from(uniqueDays).sort().reverse() as string[]);

    return {
      total: learnings.length,
      wins,
      fixes,
      patterns,
      today: todayCount,
      streak,
      sops: patterns, // SOPs are patterns
      last_updated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return { total: 0, wins: 0, fixes: 0, patterns: 0, today: 0, streak: 0, sops: 0, last_updated: new Date().toISOString() };
  }
}

// Helper to calculate streak of consecutive days
function calculateStreak(sortedDaysDesc: string[]): number {
  if (sortedDaysDesc.length === 0) return 0;

  let streak = 1;
  const today = new Date().toISOString().split('T')[0];

  // If most recent day isn't today or yesterday, streak is broken
  if (sortedDaysDesc[0] !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (sortedDaysDesc[0] !== yesterday) return 0;
  }

  for (let i = 1; i < sortedDaysDesc.length; i++) {
    const prev = new Date(sortedDaysDesc[i - 1]);
    const curr = new Date(sortedDaysDesc[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000;

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
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
  // Calculate daily wins from Helper Agent's learnings (source of truth)
  try {
    const res = await fetch(`${HELPER_API}/api/learnings/recent?limit=1000`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch learnings: ${res.status}`);
    }
    const data = await res.json();
    const learnings: Learning[] = data.learnings || [];

    // Group wins by date
    const winsByDay: Record<string, Learning[]> = {};
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    for (const learning of learnings) {
      if (learning.type !== 'win' || !learning.timestamp) continue;

      const date = learning.timestamp.split('T')[0];
      if (new Date(date) >= cutoffDate) {
        if (!winsByDay[date]) winsByDay[date] = [];
        winsByDay[date].push(learning);
      }
    }

    // Convert to array format expected by dashboard
    const result: DailyWins[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayWins = winsByDay[dateStr] || [];
      result.push({
        date: dateStr,
        count: dayWins.length,
        wins: dayWins,
      });
    }

    return result.reverse(); // Oldest first
  } catch (error) {
    console.error('Failed to fetch daily wins:', error);
    return [];
  }
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

/**
 * Fetch installed models from Ollama (via Local LLM API proxy to avoid CORS)
 */
export async function fetchInstalledModels(): Promise<OllamaModel[]> {
  try {
    // Use the Local LLM API proxy to avoid CORS issues
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/models`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return data.models || [];
      }
    }
    // Fallback to direct Ollama call if proxy fails
    const ollamaRes = await fetch(`${OLLAMA_API}/api/tags`);
    if (ollamaRes.ok) {
      const ollamaData = await ollamaRes.json();
      return ollamaData.models || [];
    }
    return [];
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
 * Fetch Ollama installation status from backend
 */
async function fetchOllamaInstallStatus(): Promise<{
  running: boolean;
  installed: boolean;
  installPath: string | null;
  hasModels: boolean;
  installMethod: 'brew' | 'download' | 'curl';
}> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      return {
        running: false,
        installed: false,
        installPath: null,
        hasModels: false,
        installMethod: 'download',
      };
    }
    const data = await res.json();
    return {
      running: data.ollama_running ?? false,
      installed: data.ollama_installed ?? false,
      installPath: data.ollama_install_path ?? null,
      hasModels: data.ollama_has_models ?? false,
      installMethod: data.ollama_install_method ?? 'download',
    };
  } catch {
    return {
      running: false,
      installed: false,
      installPath: null,
      hasModels: false,
      installMethod: 'download',
    };
  }
}

/**
 * Fetch full model status (installed models, active model, download progress)
 */
export async function fetchModelStatus(): Promise<ModelStatus> {
  const [installedModels, ollamaStatus, activeModel] = await Promise.all([
    fetchInstalledModels(),
    fetchOllamaInstallStatus(),
    getActiveModel(),
  ]);

  return {
    installedModels,
    activeModel,
    downloadProgress: [], // Will be populated by WebSocket
    ollamaRunning: ollamaStatus.running,
    ollamaInstalled: ollamaStatus.installed,
    ollamaInstallPath: ollamaStatus.installPath,
    ollamaHasModels: ollamaStatus.hasModels,
    ollamaInstallMethod: ollamaStatus.installMethod,
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
// CREDENTIAL MANAGEMENT API
// =============================================================================

export interface CredentialInfo {
  configured: boolean;
  source: 'keychain' | 'environment' | 'session' | null;
  masked_token: string | null;
  display_name: string;
  help_url: string;
}

export interface CredentialsStatus {
  credentials: Record<string, CredentialInfo>;
  storage: {
    type: 'keychain' | 'session';
    backend: string;
    persistent: boolean;
    description: string;
  };
}

/**
 * Get status of all credentials (HuggingFace, OpenAI, etc.)
 */
export async function fetchCredentialsStatus(): Promise<CredentialsStatus> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/credentials`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch credentials: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch credentials status:', error);
    // Return empty state on error
    return {
      credentials: {},
      storage: {
        type: 'session',
        backend: 'unavailable',
        persistent: false,
        description: 'Local LLM server not running',
      },
    };
  }
}

/**
 * Save a credential to secure storage (OS Keychain)
 */
export async function saveCredential(
  service: string,
  token: string
): Promise<{ success: boolean; message: string; masked_token?: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/credentials`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ service, token }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: data.detail || 'Failed to save credential',
      };
    }

    return {
      success: true,
      message: data.message,
      masked_token: data.masked_token,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save credential',
    };
  }
}

/**
 * Delete a credential from secure storage
 */
export async function deleteCredential(
  service: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/credentials/${service}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        message: data.detail || 'Failed to delete credential',
      };
    }

    return {
      success: true,
      message: data.message,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete credential',
    };
  }
}

// =============================================================================
// SYSTEM INFO (Memory Detection for Smart Model Recommendations)
// =============================================================================

export interface SystemMemory {
  total_gb: number;
  available_gb: number;
  used_gb: number;
  percent_used: number;
  cache_reclaimable_gb?: number;  // macOS: how much file cache can be freed
  realistic_available_gb?: number;  // macOS: available + reclaimable cache
}

export interface RecommendedModel {
  model_id: string;
  display_name: string;
  reason: string;
  min_ram_gb: number;
  optimal_ram_gb: number;
  ram_while_running_gb?: number;  // Approximate RAM usage when model is loaded
  is_optimal: boolean;
}

export interface ModelCompatibility {
  fits: boolean;
  optimal: boolean;
  min_ram_gb: number;
  optimal_ram_gb: number;
  status: 'optimal' | 'fits' | 'insufficient_memory';
}

export interface CompetingLLM {
  pid: number | null;
  name: string;
  process_name: string;
  memory_gb: number | null;
  stop_hint: string;
  port?: number;
}

export interface LoadedModel {
  name: string;
  size_gb: number;
  vram_gb: number | null;
}

export interface OllamaInstallStatus {
  installed: boolean;
  running: boolean;
  install_path: string | null;
  has_models: boolean;
  has_ollama_dir: boolean;
  install_method: 'brew' | 'download' | 'curl';
}

export interface DevToolStatus {
  installed: boolean;
  install_path: string | null;
  download_url?: string;
  brew_command?: string;
  install_command?: string;
  npm_command?: string;
  requires?: string;
  category: 'primary' | 'other';
  display_name: string;
  description: string;
}

export interface DevToolsStatus {
  vscode: DevToolStatus;
  claude_code: DevToolStatus;
  chatgpt: DevToolStatus;
  cursor: DevToolStatus;
  windsurf: DevToolStatus;
  claude_desktop: DevToolStatus;
  warp: DevToolStatus;
  has_homebrew: boolean;
}

// Helper type for dev tool keys
export type DevToolKey = 'vscode' | 'claude_code' | 'chatgpt' | 'cursor' | 'windsurf' | 'claude_desktop' | 'warp';

export interface SystemInfo {
  memory: SystemMemory;
  recommended: RecommendedModel;
  potential_recommended: RecommendedModel | null;
  model_compatibility: Record<string, ModelCompatibility>;
  can_run_local_llm: boolean;
  suggestions: string[];
  competing_llms: CompetingLLM[];
  loaded_models: LoadedModel[];
  competing_memory_gb: number;
  potential_available_gb: number;
  ollama?: OllamaInstallStatus;
  dev_tools?: DevToolsStatus;
}

/**
 * Get system information for smart model recommendations.
 * Returns memory stats and which models will fit on this system.
 */
export async function fetchSystemInfo(): Promise<SystemInfo | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/system-info`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch system info: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch system info:', error);
    return null;
  }
}

/**
 * Unload a model from Ollama memory to free RAM.
 * If model is not specified, unloads all loaded models.
 */
export async function unloadModel(model?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/unload-model`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ model }),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to unload model',
    };
  }
}

/**
 * Auto-setup: Download and activate the recommended model for this system.
 */
export async function autoSetupRecommendedModel(
  onProgress?: (progress: ModelDownloadProgress) => void
): Promise<{ success: boolean; model?: string; message: string }> {
  try {
    // First get the recommended model
    const systemInfo = await fetchSystemInfo();
    if (!systemInfo) {
      return { success: false, message: 'Could not detect system capabilities' };
    }

    if (!systemInfo.can_run_local_llm) {
      return {
        success: false,
        message: `Insufficient memory (${systemInfo.memory.available_gb}GB available). Need at least 1GB free.`,
      };
    }

    const recommended = systemInfo.recommended;

    // Download the recommended model
    const success = await downloadModel(recommended.model_id, onProgress);

    if (!success) {
      return { success: false, message: `Failed to download ${recommended.display_name}` };
    }

    // Switch to the new model
    const switched = await switchModel(recommended.model_id);

    if (!switched) {
      return {
        success: true,
        model: recommended.model_id,
        message: `Downloaded ${recommended.display_name} but couldn't set as active`,
      };
    }

    return {
      success: true,
      model: recommended.model_id,
      message: `${recommended.display_name} is ready! ${recommended.reason}`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Auto-setup failed',
    };
  }
}

// =============================================================================
// LOCAL API INFO (For External App Integration)
// =============================================================================

export interface LocalApiEndpoint {
  url: string;
  description: string;
  api_key?: string;
}

export interface LocalApiIntegration {
  name: string;
  setup: string;
  docs: string;
}

export interface LocalApiInfo {
  status: 'ready' | 'offline';
  current_model: string;
  loaded_models: string[];
  endpoints: {
    ollama_native: LocalApiEndpoint;
    openai_compatible: LocalApiEndpoint;
  };
  examples: {
    python_openai: string;
    curl: string;
    continue_dev: {
      description: string;
      config: Record<string, unknown>;
    };
    aider: string;
  };
  integrations: LocalApiIntegration[];
}

/**
 * Get information about using the local LLM with other applications.
 */
export async function fetchLocalApiInfo(): Promise<LocalApiInfo | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/local-api-info`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch local API info: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch local API info:', error);
    return null;
  }
}

/**
 * Auto-configure the entire Context DNA ecosystem to use a downloaded model.
 */
export async function autoConfigureModel(
  model: string,
  options: { configureContextDna?: boolean; enableOpenaiCompat?: boolean } = {}
): Promise<{
  success: boolean;
  message: string;
  configured?: string[];
  errors?: string[];
  openai_compatible_api?: {
    base_url: string;
    model_name: string;
    usage_example: string;
  };
}> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/auto-configure`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model,
        configure_context_dna: options.configureContextDna ?? true,
        enable_openai_compat: options.enableOpenaiCompat ?? true,
      }),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Auto-configure failed',
    };
  }
}

// =============================================================================
// MEMORY MANAGEMENT (macOS RAM Purge)
// =============================================================================

export interface MemoryStats {
  free_gb: number;
  inactive_gb: number;
  file_backed_gb: number;
  purgeable_gb: number;
  speculative_gb: number;
  reclaimable_gb: number;
  page_size: number;
  error?: string;
}

export interface MemoryPurgeInfo {
  title: string;
  summary: string;
  explanation: string;
  what_it_does: string[];
  what_it_does_not_do: string[];
  requires_admin: boolean;
  reason_for_admin: string;
}

export interface MemoryPurgeResult {
  success: boolean;
  freed_gb?: number;
  before?: MemoryStats;
  after?: MemoryStats;
  message?: string;
  user_message?: string;
  error?: string;
}

/**
 * Get current RAM statistics showing free vs reclaimable memory.
 */
export async function fetchMemoryStats(): Promise<MemoryStats | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/memory-stats`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch memory stats: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch memory stats:', error);
    return null;
  }
}

/**
 * Get user-friendly information about what memory purge does.
 * Use this to display an explanation before the user triggers purge.
 */
export async function fetchMemoryPurgeInfo(): Promise<MemoryPurgeInfo | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/memory-purge-info`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch purge info: ${res.status}`);
    }
    return res.json();
  } catch (error) {
    console.error('Failed to fetch memory purge info:', error);
    return null;
  }
}

/**
 * Trigger macOS memory purge to free cached RAM.
 * This will show a native macOS password dialog asking for admin credentials.
 *
 * IMPORTANT: This does NOT delete any files or data - it only asks macOS
 * to release cached memory that was being held "just in case".
 */
export async function purgeMemory(): Promise<MemoryPurgeResult> {
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

/**
 * Get Ollama status (running, loaded models, memory usage).
 */
export async function fetchOllamaStatus(): Promise<{
  running: boolean;
  process_exists: boolean;
  version: string | null;
  loaded_models: Array<{ name: string; size_gb: number }>;
  model_memory_gb: number;
  can_start: boolean;
  can_stop: boolean;
} | null> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/ollama-status`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Start Ollama service.
 */
export async function startOllama(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/ollama-start`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to start Ollama',
    };
  }
}

/**
 * Stop Ollama service.
 */
export async function stopOllama(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/ollama-stop`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to stop Ollama',
    };
  }
}

/**
 * Configure a model for use with Context DNA.
 * This verifies the model is installed, optionally preloads it, and sets it as default.
 */
export async function configureModel(
  model: string,
  options?: { setAsDefault?: boolean; preload?: boolean }
): Promise<{
  success: boolean;
  model: string;
  steps: string[];
  errors: string[];
  message: string;
}> {
  try {
    const res = await fetch(`${LOCAL_LLM_API}/contextdna/llm/configure`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        model,
        set_as_default: options?.setAsDefault ?? true,
        preload: options?.preload ?? true,
      }),
    });
    return res.json();
  } catch (error) {
    return {
      success: false,
      model,
      steps: [],
      errors: [error instanceof Error ? error.message : 'Configuration failed'],
      message: 'Failed to configure model',
    };
  }
}

/**
 * Refresh all model-related data (models, status, system info).
 * Call this when user clicks a refresh button.
 */
export async function refreshAllModelData(): Promise<{
  modelStatus: ModelStatus;
  systemInfo: SystemInfo | null;
}> {
  const [modelStatus, systemInfo] = await Promise.all([
    fetchModelStatus(),
    fetchSystemInfo(),
  ]);
  return { modelStatus, systemInfo };
}
