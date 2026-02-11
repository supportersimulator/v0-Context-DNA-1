'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchStats, fetchRecent } from '@/lib/api';
import { StatCard, StatCardSkeleton } from '../stat-card';
import { RecentActivity } from '../recent-activity';
import { RecordModal } from '../record-modal';
import { WinsChart } from '../wins-chart';
import { Button } from '@/components/ui/button';
import {
  ConfigBenchmarkWidget,
  type LLMStatus,
  type BenchmarkResult,
} from './config-benchmark-widget';
import { BenchmarkConsentModal } from './benchmark-consent-modal';
import { IntegrationsModal } from './integrations-modal';

type RecordType = 'win' | 'fix' | 'pattern';

// ---------------------------------------------------------------------------
// Placeholder data — will be replaced by live API / SWR queries
// ---------------------------------------------------------------------------

const PLACEHOLDER_LLM: LLMStatus = {
  modelName: 'Qwen3-14B-4bit',
  online: true,
  tokensPerSecond: 35.1,
  ttft: 0.24,
};

const PLACEHOLDER_BENCHMARK: BenchmarkResult = {
  suiteName: 'coding-14B',
  date: new Date().toISOString(),
  metrics: { tokensPerSecond: 35.1, ttft: 0.24, ramUsageGB: 5.8 },
  shared: false,
};

export function HomeView() {
  const [modalType, setModalType] = useState<RecordType | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);

  const { data: stats, isLoading: statsLoading, mutate: mutateStats } = useSWR('stats', fetchStats, {
    refreshInterval: 30000,
  });

  const { data: recentData, isLoading: recentLoading, mutate: mutateRecent } = useSWR('recent', () => fetchRecent(5), {
    refreshInterval: 30000,
  });

  const handleRecordSuccess = () => {
    mutateStats();
    mutateRecent();
  };

  return (
    <div className="space-y-8">
      {/* Config Benchmark Widget — LLM status + quick actions */}
      <ConfigBenchmarkWidget
        llmStatus={PLACEHOLDER_LLM}
        lastBenchmark={PLACEHOLDER_BENCHMARK}
        onCompareConfigs={() => setShowConsentModal(true)}
        onOpenIntegrations={() => setShowIntegrationsModal(true)}
        onRunBenchmark={() => console.log('[Home] Run benchmark clicked')}
      />

      {/* Primary Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Learnings"
              value={stats?.total ?? 0}
              icon="🧠"
              variant="primary"
            />
            <StatCard
              label="Wins"
              value={stats?.wins ?? 0}
              icon="🏆"
            />
            <StatCard
              label="Fixes"
              value={stats?.fixes ?? 0}
              icon="🔧"
            />
            <StatCard
              label="Streak"
              value={stats?.streak ?? 0}
              icon="🔥"
              variant="streak"
            />
          </>
        )}
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton size="small" />
            <StatCardSkeleton size="small" />
            <StatCardSkeleton size="small" />
          </>
        ) : (
          <>
            <StatCard
              label="Today"
              value={stats?.today ?? 0}
              icon="📊"
              size="small"
            />
            <StatCard
              label="Patterns"
              value={stats?.patterns ?? 0}
              icon="🔄"
              size="small"
            />
            <StatCard
              label="SOPs"
              value={stats?.sops ?? 0}
              icon="📋"
              size="small"
            />
          </>
        )}
      </div>

      {/* Quick Actions Bar */}
      <div className="glass rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => setModalType('win')}
            className="bg-type-win/10 text-type-win border border-type-win/20 hover:bg-type-win/20"
          >
            <span className="mr-2">&#127942;</span>
            Record Win
          </Button>
          <Button
            onClick={() => setModalType('fix')}
            className="bg-type-fix/10 text-type-fix border border-type-fix/20 hover:bg-type-fix/20"
          >
            <span className="mr-2">&#128295;</span>
            Record Fix
          </Button>
          <Button
            onClick={() => setModalType('pattern')}
            className="bg-type-pattern/10 text-type-pattern border border-type-pattern/20 hover:bg-type-pattern/20"
          >
            <span className="mr-2">&#128260;</span>
            Record Pattern
          </Button>
        </div>
      </div>

      {/* Wins Chart */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Win Trends
        </h2>
        <WinsChart />
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recent Activity
        </h2>
        <div className="glass rounded-lg p-4">
          <RecentActivity
            learnings={recentData?.recent ?? []}
            isLoading={recentLoading}
          />
        </div>
      </div>

      {/* Record Modal */}
      {modalType && (
        <RecordModal
          isOpen={true}
          onClose={() => setModalType(null)}
          type={modalType}
          onSuccess={handleRecordSuccess}
        />
      )}

      {/* Benchmark Consent Modal */}
      <BenchmarkConsentModal
        isOpen={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConsent={(username) => {
          console.log('[Home] Benchmark consent granted:', username);
          setShowConsentModal(false);
        }}
      />

      {/* Integrations Modal */}
      <IntegrationsModal
        isOpen={showIntegrationsModal}
        onClose={() => setShowIntegrationsModal(false)}
      />
    </div>
  );
}
