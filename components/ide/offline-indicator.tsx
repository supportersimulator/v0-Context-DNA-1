'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useAllServiceStatuses,
  useServiceHealthSummary,
  getServiceRegistry,
  type ServiceHealthStatus,
} from '@/lib/ide/service-registry';
import {
  useDownServices,
  useDegradedFeatures,
  type DegradedFeature,
  type DegradationStrategy,
} from '@/lib/ide/degradation-manager';

// ---------------------------------------------------------------------------
// Theme constants — matches the IDE dark theme palette
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<ServiceHealthStatus, string> = {
  healthy: '#22c55e',
  degraded: '#f59e0b',
  offline: '#ef4444',
  unknown: '#6b6b75',
};

const STATUS_BG: Record<'degraded' | 'offline' | 'recovering', string> = {
  degraded: 'rgba(245, 158, 11, 0.08)',
  offline: 'rgba(239, 68, 68, 0.08)',
  recovering: 'rgba(34, 197, 94, 0.08)',
};

const STRATEGY_LABELS: Record<DegradationStrategy, string> = {
  disable: 'Disabled',
  fallback: 'Fallback mode',
  cache: 'Cached data',
  mock: 'Mock data',
};

// ---------------------------------------------------------------------------
// ServiceStatusDot — tiny colored indicator dot with optional pulse
// ---------------------------------------------------------------------------

function ServiceStatusDot({
  status,
  size = 8,
}: {
  status: ServiceHealthStatus;
  size?: number;
}) {
  const color = STATUS_COLORS[status];
  const shouldPulse = status === 'degraded';

  return (
    <span
      className="relative inline-flex flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {shouldPulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-40"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full w-full h-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// FeatureChip — small badge showing an affected feature
// ---------------------------------------------------------------------------

function FeatureChip({ feature }: { feature: DegradedFeature }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        color: '#8b8b95',
      }}
    >
      <span
        className="w-1 h-1 rounded-full flex-shrink-0"
        style={{
          backgroundColor:
            feature.strategy === 'disable' ? '#ef4444' : '#f59e0b',
        }}
      />
      {feature.featureId}
      <span className="text-[9px] opacity-60">
        ({STRATEGY_LABELS[feature.strategy]})
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// OfflineIndicator — the main banner component
//
// Behavior:
//   - Hidden when all services are healthy
//   - Slides in from top when any service is degraded or offline
//   - Amber bar for degraded, red bar for offline
//   - Green pulse when recovering (service just came back)
//   - Shows which services are down and which features are affected
//   - Expandable detail section (collapsed by default)
//   - Dismiss button (user acknowledgment) — auto-reappears if state worsens
//   - Auto-dismiss with green flash when all services recover
//   - Force-retry button to check immediately
//   - SSR-safe: renders nothing on server
// ---------------------------------------------------------------------------

export function OfflineIndicator() {
  const allStatuses = useAllServiceStatuses();
  const { allHealthy, criticalDown } = useServiceHealthSummary();
  const downServices = useDownServices();
  const degradedFeatures = useDegradedFeatures();

  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Track previous health state to detect recovery
  const prevHealthyRef = useRef(allHealthy);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset dismissed state when a NEW service goes down
  // (so the banner reappears for new problems, not for already-acknowledged ones)
  const prevDownCountRef = useRef(downServices.length);
  useEffect(() => {
    if (downServices.length > prevDownCountRef.current) {
      setDismissed(false);
    }
    prevDownCountRef.current = downServices.length;
  }, [downServices.length]);

  // Detect recovery: was unhealthy, now healthy
  useEffect(() => {
    if (!prevHealthyRef.current && allHealthy) {
      setRecovering(true);
      setDismissed(false);

      // Show green recovery banner for 3 seconds, then auto-dismiss
      recoveryTimerRef.current = setTimeout(() => {
        setRecovering(false);
        setDismissed(true);
      }, 3_000);
    }

    prevHealthyRef.current = allHealthy;

    return () => {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
      }
    };
  }, [allHealthy]);

  // Force retry handler
  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await getServiceRegistry().checkNow();
    } finally {
      // Small delay so spinner is visible
      setTimeout(() => setRetrying(false), 500);
    }
  }, []);

  // Determine banner variant
  const hasOffline = downServices.some((s) => s.status === 'offline');
  const variant: 'offline' | 'degraded' | 'recovering' = recovering
    ? 'recovering'
    : hasOffline
      ? 'offline'
      : 'degraded';

  // Should we show the banner?
  const shouldShow = (!allHealthy || recovering) && !dismissed;

  // SSR guard
  if (typeof window === 'undefined') return null;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="offline-indicator"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="overflow-hidden flex-shrink-0 z-40"
          style={{
            backgroundColor: STATUS_BG[variant],
            borderBottom: `1px solid ${
              variant === 'recovering'
                ? 'rgba(34, 197, 94, 0.2)'
                : variant === 'offline'
                  ? 'rgba(239, 68, 68, 0.2)'
                  : 'rgba(245, 158, 11, 0.2)'
            }`,
          }}
        >
          {/* -------- Main bar -------- */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            {/* Icon */}
            {recovering ? (
              <CheckCircle2
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: '#22c55e' }}
              />
            ) : hasOffline ? (
              <WifiOff
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: '#ef4444' }}
              />
            ) : (
              <AlertTriangle
                className="w-3.5 h-3.5 flex-shrink-0"
                style={{ color: '#f59e0b' }}
              />
            )}

            {/* Message */}
            <span className="flex-1 text-xs text-[#e5e5e5] truncate">
              {recovering ? (
                'All services reconnected.'
              ) : downServices.length === 1 ? (
                downServices[0].message
              ) : (
                <>
                  {downServices.length} services are{' '}
                  {hasOffline ? 'offline' : 'degraded'}.{' '}
                  {criticalDown && (
                    <span className="text-[#f59e0b]">
                      Some features may be unavailable.
                    </span>
                  )}
                </>
              )}
            </span>

            {/* Service status dots (quick glance) */}
            {!recovering && downServices.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                {allStatuses.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-1"
                    title={`${s.name}: ${s.status}${s.error ? ` — ${s.error}` : ''}`}
                  >
                    <ServiceStatusDot status={s.status} size={6} />
                    <span className="text-[10px] text-[#6b6b75]">
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Retry button */}
              {!recovering && (
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#8b8b95] hover:text-[#e5e5e5] hover:bg-white/5 transition-colors disabled:opacity-40"
                  title="Retry health check now"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`}
                  />
                  <span className="hidden sm:inline">Retry</span>
                </button>
              )}

              {/* Expand/collapse (only when there are details to show) */}
              {!recovering && degradedFeatures.length > 0 && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center px-1 py-0.5 rounded text-[#8b8b95] hover:text-[#e5e5e5] hover:bg-white/5 transition-colors"
                  title={expanded ? 'Collapse details' : 'Show affected features'}
                >
                  {expanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}

              {/* Dismiss */}
              <button
                onClick={() => setDismissed(true)}
                className="flex items-center px-1 py-0.5 rounded text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-white/5 transition-colors"
                title="Dismiss"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* -------- Expanded detail section -------- */}
          <AnimatePresence>
            {expanded && !recovering && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-2 pt-0.5 border-t border-white/5">
                  {/* Down services detail */}
                  {downServices.length > 0 && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-semibold text-[#6b6b75] uppercase tracking-wider">
                        Services
                      </span>
                      <div className="mt-1 flex flex-col gap-1">
                        {downServices.map((svc) => {
                          const fullStatus = allStatuses.find(
                            (s) => s.id === svc.id,
                          );
                          return (
                            <div
                              key={svc.id}
                              className="flex items-center gap-2 text-[11px]"
                            >
                              <ServiceStatusDot
                                status={svc.status}
                                size={6}
                              />
                              <span className="text-[#e5e5e5] font-medium">
                                {svc.name}
                              </span>
                              <span className="text-[#6b6b75]">
                                {svc.status}
                              </span>
                              {fullStatus?.error && (
                                <span className="text-[#6b6b75] text-[10px] truncate max-w-[200px]">
                                  — {fullStatus.error}
                                </span>
                              )}
                              {fullStatus?.latency !== undefined &&
                                fullStatus.latency >= 0 && (
                                  <span className="text-[#6b6b75] text-[10px]">
                                    ({fullStatus.latency}ms)
                                  </span>
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Affected features */}
                  {degradedFeatures.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-[#6b6b75] uppercase tracking-wider">
                        Affected features
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {degradedFeatures.map((f) => (
                          <FeatureChip key={f.featureId} feature={f} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
