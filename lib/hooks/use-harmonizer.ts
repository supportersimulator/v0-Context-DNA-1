'use client';

// =============================================================================
// useHarmonizer — React hook for Harmonizer 7-gate code checking
// Pure REST (check is request/response)
// =============================================================================

import { useState, useCallback } from 'react';
import { checkCode } from '@/lib/api/harmonizer';
import type { HarmonizerCheckResponse } from '@/lib/api/types';

export function useHarmonizerCheck() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HarmonizerCheckResponse | null>(null);

  const check = useCallback(async (code: string, language = 'python') => {
    setLoading(true);
    setError(null);
    try {
      const res = await checkCode({ code, language });
      setResult(res);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Harmonizer check failed';
      setError(msg);
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { check, clear, result, loading, error };
}
