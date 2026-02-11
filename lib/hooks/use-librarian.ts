'use client';

// =============================================================================
// useLibrarian — React hook for Librarian codebase queries
// Pure REST (search is request/response, not streaming)
// =============================================================================

import { useState, useCallback } from 'react';
import { queryLibrarian } from '@/lib/api/librarian';
import type { LibrarianIntent, LibrarianQueryResponse } from '@/lib/api/types';

export function useLibrarianQuery() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LibrarianQueryResponse | null>(null);

  const search = useCallback(
    async (intent: LibrarianIntent, query: string, focusDirs?: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await queryLibrarian({
          agent_id: 'ide-user',
          intent,
          query,
          max_files: 20,
          include_snippets: true,
          focus_dirs: focusDirs,
        });
        setResult(res);
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Librarian query failed';
        setError(msg);
        setResult(null);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { search, clear, result, loading, error };
}
