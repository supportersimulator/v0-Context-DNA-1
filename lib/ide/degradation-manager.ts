'use client';

import { useState, useEffect, useRef } from 'react';
import {
  getServiceRegistry,
  type ServiceStatus,
  type ServiceHealthStatus,
} from './service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DegradationStrategy = 'disable' | 'fallback' | 'cache' | 'mock';

export interface DegradationRule {
  /** Which service being down triggers this rule */
  serviceId: string;
  /** Feature IDs affected when this service is down */
  affects: string[];
  /** How to handle the degradation */
  strategy: DegradationStrategy;
  /** Human-readable message shown to the user */
  message: string;
}

export interface DegradedFeature {
  featureId: string;
  strategy: DegradationStrategy;
  message: string;
  /** Which service(s) caused this degradation */
  causedBy: string[];
}

export interface FeatureStatus {
  available: boolean;
  degraded: boolean;
  message: string | null;
  strategy: DegradationStrategy | null;
}

// ---------------------------------------------------------------------------
// Default degradation rules
//
// Maps service failures to affected features and their fallback strategy.
// These rules define the "what happens when X goes down" contract.
// ---------------------------------------------------------------------------

export const DEGRADATION_RULES: DegradationRule[] = [
  {
    serviceId: 'context-dna',
    affects: ['learnings', 'search', 'injection', 'professor', 'evidence-pipeline'],
    strategy: 'cache',
    message: 'Context DNA backend is offline. Showing cached data.',
  },
  {
    serviceId: 'vllm-mlx',
    affects: ['synaptic-chat', 'voice-chat', 'professor-wisdom', 'section-8'],
    strategy: 'fallback',
    message: 'Local LLM is offline. AI features limited to cloud providers.',
  },
  {
    serviceId: 'agent-service',
    affects: ['swarm', 'harmonizer', 'tool-registry', 'agent-spawning'],
    strategy: 'disable',
    message: 'Agent service unavailable. Swarm features disabled.',
  },
];

// ---------------------------------------------------------------------------
// DegradationManager — determines feature availability based on service health
//
// Design:
//   - Stateless queries against ServiceRegistry — no duplicated state
//   - Subscriber pattern mirrors ServiceRegistry for React integration
//   - Rules are declarative and extensible
//   - SSR-safe: all browser APIs guarded
// ---------------------------------------------------------------------------

export class DegradationManager {
  private static instance: DegradationManager | null = null;

  private rules: DegradationRule[] = [];
  private handlers = new Set<() => void>();
  private unsubFromRegistry: (() => void) | null = null;

  private constructor() {}

  static getInstance(): DegradationManager {
    if (!DegradationManager.instance) {
      DegradationManager.instance = new DegradationManager();
    }
    return DegradationManager.instance;
  }

  // -----------------------------------------------------------------------
  // Initialization — call once to wire up rules and registry subscription
  // -----------------------------------------------------------------------

  init(rules?: DegradationRule[]): void {
    this.rules = rules ?? DEGRADATION_RULES;

    // Subscribe to service status changes to notify our own listeners
    if (!this.unsubFromRegistry) {
      const registry = getServiceRegistry();
      this.unsubFromRegistry = registry.onStatusChange(() => {
        this.emit();
      });
    }
  }

  // -----------------------------------------------------------------------
  // Feature status queries
  // -----------------------------------------------------------------------

  /**
   * Check if a specific feature is currently degraded.
   */
  isFeatureDegraded(featureId: string): FeatureStatus {
    const registry = getServiceRegistry();
    const allStatuses = registry.getAllStatuses();

    // Build a map of service statuses for fast lookup
    const statusMap = new Map<string, ServiceStatus>();
    for (const s of allStatuses) {
      statusMap.set(s.id, s);
    }

    // Find all rules that affect this feature where the service is unhealthy
    for (const rule of this.rules) {
      if (!rule.affects.includes(featureId)) continue;

      const svcStatus = statusMap.get(rule.serviceId);
      if (!svcStatus) continue;

      if (svcStatus.status === 'offline' || svcStatus.status === 'degraded') {
        return {
          available: rule.strategy !== 'disable',
          degraded: true,
          message: rule.message,
          strategy: rule.strategy,
        };
      }
    }

    return {
      available: true,
      degraded: false,
      message: null,
      strategy: null,
    };
  }

  /**
   * Get all currently degraded features.
   */
  getDegradedFeatures(): DegradedFeature[] {
    const registry = getServiceRegistry();
    const allStatuses = registry.getAllStatuses();

    const statusMap = new Map<string, ServiceHealthStatus>();
    for (const s of allStatuses) {
      statusMap.set(s.id, s.status);
    }

    // Collect degraded features, deduplicating by featureId
    const degradedMap = new Map<string, DegradedFeature>();

    for (const rule of this.rules) {
      const svcHealth = statusMap.get(rule.serviceId);
      if (!svcHealth || (svcHealth !== 'offline' && svcHealth !== 'degraded')) {
        continue;
      }

      for (const featureId of rule.affects) {
        const existing = degradedMap.get(featureId);
        if (existing) {
          // Multiple services can degrade the same feature — collect all causes
          existing.causedBy.push(rule.serviceId);
          // Use the most restrictive strategy
          existing.strategy = mostRestrictive(existing.strategy, rule.strategy);
        } else {
          degradedMap.set(featureId, {
            featureId,
            strategy: rule.strategy,
            message: rule.message,
            causedBy: [rule.serviceId],
          });
        }
      }
    }

    return Array.from(degradedMap.values());
  }

  /**
   * Get services that are currently causing degradation.
   */
  getDownServices(): { id: string; name: string; status: ServiceHealthStatus; message: string }[] {
    const registry = getServiceRegistry();
    const allStatuses = registry.getAllStatuses();
    const result: { id: string; name: string; status: ServiceHealthStatus; message: string }[] = [];

    for (const svcStatus of allStatuses) {
      if (svcStatus.status !== 'offline' && svcStatus.status !== 'degraded') continue;

      const rule = this.rules.find((r) => r.serviceId === svcStatus.id);
      result.push({
        id: svcStatus.id,
        name: svcStatus.name,
        status: svcStatus.status,
        message: rule?.message ?? `${svcStatus.name} is ${svcStatus.status}.`,
      });
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Subscriptions — for React re-rendering
  // -----------------------------------------------------------------------

  subscribe(handler: () => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private emit(): void {
    const snapshot = Array.from(this.handlers);
    for (const handler of snapshot) {
      try {
        handler();
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[DegradationManager] Handler error:', err);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  dispose(): void {
    if (this.unsubFromRegistry) {
      this.unsubFromRegistry();
      this.unsubFromRegistry = null;
    }
    this.handlers.clear();
    this.rules = [];
  }
}

// ---------------------------------------------------------------------------
// Strategy ordering — 'disable' is most restrictive
// ---------------------------------------------------------------------------

const STRATEGY_ORDER: Record<DegradationStrategy, number> = {
  mock: 0,
  cache: 1,
  fallback: 2,
  disable: 3,
};

function mostRestrictive(
  a: DegradationStrategy,
  b: DegradationStrategy,
): DegradationStrategy {
  return STRATEGY_ORDER[a] >= STRATEGY_ORDER[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Module-level singleton accessor
// ---------------------------------------------------------------------------

let _manager: DegradationManager | null = null;

export function getDegradationManager(): DegradationManager {
  if (!_manager) {
    _manager = DegradationManager.getInstance();
    _manager.init();
  }
  return _manager;
}

/**
 * Reset the singleton (for testing only).
 */
export function _resetDegradationManager(): void {
  if (_manager) {
    _manager.dispose();
    _manager = null;
  }
}

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/**
 * useFeatureAvailable — returns whether a feature is currently available.
 * Re-renders when degradation state changes.
 */
export function useFeatureAvailable(featureId: string): boolean {
  const manager = useDegradationManagerInstance();
  const [available, setAvailable] = useState(() =>
    manager.isFeatureDegraded(featureId).available,
  );

  useEffect(() => {
    setAvailable(manager.isFeatureDegraded(featureId).available);

    const unsub = manager.subscribe(() => {
      setAvailable(manager.isFeatureDegraded(featureId).available);
    });

    return unsub;
  }, [manager, featureId]);

  return available;
}

/**
 * useDegradedState — returns detailed degradation info for a feature.
 * Use in panels to show degraded-mode UI.
 */
export function useDegradedState(featureId: string): FeatureStatus {
  const manager = useDegradationManagerInstance();
  const [status, setStatus] = useState<FeatureStatus>(() =>
    manager.isFeatureDegraded(featureId),
  );

  useEffect(() => {
    setStatus(manager.isFeatureDegraded(featureId));

    const unsub = manager.subscribe(() => {
      setStatus(manager.isFeatureDegraded(featureId));
    });

    return unsub;
  }, [manager, featureId]);

  return status;
}

/**
 * useDegradedFeatures — returns all currently degraded features.
 */
export function useDegradedFeatures(): DegradedFeature[] {
  const manager = useDegradationManagerInstance();
  const [features, setFeatures] = useState<DegradedFeature[]>(() =>
    manager.getDegradedFeatures(),
  );

  useEffect(() => {
    setFeatures(manager.getDegradedFeatures());

    const unsub = manager.subscribe(() => {
      setFeatures(manager.getDegradedFeatures());
    });

    return unsub;
  }, [manager]);

  return features;
}

/**
 * useDownServices — returns services currently causing degradation.
 */
export function useDownServices() {
  const manager = useDegradationManagerInstance();
  const [services, setServices] = useState(() => manager.getDownServices());

  useEffect(() => {
    setServices(manager.getDownServices());

    const unsub = manager.subscribe(() => {
      setServices(manager.getDownServices());
    });

    return unsub;
  }, [manager]);

  return services;
}

// ---------------------------------------------------------------------------
// Internal: shared hook for getting the manager instance
// ---------------------------------------------------------------------------

function useDegradationManagerInstance(): DegradationManager {
  const managerRef = useRef<DegradationManager>(getDegradationManager());
  return managerRef.current;
}
