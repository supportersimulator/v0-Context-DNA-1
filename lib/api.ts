import type {
  Stats,
  Learning,
  ConsultResponse,
  HealthStatus,
  DailyWins,
  InjectionData,
  InjectionHistoryItem,
} from './types';

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

/**
 * Fetch the most recent context injection for visualization.
 * Returns the full injection data including trigger, analysis, silver platter, and raw output.
 */
export async function fetchLatestInjection(): Promise<{ found: boolean; injection?: InjectionData; message?: string }> {
  try {
    const res = await fetch(`${HELPER_API}/api/injection/latest`);
    if (!res.ok) throw new Error('Failed to fetch injection');
    return res.json();
  } catch (error) {
    // Return mock data for development
    return {
      found: true,
      injection: {
        id: 'inj_mock_001',
        timestamp: new Date().toISOString(),
        trigger: {
          hook: 'UserPromptSubmit',
          prompt: 'fix the authentication bug in the login flow',
          session_id: 'demo-session',
        },
        analysis: {
          detected_domains: ['auth', 'security', 'session'],
          risk_level: 'moderate',
          first_try_likelihood: 60,
          generation_time_ms: 209,
          sections_included: ['safety', 'foundation', 'wisdom', 'awareness', 'protocol'],
          ab_variant: 'control',
          mode: 'hybrid',
        },
        silver_platter: {
          safety: {
            found: true,
            content: [
              'NEVER commit secrets (.env, API keys, credentials)',
              'NEVER force push to main/master without explicit permission',
              'NEVER delete production data without backup confirmation',
            ],
          },
          wisdom: {
            the_one_thing: 'Check localStorage first - device tokens often fail to persist due to browser security policies.',
            landmines: [
              { icon: '💣', text: 'Don\'t touch the JWT exchange - it works and is fragile' },
              { icon: '💣', text: 'session.ts:150-200 has subtle race conditions' },
              { icon: '💣', text: 'Supabase auth state can desync with Django tokens' },
            ],
            patterns: [
              { text: 'Auth issues 80% originate in session.ts', file: 'lib/auth/session.ts', lines: '150-200' },
              { text: 'Device token flow: register → link → persist' },
            ],
            context: 'Last auth fix was 3 days ago - device token persistence issue fixed by checking localStorage on init.',
          },
          sops: [
            {
              id: 'sop-auth-debug-001',
              title: 'Auth Debugging SOP',
              summary: 'Step-by-step auth troubleshooting for Context DNA',
              relevance_score: 0.92,
              full_content: '## Auth Debugging SOP\n\n### Step 1: Check localStorage\nOpen DevTools → Application → Local Storage\nLook for: contextdna_device_token, contextdna_device_linked\n\n### Step 2: Verify token exchange\nCheck Network tab for /api/auth/exchange-supabase-token/\nShould return 200 with access token\n\n### Step 3: Test device flow\nClear localStorage, refresh, check console for "[ContextDNA Auth]" logs',
            },
          ],
          protocol: {
            risk_level: 'MODERATE',
            first_try_percent: 60,
            recommendation: 'Query memory if unsure | Record wins on success',
          },
        },
        raw_output: '╔══════════════════════════════════════════════════════════════════════╗\n║  🧬 CONTEXT DNA BLUEPRINT ON SILVER PLATTER                          ║\n║  Risk: moderate | Mode: hybrid | First-try: 60%                      ║\n╚══════════════════════════════════════════════════════════════════════╝\n...',
      },
    };
  }
}

/**
 * Fetch injection history for timeline view.
 */
export async function fetchInjectionHistory(limit = 20): Promise<{ count: number; history: InjectionHistoryItem[] }> {
  try {
    const res = await fetch(`${HELPER_API}/api/injection/history?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch injection history');
    return res.json();
  } catch (error) {
    // Return mock data
    return {
      count: 3,
      history: [
        { id: 'inj_mock_001', timestamp: new Date().toISOString(), prompt: 'fix the authentication bug', risk_level: 'moderate', first_try: '60%' },
        { id: 'inj_mock_002', timestamp: new Date(Date.now() - 3600000).toISOString(), prompt: 'deploy Django to production', risk_level: 'high', first_try: '30%' },
        { id: 'inj_mock_003', timestamp: new Date(Date.now() - 7200000).toISOString(), prompt: 'add button to dashboard', risk_level: 'low', first_try: '90%' },
      ],
    };
  }
}

/**
 * Fetch a specific injection by ID.
 */
export async function fetchInjectionById(injectionId: string): Promise<{ found: boolean; injection?: InjectionData }> {
  try {
    const res = await fetch(`${HELPER_API}/api/injection/${injectionId}`);
    if (!res.ok) throw new Error('Failed to fetch injection');
    return res.json();
  } catch (error) {
    return { found: false };
  }
}

/**
 * Create a WebSocket connection for real-time injection updates.
 * Returns a cleanup function to close the connection.
 */
export function subscribeToInjections(
  onInjection: (data: { id: string; timestamp: string; prompt: string; risk_level: string; first_try: string }) => void,
  onError?: (error: Event) => void
): () => void {
  const wsUrl = HELPER_API.replace('http', 'ws') + '/ws';
  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;

  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'injection_complete' && message.data) {
            onInjection(message.data);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };

      ws.onclose = () => {
        // Attempt to reconnect after 5 seconds
        reconnectTimeout = setTimeout(connect, 5000);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      // Retry in 5 seconds
      reconnectTimeout = setTimeout(connect, 5000);
    }
  };

  connect();

  // Return cleanup function
  return () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (ws) {
      ws.close();
    }
  };
}
