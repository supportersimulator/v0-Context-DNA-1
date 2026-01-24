import type { Stats, Learning, ConsultResponse, HealthStatus, DailyWins, InjectionData, InjectionHistoryItem } from './types';

const MEMORY_API = 'http://127.0.0.1:3456';
const HELPER_API = 'http://127.0.0.1:8080';

export async function fetchStats(): Promise<Stats> {
  try {
    const res = await fetch(`${MEMORY_API}/api/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  } catch (error) {
    // Return mock data for development
    return {
      total: 1247,
      wins: 523,
      fixes: 312,
      patterns: 189,
      sops: 45,
      today: 12,
      streak: 47,
      last_updated: new Date().toISOString(),
    };
  }
}

export async function fetchRecent(limit = 10): Promise<{ recent: Learning[] }> {
  try {
    const res = await fetch(`${MEMORY_API}/api/recent?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch recent');
    return res.json();
  } catch (error) {
    // Return mock data for development
    return {
      recent: [
        { id: '1', type: 'win', title: 'Deployed Django to production successfully', content: 'Successfully deployed the Django application with zero downtime using blue-green deployment strategy.', tags: ['django', 'deployment', 'devops'], created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        { id: '2', type: 'fix', title: 'Fixed async boto3 blocking event loop', content: 'The issue was that boto3 was blocking the asyncio event loop. Solution was to use aioboto3 or run boto3 in a thread pool executor.', tags: ['python', 'async', 'aws'], created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() },
        { id: '3', type: 'pattern', title: 'Docker restart doesn\'t reload env vars', content: 'When using docker-compose, environment variables are cached. Need to run docker-compose down && docker-compose up to reload.', tags: ['docker', 'devops'], created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
        { id: '4', type: 'insight', title: 'GPU toggle needs Internal NLB for IP changes', content: 'When toggling GPU instances, the IP changes. Using an internal NLB provides a stable endpoint.', tags: ['aws', 'gpu', 'networking'], created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        { id: '5', type: 'gotcha', title: 'WebRTC requires Cloudflare proxy=false', content: 'WebRTC connections fail when going through Cloudflare proxy. Must set proxy to false for WebRTC domains.', tags: ['webrtc', 'cloudflare', 'networking'], created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
      ],
    };
  }
}

export async function fetchDailyWins(days = 14): Promise<DailyWins[]> {
  try {
    const res = await fetch(`${MEMORY_API}/api/wins/daily?days=${days}`);
    if (!res.ok) throw new Error('Failed to fetch daily wins');
    return res.json();
  } catch (error) {
    // Return mock data for development - last 14 days
    const mockWins: DailyWins[] = [];
    const today = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = Math.floor(Math.random() * 8) + (i === 0 ? 3 : 0);
      
      const wins: Learning[] = [];
      for (let j = 0; j < count; j++) {
        const winTitles = [
          'Implemented caching layer for API responses',
          'Reduced Docker image size by 60%',
          'Fixed flaky test suite',
          'Deployed zero-downtime migration',
          'Optimized database queries',
          'Set up automated backups',
          'Improved CI/CD pipeline speed',
          'Implemented feature flags system',
        ];
        wins.push({
          id: `win-${dateStr}-${j}`,
          type: 'win',
          title: winTitles[Math.floor(Math.random() * winTitles.length)],
          content: 'Successfully completed this task with great results.',
          tags: ['productivity', 'engineering'],
          created_at: new Date(date.getTime() + j * 60 * 60 * 1000).toISOString(),
        });
      }
      
      mockWins.push({ date: dateStr, count, wins });
    }
    
    return mockWins;
  }
}

export async function searchLearnings(query: string, limit = 20): Promise<{ results: Learning[]; count: number }> {
  try {
    const res = await fetch(`${MEMORY_API}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) throw new Error('Failed to search');
    return res.json();
  } catch (error) {
    // Return mock data
    return { results: [], count: 0 };
  }
}

export async function recordLearning(type: 'win' | 'fix' | 'pattern', data: { title: string; content: string; tags: string[] }): Promise<void> {
  try {
    const res = await fetch(`${MEMORY_API}/api/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to record ${type}`);
  } catch (error) {
    console.error(`Error recording ${type}:`, error);
    throw error;
  }
}

export async function consultProfessor(task: string): Promise<ConsultResponse> {
  try {
    const res = await fetch(`${HELPER_API}/consult/unified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: task, mode: 'hybrid' }),
    });
    if (!res.ok) throw new Error('Failed to consult');
    return res.json();
  } catch (error) {
    // Return mock data
    return {
      context: {
        the_one_thing: 'Focus on the core functionality first before optimizing.',
        landmines: [
          'Don\'t forget to handle edge cases in async operations',
          'Watch out for memory leaks in long-running processes',
          'Be careful with database connection pooling',
        ],
        patterns: [
          'Use the repository pattern for data access',
          'Implement circuit breakers for external services',
        ],
        context: 'Based on your previous learnings, you\'ve worked with similar systems before. Remember the async/await gotchas from your boto3 fix.',
      },
    };
  }
}

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${MEMORY_API}/api/health`);
    if (!res.ok) throw new Error('Failed to fetch health');
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
  } catch (error) {
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
}

// =============================================================================
// INJECTION VISUALIZATION API
// =============================================================================

export async function fetchLatestInjection(): Promise<InjectionData | null> {
  try {
    const res = await fetch(`${HELPER_API}/api/injection/latest`);
    if (!res.ok) throw new Error('Failed to fetch latest injection');
    return res.json();
  } catch (error) {
    // Return mock data for development
    return {
      id: 'inj_mock_001',
      timestamp: new Date().toISOString(),
      trigger: {
        hook: 'UserPromptSubmit',
        prompt: 'Help me debug the authentication flow in our Django backend',
        session_id: 'session_abc123',
      },
      analysis: {
        detected_domains: ['auth', 'api', 'database'],
        risk_level: 'moderate',
        first_try_likelihood: '72%',
        generation_time_ms: 847,
        sections_included: ['safety', 'wisdom', 'sops', 'protocol'],
        ab_variant: 'control',
        mode: 'hybrid',
      },
      silver_platter: {
        safety: {
          found: true,
          content: [
            '🚫 NEVER commit credentials or API keys to git',
            '🚫 NEVER disable CSRF protection without explicit approval',
          ],
        },
        wisdom: {
          the_one_thing: 'Django auth issues usually stem from middleware ordering - check MIDDLEWARE in settings.py',
          landmines: [
            { icon: '💣', text: 'Session middleware MUST come before AuthenticationMiddleware' },
            { icon: '💣', text: 'CSRF tokens expire after logout - clear cookies when testing' },
          ],
          patterns: [
            { text: 'Use @login_required decorator consistently', file: 'views.py' },
            { text: 'Check AUTH_USER_MODEL matches your custom user', file: 'settings.py' },
          ],
          context: 'Based on previous sessions, you\'ve worked with Django REST Framework auth. Remember the TokenAuthentication vs SessionAuthentication distinction.',
        },
        sops: [
          {
            id: 'sop_django_auth_debug',
            title: 'Django Authentication Debugging',
            summary: 'Step-by-step process for diagnosing auth issues',
            relevance_score: 0.94,
            full_content: '1. Check MIDDLEWARE ordering\n2. Verify AUTH_USER_MODEL\n3. Test with manage.py shell\n4. Check session backend configuration',
          },
        ],
        protocol: {
          risk_level: 'moderate',
          first_try_percent: 72,
          recommendation: 'Query memory if unsure | Record wins on success',
        },
      },
      raw_output: '╔══════════════════════════════════════════════════════════════╗\n║  🧬 CONTEXT DNA INJECTION                                      ║\n╚══════════════════════════════════════════════════════════════╝\n...',
    };
  }
}

export async function fetchInjectionHistory(limit = 20): Promise<InjectionHistoryItem[]> {
  try {
    const res = await fetch(`${HELPER_API}/api/injection/history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch injection history');
    return res.json();
  } catch (error) {
    // Return mock data for development
    return [
      {
        id: 'inj_mock_001',
        timestamp: new Date().toISOString(),
        prompt: 'Help me debug the authentication flow...',
        risk_level: 'moderate',
        first_try: '72%',
      },
      {
        id: 'inj_mock_002',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        prompt: 'Deploy the Docker containers to production...',
        risk_level: 'high',
        first_try: '45%',
      },
      {
        id: 'inj_mock_003',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        prompt: 'Add a new API endpoint for user preferences...',
        risk_level: 'low',
        first_try: '89%',
      },
    ];
  }
}

export async function fetchInjectionById(id: string): Promise<InjectionData | null> {
  try {
    const res = await fetch(`${HELPER_API}/api/injection/${id}`);
    if (!res.ok) throw new Error('Failed to fetch injection');
    return res.json();
  } catch (error) {
    return null;
  }
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
