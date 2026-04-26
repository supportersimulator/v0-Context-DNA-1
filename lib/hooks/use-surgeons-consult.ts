'use client';

// =============================================================================
// useSurgeonsConsult — React hook for the 3-Surgeons consult bridge
//
// Talks to POST /api/3s/consult (web/dev) or, when running in Electron with
// an injected `window.electron.surgeons.consult`, prefers the IPC bridge so
// requests do not have to round-trip through the Next.js dev server.
//
// Surface mirrors the shape returned by the consult API:
//   { ok, cardiologist?, neurologist?, summary?, raw?, stderr?, error? }
// =============================================================================

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SurgeonsConsultResult {
  ok: boolean;
  cardiologist?: string;
  neurologist?: string;
  summary?: string;
  raw?: string;
  stderr?: string;
  error?: string;
}

export interface UseSurgeonsConsult {
  consult: (topic: string, files?: string[]) => Promise<SurgeonsConsultResult>;
  loading: boolean;
  error: string | null;
  lastResult: SurgeonsConsultResult | null;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Electron feature detect (runtime only, never bundles preload types)
// ---------------------------------------------------------------------------

interface ElectronSurgeonsBridge {
  consult?: (
    topic: string,
    files?: string[],
  ) => Promise<SurgeonsConsultResult>;
}

function getElectronConsult(): ElectronSurgeonsBridge['consult'] | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as {
    electron?: { surgeons?: ElectronSurgeonsBridge };
  }).electron?.surgeons;
  if (bridge && typeof bridge.consult === 'function') {
    return bridge.consult.bind(bridge);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSurgeonsConsult(): UseSurgeonsConsult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SurgeonsConsultResult | null>(
    null,
  );

  const consult = useCallback(
    async (
      topic: string,
      files?: string[],
    ): Promise<SurgeonsConsultResult> => {
      const trimmed = topic.trim();
      if (trimmed === '') {
        const result: SurgeonsConsultResult = {
          ok: false,
          error: 'topic is required',
        };
        setError(result.error ?? null);
        setLastResult(result);
        return result;
      }

      setLoading(true);
      setError(null);

      try {
        // Prefer Electron IPC if available; fall back to the web API.
        const electronConsult = getElectronConsult();
        let result: SurgeonsConsultResult;

        if (electronConsult) {
          result = await electronConsult(trimmed, files);
        } else {
          const res = await fetch('/api/3s/consult', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: trimmed,
              ...(files && files.length > 0 ? { file_paths: files } : {}),
            }),
          });
          const data: SurgeonsConsultResult = await res
            .json()
            .catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
          if (!res.ok && data.ok !== false) {
            data.ok = false;
            data.error = data.error ?? `HTTP ${res.status}`;
          }
          result = data;
        }

        if (!result.ok && result.error) {
          setError(result.error);
        }
        setLastResult(result);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const result: SurgeonsConsultResult = { ok: false, error: message };
        setError(message);
        setLastResult(result);
        return result;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setLastResult(null);
  }, []);

  return { consult, loading, error, lastResult, reset };
}
