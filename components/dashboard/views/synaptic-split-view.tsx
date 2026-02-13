'use client';

/**
 * AI Chat Hub — Tabbed interface for all AI assistants
 *
 * Tabs: [Synaptic] [Claude] [Agents]
 *
 * - Synaptic: Local LLM (Qwen3), voice + text, free, fast
 * - Claude: Anthropic Claude, text streaming, powerful, cloud
 * - Agents: OpenHands iframe for autonomous coding tasks
 *
 * Batman/Alfred philosophy: Alfred (Synaptic) handles routine,
 * Batman (Claude) handles the hard stuff, same cave (panel).
 */

import { useState, useEffect, useCallback } from 'react';
import { Bot, Brain, Sparkles, ExternalLink, ClipboardCheck, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { SynapticChatView } from './synaptic-chat-view';
import { ClaudeChatView } from './claude-chat-view';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tab Definitions
// ---------------------------------------------------------------------------

type TabId = 'synaptic' | 'claude' | 'agents' | 'reviews';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Brain;
  accent: string;
  description: string;
}

const TABS: TabDef[] = [
  {
    id: 'synaptic',
    label: 'Synaptic',
    icon: Brain,
    accent: '#d97857',       // Warm coral (matches SynapticChatView)
    description: 'Local LLM',
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: Sparkles,
    accent: '#a78bfa',       // Violet (matches ClaudeChatView)
    description: 'Cloud AI',
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: Bot,
    accent: '#22c55e',       // Green (OpenHands brand)
    description: 'OpenHands',
  },
  {
    id: 'reviews',
    label: 'Reviews',
    icon: ClipboardCheck,
    accent: '#f59e0b',       // Amber (review/audit)
    description: 'Agent QA',
  },
];

const TAB_STORAGE_KEY = 'contextdna_ai_hub_tab';

// ---------------------------------------------------------------------------
// OpenHands Pane (preserved from original split view)
// ---------------------------------------------------------------------------

const OPENHANDS_URL = process.env.NEXT_PUBLIC_OPENHANDS_URL || 'http://localhost:3001';

function OpenHandsPane() {
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {iframeError ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
          <div className="w-14 h-14 rounded-xl bg-[#1a1a24] flex items-center justify-center">
            <Bot className="w-7 h-7 text-[#6b6b75]" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-[#e5e5e5]">
              OpenHands Agent
            </p>
            <p className="text-xs text-[#6b6b75] max-w-[280px]">
              API agents integration for autonomous coding tasks.
              Start OpenHands to connect.
            </p>
            <p className="text-xs text-[#6b6b75] font-mono">
              {OPENHANDS_URL}
            </p>
          </div>
          <a
            href={OPENHANDS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#22c55e] hover:text-[#22c55e]/80 transition-colors"
          >
            Open in browser
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <div className="flex-1 relative">
          <iframe
            src={OPENHANDS_URL}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="OpenHands AI Agent"
            onError={() => setIframeError(true)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviews Pane — Agent review history + plan progress
// ---------------------------------------------------------------------------

interface AgentReview {
  agent_id: string;
  agent_task: string;
  status: string;
  enqueued_at: number;
  review?: {
    alignment: number;
    alignment_note: string;
    verdict: string;
    gaps: string[];
    next_steps: string[];
    risks: string[];
    source: string;
  };
}

function ReviewsPane() {
  const [reviews, setReviews] = useState<AgentReview[]>([]);
  const [planProgress, setPlanProgress] = useState<{
    total: number;
    completed: number;
    percentage: number;
    plan_name: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [revRes, planRes] = await Promise.all([
        fetch('/api/agent-reviews').then(r => r.ok ? r.json() : { reviews: [] }).catch(() => ({ reviews: [] })),
        fetch('/api/agent-reviews?plan=1').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setReviews(revRes.reviews || revRes || []);
      if (planRes) setPlanProgress(planRes);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchData]);

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'on_track': return '#22c55e';
      case 'needs_adjustment': return '#f59e0b';
      case 'off_track': return '#ef4444';
      default: return '#6b6b75';
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'on_track': return CheckCircle2;
      case 'needs_adjustment': return AlertCircle;
      case 'off_track': return AlertCircle;
      default: return Clock;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] overflow-y-auto">
      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Plan Progress */}
        {planProgress && planProgress.total > 0 && (
          <div className="rounded-lg border border-[#2a2a35] bg-[#111118] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#a0a0a5]">Active Plan</span>
              <span className="text-xs text-[#f59e0b]">
                {planProgress.completed}/{planProgress.total} ({planProgress.percentage}%)
              </span>
            </div>
            {planProgress.plan_name && (
              <p className="text-sm text-[#e5e5e5] mb-2 truncate">{planProgress.plan_name}</p>
            )}
            <div className="h-2 bg-[#1e1e24] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${planProgress.percentage}%`,
                  backgroundColor: '#f59e0b',
                }}
              />
            </div>
          </div>
        )}

        {/* Reviews List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#a0a0a5]">Agent Reviews</span>
            <span className="text-xs text-[#555]">{reviews.length} total</span>
          </div>

          {loading ? (
            <div className="text-center py-8 text-[#6b6b75] text-sm">Loading...</div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardCheck className="w-8 h-8 text-[#333] mx-auto mb-2" />
              <p className="text-sm text-[#6b6b75]">No agent reviews yet</p>
              <p className="text-xs text-[#444] mt-1">Reviews appear when Atlas spawns Task agents</p>
            </div>
          ) : (
            [...reviews].reverse().map((entry) => {
              const review = entry.review;
              const VerdictIcon = review ? getVerdictIcon(review.verdict) : Clock;
              const verdictColor = review ? getVerdictColor(review.verdict) : '#6b6b75';
              const alignment = review?.alignment ?? 0;
              const timeAgo = entry.enqueued_at
                ? `${Math.round((Date.now() / 1000 - entry.enqueued_at) / 60)}m ago`
                : '';

              return (
                <div
                  key={entry.agent_id}
                  className="rounded-lg border border-[#2a2a35] bg-[#111118] p-3 space-y-2"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <VerdictIcon
                        className="w-4 h-4 shrink-0"
                        style={{ color: verdictColor }}
                      />
                      <span className="text-sm text-[#e5e5e5] truncate">
                        {entry.agent_task?.slice(0, 80) || 'Unknown task'}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#555] shrink-0">{timeAgo}</span>
                  </div>

                  {/* Review details */}
                  {review ? (
                    <>
                      {/* Alignment bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[#1e1e24] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${alignment * 100}%`,
                              backgroundColor: verdictColor,
                            }}
                          />
                        </div>
                        <span className="text-xs text-[#a0a0a5] w-8 text-right">
                          {(alignment * 100).toFixed(0)}%
                        </span>
                      </div>

                      {/* Note */}
                      {review.alignment_note && (
                        <p className="text-xs text-[#888]">{review.alignment_note}</p>
                      )}

                      {/* Gaps */}
                      {review.gaps && review.gaps.length > 0 && (
                        <div className="text-xs">
                          <span className="text-[#f59e0b]">Gaps: </span>
                          <span className="text-[#888]">{review.gaps.slice(0, 2).join('; ')}</span>
                        </div>
                      )}

                      {/* Next steps */}
                      {review.next_steps && review.next_steps.length > 0 && (
                        <div className="text-xs">
                          <span className="text-[#22c55e]">Next: </span>
                          <span className="text-[#888]">{review.next_steps.slice(0, 2).join('; ')}</span>
                        </div>
                      )}

                      {/* Source badge */}
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: review.source === 'qwen3' ? 'rgba(217,120,87,0.15)' : 'rgba(100,100,100,0.15)',
                            color: review.source === 'qwen3' ? '#d97857' : '#888',
                          }}
                        >
                          {review.source === 'qwen3' ? 'Qwen3' : 'Fallback'}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded uppercase"
                          style={{
                            backgroundColor: `${verdictColor}15`,
                            color: verdictColor,
                          }}
                        >
                          {review.verdict?.replace('_', ' ')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-[#555]">
                      {entry.status === 'completed' ? 'Review pending...' : entry.status}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component — Exported as SynapticSplitView for backward compat
// ---------------------------------------------------------------------------

export function SynapticSplitView() {
  const [activeTab, setActiveTab] = useState<TabId>('synaptic');
  // Track which tabs have been visited (lazy mount, keep alive)
  const [mounted, setMounted] = useState<Set<TabId>>(new Set(['synaptic']));

  // Persist tab selection
  useEffect(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
    if (saved && TABS.some(t => t.id === saved)) {
      setActiveTab(saved);
      setMounted(prev => new Set(prev).add(saved));
    }
  }, []);

  const switchTab = useCallback((id: TabId) => {
    setActiveTab(id);
    setMounted(prev => new Set(prev).add(id));
    localStorage.setItem(TAB_STORAGE_KEY, id);
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* Tab Bar */}
      <div className="flex items-center h-9 px-1 border-b border-[#2a2a35] bg-[#111118] flex-shrink-0 select-none gap-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 h-full text-xs transition-colors relative',
                'hover:bg-[#1e1e24]',
                isActive
                  ? 'text-[#f5f5f5] font-medium'
                  : 'text-[#6b6b75]'
              )}
            >
              <Icon
                className="w-3.5 h-3.5"
                style={{ color: isActive ? tab.accent : undefined }}
              />
              <span>{tab.label}</span>
              <span
                className={cn(
                  'text-[10px] ml-1 hidden sm:inline',
                  isActive ? 'text-[#888]' : 'text-[#555]'
                )}
              >
                {tab.description}
              </span>
              {/* Active indicator bar */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                  style={{ backgroundColor: tab.accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content — keep-alive: mount once, toggle visibility */}
      <div className="flex-1 min-h-0 relative">
        {mounted.has('synaptic') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'synaptic' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <SynapticChatView />
          </div>
        )}
        {mounted.has('claude') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'claude' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <ClaudeChatView />
          </div>
        )}
        {mounted.has('agents') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'agents' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <OpenHandsPane />
          </div>
        )}
        {mounted.has('reviews') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'reviews' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <ReviewsPane />
          </div>
        )}
      </div>
    </div>
  );
}
