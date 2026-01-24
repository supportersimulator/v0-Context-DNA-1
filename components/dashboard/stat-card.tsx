'use client';

import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: string;
  variant?: 'default' | 'primary' | 'streak';
  size?: 'default' | 'small';
}

export function StatCard({ label, value, icon, variant = 'default', size = 'default' }: StatCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border border-border bg-card p-6 transition-all duration-200',
        'hover:bg-[#1e1e28] hover:border-border/80 hover:-translate-y-0.5 hover:shadow-lg',
        variant === 'primary' && 'glow-primary border-primary/20',
        size === 'small' && 'p-4'
      )}
    >
      {variant === 'primary' && (
        <div className="absolute inset-0 bg-primary/5 rounded-lg" />
      )}
      
      <div className="relative flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-3xl font-bold tracking-tight text-foreground',
              size === 'small' && 'text-2xl'
            )}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {icon && (
            <span className={cn('text-2xl', variant === 'streak' && 'animate-flame')}>
              {icon}
            </span>
          )}
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

export function StatCardSkeleton({ size = 'default' }: { size?: 'default' | 'small' }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-border bg-card',
        size === 'default' ? 'p-6' : 'p-4'
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <div className={cn('skeleton rounded', size === 'default' ? 'h-9 w-24' : 'h-8 w-20')} />
        <div className="skeleton h-3 w-16 rounded" />
      </div>
    </div>
  );
}
