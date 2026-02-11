'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Cpu,
  Zap,
  PackageCheck,
  Play,
  GitCompare,
  Trophy,
  CloudOff,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMPerformance {
  modelName: string;
  online: boolean;
  tokPerSec: number | null;
  ttftP50: number | null;
}

export interface ConfigSyncStatus {
  state: 'synced' | 'unsynced' | 'offline';
  installedPacks: number;
}

export interface CommunityStats {
  leaderboardEntries: number;
}

export interface ConfigBenchmarkSummaryProps {
  llm?: LLMPerformance | null;
  configSync?: ConfigSyncStatus | null;
  community?: CommunityStats | null;
  onRunBenchmark?: () => void;
  onBrowsePacks?: () => void;
  onCompareConfigs?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Sync status badge
// ---------------------------------------------------------------------------

const SYNC_META: Record<
  ConfigSyncStatus['state'],
  { label: string; dotClass: string }
> = {
  synced: { label: 'Synced', dotClass: 'bg-success' },
  unsynced: { label: 'Unsynced', dotClass: 'bg-warning' },
  offline: { label: 'Offline', dotClass: 'bg-destructive' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfigBenchmarkSummary({
  llm,
  configSync,
  community,
  onRunBenchmark,
  onBrowsePacks,
  onCompareConfigs,
  className,
}: ConfigBenchmarkSummaryProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-3 gap-3',
        className,
      )}
    >
      {/* -- Card 1: LLM Performance ---------------------------------------- */}
      <div className="glass rounded-lg border border-border p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            LLM Performance
          </span>
        </div>

        {llm ? (
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                'w-2 h-2 rounded-full shrink-0',
                llm.online ? 'bg-success' : 'bg-destructive',
              )}
            />
            <span className="text-sm font-semibold text-foreground truncate">
              {llm.modelName}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudOff className="w-3.5 h-3.5" />
            <span className="text-xs">No LLM detected</span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {llm?.tokPerSec != null ? (
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-success" />
              {llm.tokPerSec.toFixed(1)} tok/s
            </span>
          ) : (
            <span className="text-muted-foreground/60">No benchmarks yet</span>
          )}
          {llm?.ttftP50 != null && (
            <span>TTFT {llm.ttftP50.toFixed(2)}s</span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRunBenchmark}
          className="mt-auto h-7 w-full justify-center text-xs text-success/80 hover:text-success hover:bg-success/10"
        >
          <Play className="w-3 h-3 mr-1" />
          Run Benchmark
        </Button>
      </div>

      {/* -- Card 2: Config Status ------------------------------------------ */}
      <div className="glass rounded-lg border border-border p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Config Status
          </span>
        </div>

        {configSync ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  SYNC_META[configSync.state].dotClass,
                )}
              />
              <span className="text-sm font-semibold text-foreground">
                {SYNC_META[configSync.state].label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PackageCheck className="w-3 h-3" />
              <span>
                {configSync.installedPacks}{' '}
                {configSync.installedPacks === 1 ? 'pack' : 'packs'} installed
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudOff className="w-3.5 h-3.5" />
            <span className="text-xs">Status unavailable</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onBrowsePacks}
          className="mt-auto h-7 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="w-3 h-3 mr-1" />
          Browse Packs
        </Button>
      </div>

      {/* -- Card 3: Community ---------------------------------------------- */}
      <div className="glass rounded-lg border border-border p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Community
          </span>
        </div>

        {community ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {community.leaderboardEntries.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">
              leaderboard {community.leaderboardEntries === 1 ? 'entry' : 'entries'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CloudOff className="w-3.5 h-3.5" />
            <span className="text-xs">No data</span>
          </div>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onCompareConfigs}
          className="mt-auto h-7 w-full justify-center text-xs text-muted-foreground hover:text-foreground"
        >
          <GitCompare className="w-3 h-3 mr-1" />
          Compare Configs
        </Button>
      </div>
    </div>
  );
}
