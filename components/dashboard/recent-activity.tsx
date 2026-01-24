'use client';

import { cn } from '@/lib/utils';
import type { Learning } from '@/lib/types';
import { LEARNING_TYPE_CONFIG } from '@/lib/types';

interface RecentActivityProps {
  learnings: Learning[];
  isLoading?: boolean;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export function RecentActivity({ learnings, isLoading }: RecentActivityProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
            <div className="skeleton w-6 h-6 rounded" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/4 rounded" />
            </div>
            <div className="skeleton h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (learnings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <span className="text-4xl mb-2">📭</span>
        <p className="text-sm">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {learnings.map((learning) => {
        const config = LEARNING_TYPE_CONFIG[learning.type];
        return (
          <div
            key={learning.id}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg bg-card border border-border',
              'hover:bg-[#1e1e28] hover:border-border/80 transition-all duration-200 cursor-pointer'
            )}
          >
            <span className="text-lg flex-shrink-0">{config.emoji}</span>
            <span className="flex-1 text-sm text-foreground truncate">
              {learning.title}
            </span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatRelativeTime(learning.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
