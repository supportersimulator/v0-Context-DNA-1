'use client';

import { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceDefinition {
  /** Unique service ID — e.g. 'context-dna', 'vllm-mlx', 'redis' */
  id: string;
  /** Human-readable name — e.g. 'Context DNA Backend' */
  name: string;
  /** Full health endpoint URL */
  healthUrl: string;
  /** Polling interval in ms (default 30000) */
  pollInterval: number;
  /** If true, going offline triggers a degraded-mode warning */
  critical: boolean;
  /** Fetch timeout in ms (default 5000) */
  timeout: number;
}

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'offline' | 'unknown';

export interface ServiceStatus {
  id: string;
  name: string;
  status: ServiceHealthStatus;
  lastChecked: number;
  /** Response latency in ms, -1 if offline */
  latency: number;
  error?: string;
  consecutiveFailures: number;
}

type StatusChangeHandler = (status: ServiceStatus) => void;

// ---------------------------------------------------------------------------
// Default services — the services the IDE depends on
// ---------------------------------------------------------------------------

export const DEFAULT_SERVICES: ServiceDefinition[] = [
  {
    id: 'context-dna',
    name: 'Context DNA',
    healthUrl: 'http://127.0.0.1:3456/api/health',
    pollInterval: 30_000,
    critical: true,
    timeout: 5_000,
  },
  {
    id: 'vllm-mlx',
    name: 'Local LLM (Qwen3)',
    healthUrl: 'http://127.0.0.1:5044/health',
    pollInterval: 60_000,
    critical: false,
    timeout: 5_000,
  },
  {
    id: 'agent-service',
    name: 'Agent Service',
    healthUrl: 'http://127.0.0.1:3456/api/health',
    pollInterval: 30_000,
    critical: true,
    timeout: 5_000,
  },
];

// ---------------------------------------------------------------------------
// Backoff strategy for consecutive failures
// ---------------------------------------------------------------------------

function backoffMultiplier(failures: number): number {
  // 1x, 1x, 2x, 4x, 8x — capped at 8x
  if (failures < 2) return 1;
  return Math.min(Math.pow(2, failures - 1), 8);
}

// ---------------------------------------------------------------------------
// ServiceRegistry — singleton service health monitor
//
// Design:
//   - Registers service definitions (with sensible defaults)
//   - Polls each service's health endpoint at its configured interval
//   - Applies exponential backoff on consecutive failures
//   - Emits status change events via subscriber pattern
//   - SSR-safe: no fetch during server render, no timers created
//   - Memory-safe: all intervals cleared on stop/dispose
// ---------------------------------------------------------------------------

export class ServiceRegistry {
  private static instance: ServiceRegistry | null = null;

  private services = new Map<string, ServiceDefinition>();
  private statuses = new Map<string, ServiceStatus>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private handlers = new Set<StatusChangeHandler>();
  private monitoring = false;

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  register(service: ServiceDefinition): void {
    this.services.set(service.id, service);

    // Initialize status if not already present
    if (!this.statuses.has(service.id)) {
      this.statuses.set(service.id, {
        id: service.id,
        name: service.name,
        status: 'unknown',
        lastChecked: 0,
        latency: -1,
        consecutiveFailures: 0,
      });
    }

    // If already monitoring, start polling this service immediately
    if (this.monitoring) {
      this.scheduleCheck(service.id, 0);
    }
  }

  unregister(id: string): void {
    this.services.delete(id);
    this.statuses.delete(id);
    this.clearTimer(id);
  }

  // -----------------------------------------------------------------------
  // Status queries
  // -----------------------------------------------------------------------

  getStatus(id: string): ServiceStatus {
    return (
      this.statuses.get(id) ?? {
        id,
        name: id,
        status: 'unknown' as const,
        lastChecked: 0,
        latency: -1,
        consecutiveFailures: 0,
      }
    );
  }

  getAllStatuses(): ServiceStatus[] {
    return Array.from(this.statuses.values());
  }

  getServiceDefinition(id: string): ServiceDefinition | undefined {
    return this.services.get(id);
  }

  // -----------------------------------------------------------------------
  // Monitoring lifecycle
  // -----------------------------------------------------------------------

  startMonitoring(): void {
    if (this.monitoring) return;
    if (typeof window === 'undefined') return; // SSR guard

    this.monitoring = true;

    // Kick off initial health check for every registered service
    for (const id of this.services.keys()) {
      this.scheduleCheck(id, 0);
    }
  }

  stopMonitoring(): void {
    this.monitoring = false;
    for (const id of this.timers.keys()) {
      this.clearTimer(id);
    }
  }

  // -----------------------------------------------------------------------
  // Subscriptions
  // -----------------------------------------------------------------------

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  // -----------------------------------------------------------------------
  // Force immediate health check
  // -----------------------------------------------------------------------

  async checkNow(id?: string): Promise<void> {
    if (typeof window === 'undefined') return; // SSR guard

    if (id) {
      await this.performCheck(id);
    } else {
      // Check all services in parallel
      const ids = Array.from(this.services.keys());
      await Promise.allSettled(ids.map((serviceId) => this.performCheck(serviceId)));
    }
  }

  // -----------------------------------------------------------------------
  // Internal: schedule next check with backoff
  // -----------------------------------------------------------------------

  private scheduleCheck(id: string, delayMs: number): void {
    this.clearTimer(id);

    const timer = setTimeout(async () => {
      await this.performCheck(id);

      // Schedule next check if still monitoring
      if (this.monitoring && this.services.has(id)) {
        const service = this.services.get(id)!;
        const status = this.statuses.get(id);
        const failures = status?.consecutiveFailures ?? 0;
        const nextDelay = service.pollInterval * backoffMultiplier(failures);
        this.scheduleCheck(id, nextDelay);
      }
    }, delayMs);

    this.timers.set(id, timer);
  }

  // -----------------------------------------------------------------------
  // Internal: perform a single health check
  // -----------------------------------------------------------------------

  private async performCheck(id: string): Promise<void> {
    const service = this.services.get(id);
    if (!service) return;

    const prevStatus = this.statuses.get(id);
    const prevState = prevStatus?.status ?? 'unknown';

    const start = performance.now();
    let newStatus: ServiceStatus;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), service.timeout);

      const response = await fetch(service.healthUrl, {
        signal: controller.signal,
        // Prevent caching of health checks
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      const latency = Math.round(performance.now() - start);

      if (response.ok) {
        newStatus = {
          id: service.id,
          name: service.name,
          status: 'healthy',
          lastChecked: Date.now(),
          latency,
          consecutiveFailures: 0,
        };
      } else {
        const failures = (prevStatus?.consecutiveFailures ?? 0) + 1;
        newStatus = {
          id: service.id,
          name: service.name,
          // First failure = degraded, 3+ = offline
          status: failures >= 3 ? 'offline' : 'degraded',
          lastChecked: Date.now(),
          latency,
          error: `HTTP ${response.status}: ${response.statusText}`,
          consecutiveFailures: failures,
        };
      }
    } catch (err) {
      const failures = (prevStatus?.consecutiveFailures ?? 0) + 1;
      const errorMessage =
        err instanceof DOMException && err.name === 'AbortError'
          ? `Timeout after ${service.timeout}ms`
          : err instanceof Error
            ? err.message
            : 'Unknown error';

      newStatus = {
        id: service.id,
        name: service.name,
        status: failures >= 3 ? 'offline' : 'degraded',
        lastChecked: Date.now(),
        latency: -1,
        error: errorMessage,
        consecutiveFailures: failures,
      };
    }

    // Store the new status
    this.statuses.set(id, newStatus);

    // Only emit if status actually changed OR on first check
    if (newStatus.status !== prevState) {
      this.emitStatusChange(newStatus);
    }
  }

  // -----------------------------------------------------------------------
  // Internal: emit to all subscribers
  // -----------------------------------------------------------------------

  private emitStatusChange(status: ServiceStatus): void {
    const snapshot = Array.from(this.handlers);
    for (const handler of snapshot) {
      try {
        handler(status);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[ServiceRegistry] Handler error:', err);
        }
      }
    }

    // Emit to EventBus if available
    this.emitToEventBus(status);
  }

  // -----------------------------------------------------------------------
  // EventBus integration — graceful degradation if EventBus not available
  // -----------------------------------------------------------------------

  private emitToEventBus(status: ServiceStatus): void {
    try {
      // Dynamic import to avoid circular dependencies and degrade gracefully
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getEventBus } = require('@/lib/ide/event-bus');
      const bus = getEventBus();

      // Emit connection status change
      bus.emit('connection:status-changed', {
        connected: status.status === 'healthy',
        endpoint: this.services.get(status.id)?.healthUrl ?? status.id,
        serviceId: status.id,
      });

      // Emit notification for critical services going offline
      const service = this.services.get(status.id);
      if (service?.critical && status.status === 'offline') {
        bus.emit('notification:new', {
          id: `service-offline-${status.id}`,
          type: 'error' as const,
          title: `${status.name} is offline`,
        });
      }

      // Emit recovery notification when a service transitions to healthy.
      // emitStatusChange() is only called on state changes, so reaching
      // 'healthy' here means the service was previously unhealthy.
      if (status.status === 'healthy') {
        bus.emit('notification:new', {
          id: `service-recovered-${status.id}`,
          type: 'success' as const,
          title: `${status.name} reconnected`,
        });
      }
    } catch {
      // EventBus not available — degrade silently
    }
  }

  // -----------------------------------------------------------------------
  // Internal: clear a scheduled timer
  // -----------------------------------------------------------------------

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  // -----------------------------------------------------------------------
  // Dispose — tear down everything
  // -----------------------------------------------------------------------

  dispose(): void {
    this.stopMonitoring();
    this.services.clear();
    this.statuses.clear();
    this.handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton accessor
// ---------------------------------------------------------------------------

let _registry: ServiceRegistry | null = null;

export function getServiceRegistry(): ServiceRegistry {
  if (!_registry) {
    _registry = ServiceRegistry.getInstance();

    // Register default services
    for (const svc of DEFAULT_SERVICES) {
      _registry.register(svc);
    }
  }
  return _registry;
}

/**
 * Reset the singleton (for testing only).
 */
export function _resetServiceRegistry(): void {
  if (_registry) {
    _registry.dispose();
    _registry = null;
  }
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * useServiceRegistry — returns the singleton registry.
 * Starts monitoring on mount, does NOT stop on unmount (singleton lifecycle).
 */
export function useServiceRegistry(): ServiceRegistry {
  const registryRef = useRef<ServiceRegistry>(getServiceRegistry());

  useEffect(() => {
    const registry = registryRef.current;
    registry.startMonitoring();
    // Singleton — don't stop monitoring on unmount.
    // Other components may still depend on it.
  }, []);

  return registryRef.current;
}

/**
 * useServiceHealth — subscribe to a specific service's health status.
 * Re-renders only when that service's status changes.
 */
export function useServiceHealth(serviceId: string): ServiceStatus {
  const registry = useServiceRegistry();
  const [status, setStatus] = useState<ServiceStatus>(() =>
    registry.getStatus(serviceId),
  );

  useEffect(() => {
    // Set initial
    setStatus(registry.getStatus(serviceId));

    // Subscribe to changes
    const unsub = registry.onStatusChange((updated) => {
      if (updated.id === serviceId) {
        setStatus(updated);
      }
    });

    return unsub;
  }, [registry, serviceId]);

  return status;
}

/**
 * useAllServiceStatuses — subscribe to ALL service statuses.
 * Re-renders when any service changes.
 */
export function useAllServiceStatuses(): ServiceStatus[] {
  const registry = useServiceRegistry();
  const [statuses, setStatuses] = useState<ServiceStatus[]>(() =>
    registry.getAllStatuses(),
  );

  useEffect(() => {
    setStatuses(registry.getAllStatuses());

    const unsub = registry.onStatusChange(() => {
      setStatuses(registry.getAllStatuses());
    });

    return unsub;
  }, [registry]);

  return statuses;
}

/**
 * useServiceHealthSummary — derived summary for status bar or overview components.
 */
export function useServiceHealthSummary(): {
  allHealthy: boolean;
  criticalDown: boolean;
  degradedCount: number;
  offlineCount: number;
} {
  const registry = useServiceRegistry();
  const [summary, setSummary] = useState(() => computeSummary(registry));

  useEffect(() => {
    setSummary(computeSummary(registry));

    const unsub = registry.onStatusChange(() => {
      setSummary(computeSummary(registry));
    });

    return unsub;
  }, [registry]);

  return summary;
}

function computeSummary(registry: ServiceRegistry) {
  const statuses = registry.getAllStatuses();
  const degradedCount = statuses.filter((s) => s.status === 'degraded').length;
  const offlineCount = statuses.filter((s) => s.status === 'offline').length;

  // Check if any critical service is down
  const criticalDown = statuses.some((s) => {
    const def = registry.getServiceDefinition(s.id);
    return def?.critical && (s.status === 'offline' || s.status === 'degraded');
  });

  return {
    allHealthy: degradedCount === 0 && offlineCount === 0,
    criticalDown,
    degradedCount,
    offlineCount,
  };
}
