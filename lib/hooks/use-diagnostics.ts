'use client';

// =============================================================================
// useDiagnostics — aggregates health from ServiceRegistry + backend
// Subscribes to EventBus service:health:changed events
// =============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useAllServiceStatuses, useServiceHealthSummary } from '@/lib/ide/service-registry';
import { useIDEEvent } from '@/lib/ide/event-bus';

export interface DiagnosticCounts {
  errors: number;
  warnings: number;
  healthy: number;
  total: number;
}

export function useDiagnostics(): DiagnosticCounts {
  const statuses = useAllServiceStatuses();
  const summary = useServiceHealthSummary();

  // Listen for service health changes via EventBus
  const [extra, setExtra] = useState({ errors: 0, warnings: 0 });

  useIDEEvent('service:health:changed' as any, (data: any) => {
    if (data?.diagnostics) {
      setExtra({
        errors: data.diagnostics.errors ?? 0,
        warnings: data.diagnostics.warnings ?? 0,
      });
    }
  });

  // Reset extra counts periodically (they come from event bus, not polling)
  useEffect(() => {
    const timer = setInterval(() => setExtra({ errors: 0, warnings: 0 }), 60_000);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    const serviceErrors = statuses.filter((s) => s.status === 'offline').length;
    const serviceWarnings = statuses.filter(
      (s) => s.status === 'degraded' || s.status === 'unknown',
    ).length;
    const serviceHealthy = statuses.filter((s) => s.status === 'healthy').length;

    return {
      errors: serviceErrors + extra.errors,
      warnings: serviceWarnings + extra.warnings,
      healthy: serviceHealthy,
      total: statuses.length,
    };
  }, [statuses, extra]);
}
