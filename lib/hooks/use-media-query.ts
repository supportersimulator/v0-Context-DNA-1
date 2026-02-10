'use client';

import { useState, useEffect } from 'react';

/**
 * React hook that subscribes to a CSS media query and returns whether it matches.
 *
 * @param query - A CSS media query string, e.g. "(min-width: 768px)"
 * @returns `true` when the query matches, `false` otherwise.
 *
 * On the server (SSR) the hook always returns `false` to avoid hydration mismatches.
 * The real value is picked up on the first client-side effect.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);

    // Sync immediately in case initial state was SSR-default
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// ---------------------------------------------------------------------------
// Pre-defined breakpoint helpers (match Tailwind defaults)
// ---------------------------------------------------------------------------

/** >= 768px (tablet and above) */
export function useIsTabletUp(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

/** >= 1024px (desktop) */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** < 768px (mobile) */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
