import type { Stats, Learning, ConsultResponse, HealthStatus, DailyWins } from './types';

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
