'use client';

// ---------------------------------------------------------------------------
// PanelSkeleton — loading placeholder shown while lazy panels are importing
//
// Variants:
//   - compact:  thin loading bar across the top
//   - content:  mock content blocks (default)
//   - terminal: dark background with blinking cursor
//
// Uses pure CSS shimmer animation — no framer-motion dependency.
// ---------------------------------------------------------------------------

export type PanelSkeletonVariant = 'compact' | 'content' | 'terminal';

interface PanelSkeletonProps {
  variant?: PanelSkeletonVariant;
}

// ---------------------------------------------------------------------------
// Shimmer block — reusable animated placeholder element
// ---------------------------------------------------------------------------

function ShimmerBlock({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded bg-[#1a1a24] relative overflow-hidden ${className ?? ''}`}
      style={style}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, #22222a 40%, #22222a 60%, transparent 100%)',
          animation: 'panel-skeleton-shimmer 1.8s ease-in-out infinite',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact variant — thin loading bar
// ---------------------------------------------------------------------------

function CompactSkeleton() {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Top loading bar */}
      <div className="relative w-full h-[2px] bg-[#1a1a24] overflow-hidden">
        <div
          className="absolute h-full bg-[#22c55e]/40"
          style={{
            width: '40%',
            animation: 'panel-skeleton-slide 1.5s ease-in-out infinite',
          }}
        />
      </div>
      {/* Empty content area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-[#22c55e]/30 border-t-[#22c55e] animate-spin" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content variant — mock content blocks
// ---------------------------------------------------------------------------

function ContentSkeleton() {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <ShimmerBlock className="w-3.5 h-3.5 rounded-sm" />
        <ShimmerBlock className="h-3 rounded-sm" style={{ width: '80px' }} />
        <div className="flex-1" />
        <ShimmerBlock className="w-3 h-3 rounded-sm" />
      </div>

      {/* Content blocks */}
      <div className="flex-1 p-3 space-y-3">
        {/* Full-width block */}
        <ShimmerBlock className="h-4 rounded-sm" style={{ width: '70%' }} />
        <ShimmerBlock className="h-3 rounded-sm" style={{ width: '45%' }} />

        {/* Card-like block */}
        <div className="mt-4 p-3 rounded-md border border-[#2a2a35]/50 space-y-2">
          <ShimmerBlock className="h-3 rounded-sm" style={{ width: '60%' }} />
          <ShimmerBlock className="h-3 rounded-sm" style={{ width: '85%' }} />
          <ShimmerBlock className="h-3 rounded-sm" style={{ width: '40%' }} />
        </div>

        {/* List items */}
        <div className="space-y-2 mt-3">
          {[90, 65, 78, 50].map((widthPercent, i) => (
            <div key={i} className="flex items-center gap-2">
              <ShimmerBlock className="w-2 h-2 rounded-full flex-shrink-0" />
              <ShimmerBlock
                className="h-3 rounded-sm"
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal variant — dark background with blinking cursor
// ---------------------------------------------------------------------------

function TerminalSkeleton() {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Tab bar skeleton */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[#2a2a35] flex-shrink-0">
        <ShimmerBlock className="h-4 rounded-sm" style={{ width: '60px' }} />
        <ShimmerBlock className="w-3.5 h-3.5 rounded-sm ml-1" />
      </div>

      {/* Terminal body */}
      <div
        className="flex-1 p-3"
        style={{
          fontFamily:
            'var(--font-jetbrains), "JetBrains Mono", "Fira Code", Menlo, monospace',
        }}
      >
        {/* Fake prompt lines */}
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <span className="text-[#22c55e] text-xs">$</span>
            <ShimmerBlock className="h-3 rounded-sm" style={{ width: '120px' }} />
          </div>
          <ShimmerBlock className="h-3 rounded-sm ml-4" style={{ width: '200px' }} />
          <ShimmerBlock className="h-3 rounded-sm ml-4" style={{ width: '160px' }} />
          <div className="h-2" />
          <div className="flex items-center gap-1">
            <span className="text-[#22c55e] text-xs">$</span>
            {/* Blinking cursor */}
            <span
              className="inline-block w-[7px] h-[14px] bg-[#22c55e]"
              style={{ animation: 'panel-skeleton-blink 1s step-start infinite' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelSkeleton — main export
// ---------------------------------------------------------------------------

export function PanelSkeleton({ variant = 'content' }: PanelSkeletonProps) {
  return (
    <>
      {/* Inject keyframe animations via style tag (no external CSS needed) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes panel-skeleton-shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
            @keyframes panel-skeleton-slide {
              0% { left: -40%; }
              100% { left: 100%; }
            }
            @keyframes panel-skeleton-blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
          `,
        }}
      />
      {variant === 'compact' && <CompactSkeleton />}
      {variant === 'content' && <ContentSkeleton />}
      {variant === 'terminal' && <TerminalSkeleton />}
    </>
  );
}
