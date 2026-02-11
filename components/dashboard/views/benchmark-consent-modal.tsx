'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { X, Shield, ShieldCheck, Eye, EyeOff, Users, Lock, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkConsentModalProps {
  /** Controls modal visibility */
  isOpen: boolean;
  /** Called when user dismisses or closes the modal */
  onClose: () => void;
  /** Called when user completes consent and clicks "Sync Configs" */
  onConsent: (username: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCALSTORAGE_KEY_USERNAME = 'contextdna_benchmark_username';
const LOCALSTORAGE_KEY_CONSENTED = 'contextdna_benchmark_consented';

// Data that IS shared
const SHARED_DATA = [
  {
    icon: Hash,
    label: 'Machine profile hash',
    detail: 'A one-way SHA-256 hash of your hardware profile. Cannot be reversed to identify your machine.',
  },
  {
    icon: Shield,
    label: 'Benchmark scores',
    detail: 'Injection latency, throughput, memory usage, and other performance metrics from your runs.',
  },
  {
    icon: Users,
    label: 'Config settings',
    detail: 'Section toggles, scheduler intervals, model selection, cache strategy, and other tunable parameters.',
  },
] as const;

// Data that is NEVER shared
const NOT_SHARED_DATA = [
  'API keys, tokens, or secrets of any kind',
  'Personal information (name, email, IP address)',
  'File paths, directory names, or folder structure',
  'Code contents, project names, or repository URLs',
  'Conversation history or session transcripts',
  'Environment variables or .env file contents',
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BenchmarkConsentModal({
  isOpen,
  onClose,
  onConsent,
}: BenchmarkConsentModalProps) {
  // State
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [username, setUsername] = useState('');

  // Refs
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // Load saved username from localStorage on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(LOCALSTORAGE_KEY_USERNAME);
      if (saved) setUsername(saved);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Reset transient state when modal opens
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setHasScrolledToBottom(false);
      setIsAgreed(false);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // ESC to close
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  // ---------------------------------------------------------------------------
  // IntersectionObserver on the sentinel at the bottom of scrollable content.
  // When it becomes visible the user has scrolled far enough.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || hasScrolledToBottom) return;

    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasScrolledToBottom(true);
        }
      },
      { threshold: 1.0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, hasScrolledToBottom]);

  // ---------------------------------------------------------------------------
  // Capture the Radix ScrollArea viewport element for the observer root
  // ---------------------------------------------------------------------------
  const scrollAreaCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // Radix ScrollArea places the viewport as the first child with
      // data-slot="scroll-area-viewport"
      const viewport = node.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]',
      );
      scrollViewportRef.current = viewport;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const handleSync = () => {
    const finalUsername = username.trim() || 'Anonymous';
    localStorage.setItem(LOCALSTORAGE_KEY_USERNAME, finalUsername);
    localStorage.setItem(LOCALSTORAGE_KEY_CONSENTED, 'true');
    onConsent(finalUsername);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!isOpen) return null;

  const checkboxEnabled = hasScrolledToBottom;
  const syncEnabled = isAgreed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative z-10 w-full max-w-lg mx-4 flex flex-col max-h-[90vh] bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">
              Compare Configs
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <ScrollArea
          className="flex-1 min-h-0"
          ref={scrollAreaCallbackRef}
        >
          <div className="px-5 py-4 space-y-5">
            {/* Intro */}
            <div className="space-y-1.5">
              <p className="text-sm text-zinc-300 leading-relaxed">
                Compare your Context DNA configuration and benchmark results
                with the community. Before we sync, here is exactly what gets
                shared — and what never leaves your machine.
              </p>
            </div>

            {/* ── What IS shared ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-medium text-zinc-200">
                  Data that is shared
                </h3>
              </div>

              <div className="space-y-2">
                {SHARED_DATA.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/40"
                  >
                    <div className="mt-0.5 w-8 h-8 shrink-0 rounded-md bg-emerald-500/10 flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200">
                        {item.label}
                      </div>
                      <div className="text-xs text-zinc-500 leading-relaxed mt-0.5">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── What is NOT shared ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-medium text-zinc-200">
                  Never shared
                </h3>
              </div>

              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 p-3">
                <ul className="space-y-1.5">
                  {NOT_SHARED_DATA.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-xs text-zinc-400"
                    >
                      <Lock className="w-3.5 h-3.5 text-red-400/70 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── How anonymization works ── */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-200">
                How anonymization works
              </h3>
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/40 p-3 space-y-2">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Your machine is identified by a <code className="text-emerald-400 bg-zinc-800 px-1 py-0.5 rounded font-mono text-[11px]">machine_profile_hash</code> — a
                  one-way SHA-256 digest of your hardware profile (CPU model,
                  core count, RAM size, GPU capabilities). This hash cannot be
                  reversed or used to fingerprint your device.
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  No serial numbers, MAC addresses, hostnames, or other
                  identifiable hardware markers are included. The hash exists
                  only to group your benchmark runs so you can track your own
                  performance over time.
                </p>
              </div>
            </div>

            {/* ── Username field ── */}
            <div className="space-y-2">
              <label
                htmlFor="benchmark-username"
                className="block text-sm font-medium text-zinc-200"
              >
                Display name{' '}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <Input
                id="benchmark-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Anonymous"
                className="bg-zinc-800/60 border-zinc-700/50 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
              />
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Shown on community leaderboards. Leave blank to appear as
                &quot;Anonymous&quot;. You can change this later in settings.
              </p>
            </div>

            {/* Scroll sentinel — must be reached before checkbox activates */}
            <div ref={scrollSentinelRef} className="h-px" aria-hidden="true" />
          </div>
        </ScrollArea>

        {/* ── Footer (always visible) ── */}
        <div className="shrink-0 border-t border-zinc-800 px-5 py-4 space-y-4 bg-zinc-900">
          {/* Scroll hint */}
          {!hasScrolledToBottom && (
            <p className="text-[11px] text-zinc-500 text-center animate-pulse">
              Scroll down to review all terms before agreeing
            </p>
          )}

          {/* Checkbox */}
          <label
            className={cn(
              'flex items-start gap-3 select-none rounded-lg p-3 transition-colors',
              checkboxEnabled
                ? 'cursor-pointer hover:bg-zinc-800/40'
                : 'cursor-not-allowed opacity-50',
            )}
          >
            <span className="relative mt-0.5 flex shrink-0">
              <input
                type="checkbox"
                checked={isAgreed}
                disabled={!checkboxEnabled}
                onChange={(e) => setIsAgreed(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'block w-4.5 h-4.5 rounded border transition-all',
                  isAgreed
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'bg-zinc-800 border-zinc-600',
                  !checkboxEnabled && 'border-zinc-700 bg-zinc-800/50',
                )}
              >
                {isAgreed && (
                  <svg
                    className="w-full h-full text-white p-0.5"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                  </svg>
                )}
              </span>
            </span>
            <span className="text-xs text-zinc-400 leading-relaxed">
              I agree to share my anonymized benchmark data with the Context DNA
              community
            </span>
          </label>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSync}
              disabled={!syncEnabled}
              className={cn(
                'flex-1 transition-all',
                syncEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/15'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed',
              )}
            >
              Sync Configs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
