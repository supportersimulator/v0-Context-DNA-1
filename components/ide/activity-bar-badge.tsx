'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ---------------------------------------------------------------------------
// ActivityBarBadge — numeric badge overlay for Activity Bar icons
//
// Shows a count indicator (e.g., "41" pending git changes) positioned at the
// top-right corner of an icon. Supports 4 color variants, overflow (99+),
// dot-only mode, and optional scale animation on count change.
//
// Usage:
//   <div className="relative">
//     <GitBranchIcon />
//     <ActivityBarBadge count={41} variant="info" />
//   </div>
// ---------------------------------------------------------------------------

export type BadgeVariant = 'info' | 'success' | 'warning' | 'error';

export interface ActivityBarBadgeProps {
  /** Numeric count to display */
  count: number;
  /** Color variant */
  variant?: BadgeVariant;
  /** Max count before showing overflow (default: 99) */
  max?: number;
  /** Show dot indicator instead of number */
  dot?: boolean;
  /** Animate on count change (default: true) */
  animate?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  info: 'bg-[#3b82f6] text-white',
  success: 'bg-[#22c55e] text-[#0a0a0f]',
  warning: 'bg-[#f59e0b] text-[#0a0a0f]',
  error: 'bg-[#ef4444] text-white',
};

export const ActivityBarBadge = memo(function ActivityBarBadge({
  count,
  variant = 'info',
  max = 99,
  dot = false,
  animate = true,
}: ActivityBarBadgeProps) {
  // Don't render for zero count (unless dot mode)
  if (count === 0 && !dot) return null;

  const colorClasses = VARIANT_CLASSES[variant];

  // Dot indicator (no number)
  if (dot) {
    return (
      <span
        className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${colorClasses} shadow-sm`}
        aria-hidden="true"
      />
    );
  }

  const displayCount = count > max ? `${max}+` : String(count);
  const isWide = displayCount.length > 1;

  const badge = (
    <span
      className={`
        absolute -top-1 -right-1.5
        flex items-center justify-center
        ${isWide ? 'min-w-[18px] px-1' : 'w-[18px]'} h-[18px]
        rounded-full
        text-[10px] font-bold leading-none
        ${colorClasses}
        shadow-lg
        pointer-events-none
      `}
      aria-hidden="true"
    >
      {displayCount}
    </span>
  );

  if (!animate) return badge;

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={displayCount}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="contents"
      >
        {badge}
      </motion.span>
    </AnimatePresence>
  );
});
