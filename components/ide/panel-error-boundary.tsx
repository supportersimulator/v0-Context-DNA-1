'use client';

import { Component, useState, useCallback, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Bug, ChevronDown, ChevronRight, ShieldOff } from 'lucide-react';
import { getEventBus } from '@/lib/ide/event-bus';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PanelErrorBoundaryProps {
  /** Unique panel identifier (matches dockview panel ID) */
  panelId: string;
  /** Human-readable panel label for display */
  label: string;
  children: ReactNode;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// ErrorCard — internal presentational component for the error state
// ---------------------------------------------------------------------------

function ErrorCard({
  panelId,
  label,
  error,
  retryCount,
  onRetry,
  onReport,
  onReset,
}: {
  panelId: string;
  label: string;
  error: Error | null;
  retryCount: number;
  onRetry: () => void;
  onReport: () => void;
  onReset: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isFatal = retryCount >= MAX_RETRIES;

  const toggleDetails = useCallback(() => {
    setDetailsOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#0a0a0f] p-4">
      <div className="w-full max-w-sm rounded-lg border border-[#2a2a35] bg-[#111118] overflow-hidden">
        {/* Header strip */}
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b border-[#2a2a35] ${
            isFatal ? 'bg-red-500/10' : 'bg-yellow-500/10'
          }`}
        >
          {isFatal ? (
            <ShieldOff className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-[#e5e5e5] truncate">
            {label}
          </span>
          {retryCount > 0 && !isFatal && (
            <span className="ml-auto text-[10px] text-[#6b6b75] flex-shrink-0">
              Retry {retryCount}/{MAX_RETRIES}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-3 space-y-3">
          <p className="text-xs text-[#8b8b95] leading-relaxed">
            {isFatal
              ? 'This panel has been disabled after multiple failures.'
              : 'Something went wrong in this panel.'}
          </p>

          {/* Error details (collapsed by default) */}
          {error && (
            <div>
              <button
                onClick={toggleDetails}
                className="flex items-center gap-1 text-[10px] text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
              >
                {detailsOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>Error details</span>
              </button>
              {detailsOpen && (
                <pre className="mt-1.5 px-2 py-1.5 rounded bg-[#0a0a0f] border border-[#2a2a35] text-[10px] text-red-400/80 font-mono leading-relaxed overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                  {error.message}
                  {error.stack && (
                    <>
                      {'\n\n'}
                      {error.stack
                        .split('\n')
                        .slice(1, 6)
                        .join('\n')}
                    </>
                  )}
                </pre>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {isFatal ? (
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-[#22c55e]/15 text-[#22c55e] hover:bg-[#22c55e]/25 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset panel
              </button>
            ) : (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-[#22c55e]/15 text-[#22c55e] hover:bg-[#22c55e]/25 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Retry
              </button>
            )}
            <button
              onClick={onReport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24]/80 transition-colors"
            >
              <Bug className="w-3 h-3" />
              Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelErrorBoundary — React class Error Boundary
//
// Wraps each dockview panel. On error:
//   1. Shows styled error card (not a crash)
//   2. Emits panel:error to EventBus
//   3. Tracks retry count — after MAX_RETRIES shows "disabled" state
//   4. Retry remounts children via key change
// ---------------------------------------------------------------------------

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    const { panelId } = this.props;
    const retryCount = this.state.retryCount;
    const fatal = retryCount >= MAX_RETRIES;

    // Emit event to the IDE event bus
    try {
      const bus = getEventBus();
      bus.emit('panel:error', {
        panelId,
        error: error.message,
        retryCount,
        fatal,
      });
    } catch {
      // EventBus may not be available in SSR — ignore
    }

    // Log to console for observability
    console.error(
      `[PanelErrorBoundary] Panel "${panelId}" error (attempt ${retryCount + 1}/${MAX_RETRIES}):`,
      error,
    );
  }

  private handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  private handleReport = () => {
    const { panelId, label } = this.props;
    const { error, retryCount } = this.state;

    // Log report to console
    console.group(`[PanelErrorBoundary] Error report for "${label}" (${panelId})`);
    console.error('Error:', error?.message);
    console.error('Stack:', error?.stack);
    console.info('Retry count:', retryCount);
    console.info('Timestamp:', new Date().toISOString());
    console.groupEnd();

    // Emit report event
    try {
      const bus = getEventBus();
      bus.emit('panel:error', {
        panelId,
        error: `[REPORT] ${error?.message ?? 'Unknown error'}`,
        retryCount,
        fatal: retryCount >= MAX_RETRIES,
      });
    } catch {
      // Silent
    }
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
    });
  };

  render() {
    const { panelId, label, children } = this.props;
    const { hasError, error, retryCount } = this.state;

    if (hasError) {
      return (
        <ErrorCard
          panelId={panelId}
          label={label}
          error={error}
          retryCount={retryCount}
          onRetry={this.handleRetry}
          onReport={this.handleReport}
          onReset={this.handleReset}
        />
      );
    }

    // Key changes on retry to force full remount of children
    return (
      <div key={`${panelId}-${retryCount}`} className="h-full w-full">
        {children}
      </div>
    );
  }
}
