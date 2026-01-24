'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchStats, fetchRecent } from '@/lib/api';
import { StatCard, StatCardSkeleton } from '../stat-card';
import { RecentActivity } from '../recent-activity';
import { RecordModal } from '../record-modal';
import { Button } from '@/components/ui/button';

type RecordType = 'win' | 'fix' | 'pattern';

export function HomeView() {
  const [modalType, setModalType] = useState<RecordType | null>(null);
  
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
            <span className="mr-2">🏆</span>
            Record Win
          </Button>
          <Button
            onClick={() => setModalType('fix')}
            className="bg-type-fix/10 text-type-fix border border-type-fix/20 hover:bg-type-fix/20"
          >
            <span className="mr-2">🔧</span>
            Record Fix
          </Button>
          <Button
            onClick={() => setModalType('pattern')}
            className="bg-type-pattern/10 text-type-pattern border border-type-pattern/20 hover:bg-type-pattern/20"
          >
            <span className="mr-2">🔄</span>
            Record Pattern
          </Button>
        </div>
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
    </div>
  );
}
