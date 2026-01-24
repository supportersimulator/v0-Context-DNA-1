'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { fetchHealth } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { RefreshCw, Play, Terminal, Loader2 } from 'lucide-react';

interface ServiceConfig {
  key: string;
  name: string;
  icon: string;
  port?: number;
}

const SERVICES: ServiceConfig[] = [
  { key: 'docker', name: 'Docker', icon: '🐳' },
  { key: 'postgresql', name: 'PostgreSQL', icon: '🐘', port: 15432 },
  { key: 'redis', name: 'Redis', icon: '🔴', port: 16379 },
  { key: 'opensearch', name: 'OpenSearch', icon: '🔍', port: 9200 },
  { key: 'jaeger', name: 'Jaeger', icon: '📊', port: 16686 },
  { key: 'ollama', name: 'Ollama', icon: '🦙', port: 11434 },
  { key: 'api', name: 'API Server', icon: '🌐', port: 3456 },
];

const BRAIN_COMPONENTS = [
  'Brain Core',
  'Professor',
  'Context Manager',
  'Query Engine',
  'Pattern Matcher',
  'Learning Store',
];

export function HealthView() {
  const [isStarting, setIsStarting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const { data: health, isLoading, mutate } = useSWR('health', fetchHealth, {
    refreshInterval: 10000,
  });

  const handleStartServices = async () => {
    setIsStarting(true);
    // Simulate starting services
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsStarting(false);
    mutate();
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    // Simulate restarting services
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsRestarting(false);
    mutate();
  };

  const allHealthy = health && Object.values(health).every(Boolean);
  const someHealthy = health && Object.values(health).some(Boolean);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">System Health</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage ContextDNA services
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
              allHealthy && 'bg-success/10 text-success',
              !allHealthy && someHealthy && 'bg-warning/10 text-warning',
              !someHealthy && 'bg-destructive/10 text-destructive'
            )}
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                allHealthy && 'bg-success',
                !allHealthy && someHealthy && 'bg-warning',
                !someHealthy && 'bg-destructive'
              )}
            />
            {allHealthy ? 'All Systems Operational' : someHealthy ? 'Degraded' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Service Status
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {SERVICES.map((service) => {
            const isHealthy = health?.[service.key as keyof typeof health] ?? false;
            
            return (
              <div
                key={service.key}
                className={cn(
                  'glass rounded-lg p-4 transition-all duration-200',
                  'hover:bg-[#1e1e28]',
                  isLoading && 'animate-pulse'
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{service.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {service.name}
                      </span>
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          isHealthy ? 'bg-success' : 'bg-destructive'
                        )}
                      />
                    </div>
                    {service.port && (
                      <span className="text-xs text-muted-foreground">
                        :{service.port}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Brain Systems */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Brain Components
        </h2>
        
        <div className="glass rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {BRAIN_COMPONENTS.map((component) => {
              const isActive = health?.api ?? false;
              
              return (
                <div
                  key={component}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      isActive ? 'bg-success' : 'bg-muted-foreground'
                    )}
                  />
                  <span className={cn(
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {component}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleStartServices}
            disabled={isStarting || allHealthy}
            className="bg-success/10 text-success border border-success/20 hover:bg-success/20"
          >
            {isStarting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Start Services
          </Button>
          
          <Button
            onClick={handleRestart}
            disabled={isRestarting}
            variant="outline"
            className="border-border bg-transparent"
          >
            {isRestarting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Restart
          </Button>
          
          <Button
            onClick={() => setShowLogs(!showLogs)}
            variant="outline"
            className="border-border"
          >
            <Terminal className="w-4 h-4 mr-2" />
            View Logs
          </Button>
        </div>
      </div>

      {/* Logs Modal */}
      {showLogs && (
        <div className="glass rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">System Logs</h3>
            <button
              onClick={() => setShowLogs(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div className="bg-background rounded-lg p-4 font-mono text-xs text-muted-foreground max-h-64 overflow-auto">
            <p className="text-success">[2025-01-24 10:30:15] ContextDNA services starting...</p>
            <p className="text-foreground">[2025-01-24 10:30:16] PostgreSQL: Connected on port 15432</p>
            <p className="text-foreground">[2025-01-24 10:30:17] Redis: Connected on port 16379</p>
            <p className="text-foreground">[2025-01-24 10:30:18] OpenSearch: Connected on port 9200</p>
            <p className="text-foreground">[2025-01-24 10:30:19] Ollama: Connected on port 11434</p>
            <p className="text-success">[2025-01-24 10:30:20] API Server: Running on port 3456</p>
            <p className="text-success">[2025-01-24 10:30:21] All systems operational</p>
          </div>
        </div>
      )}

      {/* Connection Info */}
      <div className="glass rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Connection Details</h3>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Memory API</span>
            <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">http://127.0.0.1:3456</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Helper Agent</span>
            <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">http://127.0.0.1:8080</code>
          </div>
        </div>
      </div>
    </div>
  );
}
