'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { Maximize2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerSize {
  /** Current container width in px */
  width: number;
  /** Current container height in px */
  height: number;
  /** true when width < 300px — panels should stack content vertically */
  isCompact: boolean;
  /** true when width < 200px — panels should hide secondary content */
  isTiny: boolean;
  /** true when container is below minimum viable size */
  isCollapsed: boolean;
}

export interface ResponsivePanelConfig {
  /** Minimum width before collapsing to placeholder (default: 150) */
  minWidth?: number;
  /** Minimum height before collapsing to placeholder (default: 80) */
  minHeight?: number;
  /** Panel display label for collapsed placeholder */
  label?: string;
}

// ---------------------------------------------------------------------------
// Context — allows any nested component to read container size
// ---------------------------------------------------------------------------

const ContainerSizeContext = createContext<ContainerSize>({
  width: 0,
  height: 0,
  isCompact: false,
  isTiny: false,
  isCollapsed: false,
});

/**
 * Hook: read the nearest ResponsivePanelWrapper's container dimensions.
 *
 * Returns `{ width, height, isCompact, isTiny, isCollapsed }`.
 *
 * - `isCompact` (width < 300) — switch to vertical / stacked layouts
 * - `isTiny`    (width < 200) — hide secondary content
 * - `isCollapsed` — container below minimum viable size
 */
export function useContainerSize(): ContainerSize {
  return useContext(ContainerSizeContext);
}

// ---------------------------------------------------------------------------
// Thresholds (px)
// ---------------------------------------------------------------------------
const COMPACT_THRESHOLD = 300;
const TINY_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// useResizeObserver — low-level hook returning { width, height } via ref
// ---------------------------------------------------------------------------

function useResizeObserver(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      // Use borderBoxSize when available, otherwise fallback to contentRect
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      setSize((prev) => {
        // Avoid unnecessary re-renders for sub-pixel jitter
        if (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
          return prev;
        }
        return { width: Math.round(width), height: Math.round(height) };
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

// ---------------------------------------------------------------------------
// ResponsivePanelWrapper
// ---------------------------------------------------------------------------

interface ResponsivePanelWrapperProps extends ResponsivePanelConfig {
  children: ReactNode;
  /** Optional callback when the expand hint is clicked in collapsed state */
  onExpandClick?: () => void;
}

/**
 * Wraps panel content with ResizeObserver-based responsive behaviour.
 *
 * - Sets CSS custom properties `--panel-width` and `--panel-height` on container
 * - Applies `.panel-compact` when width < 300px
 * - Applies `.panel-tiny` when width < 200px
 * - Shows a collapsed placeholder when container is below minimum viable size
 * - Provides `ContainerSizeContext` so children can call `useContainerSize()`
 */
export function ResponsivePanelWrapper({
  children,
  minWidth = 150,
  minHeight = 80,
  label = 'Panel',
  onExpandClick,
}: ResponsivePanelWrapperProps) {
  const [ref, size] = useResizeObserver();

  const isCompact = size.width > 0 && size.width < COMPACT_THRESHOLD;
  const isTiny = size.width > 0 && size.width < TINY_THRESHOLD;
  const isCollapsed =
    size.width > 0 &&
    size.height > 0 &&
    (size.width < minWidth || size.height < minHeight);

  const contextValue: ContainerSize = {
    width: size.width,
    height: size.height,
    isCompact,
    isTiny,
    isCollapsed,
  };

  // Build className string
  const classNames = [
    'responsive-panel',
    'h-full w-full overflow-auto bg-[#0a0a0f]',
    isCompact && 'panel-compact',
    isTiny && 'panel-tiny',
    isCollapsed && 'panel-collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ContainerSizeContext.Provider value={contextValue}>
      <div
        ref={ref}
        className={classNames}
        style={{
          '--panel-width': `${size.width}px`,
          '--panel-height': `${size.height}px`,
        } as React.CSSProperties}
      >
        {isCollapsed ? (
          <CollapsedPlaceholder
            label={label}
            width={size.width}
            height={size.height}
            onExpandClick={onExpandClick}
          />
        ) : (
          children
        )}
      </div>
    </ContainerSizeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Collapsed placeholder — shown when panel is too small
// ---------------------------------------------------------------------------

interface CollapsedPlaceholderProps {
  label: string;
  width: number;
  height: number;
  onExpandClick?: () => void;
}

function CollapsedPlaceholder({ label, width, height, onExpandClick }: CollapsedPlaceholderProps) {
  const isNarrowTall = width < height;

  const handleClick = useCallback(() => {
    onExpandClick?.();
  }, [onExpandClick]);

  // Vertical layout for narrow panels
  if (isNarrowTall) {
    return (
      <button
        onClick={handleClick}
        className="collapsed-placeholder collapsed-placeholder--vertical"
        title={`Expand ${label}`}
      >
        <Maximize2 className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0" />
        <span className="collapsed-placeholder__label collapsed-placeholder__label--vertical">
          {label}
        </span>
      </button>
    );
  }

  // Horizontal layout for short-wide panels
  return (
    <button
      onClick={handleClick}
      className="collapsed-placeholder collapsed-placeholder--horizontal"
      title={`Expand ${label}`}
    >
      <Maximize2 className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0" />
      <span className="collapsed-placeholder__label">
        {label}
      </span>
      <span className="collapsed-placeholder__hint">
        click to expand
      </span>
    </button>
  );
}
