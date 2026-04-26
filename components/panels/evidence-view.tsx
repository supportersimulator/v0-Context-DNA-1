'use client';

// =============================================================================
// Evidence View — Epistemic backbone visualization
// Claims → Quarantine → Outcomes → Promotions → Applied Wisdom
// =============================================================================

import { useState, useCallback } from 'react';
import {
  Beaker,
  Scale,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCw,
  FlaskConical,
  Award,
  ShieldAlert,
  Eye,
  Receipt as ReceiptIcon,
  Trash2,
} from 'lucide-react';
import { useEvidencePipeline, useEvidenceClaims, useEvidencePromotions } from '@/lib/hooks/use-evidence';
import { useReceipts } from '@/lib/hooks/use-receipts';
import { ReceiptRow } from '@/components/panels/receipt-row';
import type { EvidencePipelineStats, EvidenceClaim, EvidencePromotion } from '@/lib/api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusBadge(status: EvidenceClaim['status']) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">
          <Clock className="w-2.5 h-2.5" />
          pending
        </span>
      );
    case 'promoted':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
          <CheckCircle2 className="w-2.5 h-2.5" />
          promoted
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-400/10 text-red-400 border border-red-400/20">
          <XCircle className="w-2.5 h-2.5" />
          rejected
        </span>
      );
    case 'quarantined':
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-400/10 text-orange-400 border border-orange-400/20">
          <ShieldAlert className="w-2.5 h-2.5" />
          quarantined
        </span>
      );
  }
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'bg-[#22c55e]';
  if (confidence >= 0.5) return 'bg-amber-400';
  return 'bg-red-400';
}

// ---------------------------------------------------------------------------
// StatCard — single metric in the top stats bar
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: typeof Beaker;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded bg-[#12121a] border border-[#2a2a35] min-w-[64px]">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-sm font-semibold text-[#e5e5e5]">{value}</span>
      <span className="text-[9px] text-[#6b6b75] uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatsBar — horizontal row of pipeline metrics
// ---------------------------------------------------------------------------

function StatsBar({ stats }: { stats: EvidencePipelineStats }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
      <StatCard icon={Beaker} value={stats.claims} label="Claims" color="text-[#3b82f6]" />
      <StatCard icon={ShieldAlert} value={stats.quarantine} label="Quarantine" color="text-orange-400" />
      <StatCard icon={Eye} value={stats.outcomes} label="Outcomes" color="text-[#22c55e]" />
      <StatCard icon={Award} value={stats.promotions} label="Promoted" color="text-purple-400" />
      <StatCard icon={ShieldCheck} value={stats.applied_to_wisdom} label="Wisdom" color="text-[#22c55e]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClaimRow — single claim in the Claims tab
// ---------------------------------------------------------------------------

function ClaimRow({ claim }: { claim: EvidenceClaim }) {
  return (
    <div className="px-3 py-2 border-b border-[#2a2a35] last:border-b-0 hover:bg-[#1a1a24] transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#e5e5e5] leading-relaxed break-words">
            {claim.statement}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {statusBadge(claim.status)}
            <span className="text-[10px] text-[#6b6b75] bg-[#12121a] border border-[#2a2a35] rounded px-1.5 py-0.5">
              {claim.source}
            </span>
            <span className="text-[10px] text-[#6b6b75] flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(claim.created_at)}
            </span>
          </div>
        </div>
        {/* Confidence bar */}
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 pt-0.5">
          <span className="text-[10px] text-[#6b6b75]">{(claim.confidence * 100).toFixed(0)}%</span>
          <div className="w-12 h-1 rounded-full bg-[#2a2a35] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${confidenceColor(claim.confidence)}`}
              style={{ width: `${Math.min(100, claim.confidence * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromotionRow — single promotion in the Promotions tab
// ---------------------------------------------------------------------------

function PromotionRow({ promotion }: { promotion: EvidencePromotion }) {
  return (
    <div className="px-3 py-2 border-b border-[#2a2a35] last:border-b-0 hover:bg-[#1a1a24] transition-colors">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#e5e5e5] leading-relaxed break-words">
            {promotion.statement}
          </p>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#6b6b75]">
            <span className="flex items-center gap-0.5">
              <Scale className="w-2.5 h-2.5" />
              {(promotion.confidence * 100).toFixed(0)}% confidence
            </span>
            <span className="flex items-center gap-0.5">
              <Eye className="w-2.5 h-2.5" />
              {promotion.outcome_count} outcomes
            </span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {timeAgo(promotion.promoted_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineFunnel — visual funnel in the Pipeline tab
// ---------------------------------------------------------------------------

function PipelineFunnel({ stats }: { stats: EvidencePipelineStats }) {
  const stages = [
    { label: 'Claims', count: stats.claims, icon: Beaker, color: 'text-[#3b82f6]', bg: 'bg-[#3b82f6]/10', border: 'border-[#3b82f6]/20' },
    { label: 'Quarantine', count: stats.quarantine, icon: ShieldAlert, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
    { label: 'Outcomes', count: stats.outcomes, icon: Eye, color: 'text-[#22c55e]', bg: 'bg-[#22c55e]/10', border: 'border-[#22c55e]/20' },
    { label: 'Promoted', count: stats.promotions, icon: Award, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
    { label: 'Wisdom', count: stats.applied_to_wisdom, icon: ShieldCheck, color: 'text-[#22c55e]', bg: 'bg-[#22c55e]/10', border: 'border-[#22c55e]/20' },
  ];

  return (
    <div className="px-3 py-4">
      <div className="flex flex-col gap-1">
        {stages.map((stage, i) => {
          const Icon = stage.icon;
          return (
            <div key={stage.label}>
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded border ${stage.bg} ${stage.border}`}>
                <Icon className={`w-4 h-4 ${stage.color} flex-shrink-0`} />
                <span className={`text-xs font-medium ${stage.color} flex-1`}>{stage.label}</span>
                <span className="text-sm font-semibold text-[#e5e5e5]">{stage.count}</span>
              </div>
              {i < stages.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowRight className="w-3 h-3 text-[#6b6b75] rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Promotion rate */}
      {stats.claims > 0 && (
        <div className="mt-4 px-3 py-2 rounded bg-[#12121a] border border-[#2a2a35]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#6b6b75] uppercase tracking-wider">Promotion Rate</span>
            <span className="text-xs font-medium text-[#e5e5e5]">
              {((stats.promotions / stats.claims) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#2a2a35] overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-400 transition-all"
              style={{ width: `${Math.min(100, (stats.promotions / stats.claims) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Epistemic philosophy note */}
      <div className="mt-3 text-[10px] text-[#6b6b75] leading-relaxed px-1">
        Claims require n&ge;30 observations, effect_size&ge;0.05, and confidence&ge;0.7 for promotion.
        Nothing becomes wisdom without measured outcomes.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-full bg-[#3b82f6]/10 flex items-center justify-center mb-3">
        <Scale className="w-6 h-6 text-[#3b82f6]" />
      </div>
      <h3 className="text-sm font-medium text-[#e5e5e5] mb-1">Evidence Pipeline</h3>
      <p className="text-xs text-[#6b6b75] max-w-[260px]">
        The epistemic backbone of ContextDNA. Claims are made, measured against outcomes, and only promoted to wisdom through empirical evidence.
      </p>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-[#6b6b75]">
        <span className="flex items-center gap-1"><Beaker className="w-3 h-3" /> Claim</span>
        <ArrowRight className="w-3 h-3" />
        <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Quarantine</span>
        <ArrowRight className="w-3 h-3" />
        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Outcome</span>
        <ArrowRight className="w-3 h-3" />
        <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Wisdom</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptsPanel — 3-Surgeons audit receipts tab body
// ---------------------------------------------------------------------------

function ReceiptsPanel() {
  const { receipts, count, file, loading, error, refresh, purge } = useReceipts({
    limit: 20,
    format: 'rendered',
  });
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  const handlePurge = useCallback(async () => {
    setPurging(true);
    try {
      await purge();
    } finally {
      setPurging(false);
      setConfirmingPurge(false);
    }
  }, [purge]);

  return (
    <div className="flex flex-col">
      {/* Header row */}
      <div className="px-3 py-2 border-b border-[#2a2a35] flex items-center gap-2">
        <ReceiptIcon className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[#e5e5e5] font-medium">{count} receipts</div>
          {file && (
            <div className="text-[10px] text-[#6b6b75] font-mono truncate" title={file}>
              {file}
            </div>
          )}
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className="text-[#6b6b75] hover:text-[#e5e5e5] transition-colors p-1 disabled:opacity-30"
          title="Refresh receipts"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
        {confirmingPurge ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setConfirmingPurge(false)}
              disabled={purging}
              className="px-2 py-0.5 text-[10px] text-[#6b6b75] hover:text-[#e5e5e5] disabled:opacity-30"
            >
              Cancel
            </button>
            <button
              onClick={handlePurge}
              disabled={purging}
              className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-30 flex items-center gap-1"
            >
              {purging ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
              Confirm purge
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingPurge(true)}
            disabled={loading || count === 0}
            className="px-2 py-0.5 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors flex items-center gap-1 disabled:opacity-30"
            title="Purge all receipts"
          >
            <Trash2 className="w-2.5 h-2.5" />
            Purge all
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-400/10 border-b border-red-400/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400 flex-1 break-all">{error}</span>
        </div>
      )}

      {/* Body */}
      {loading && receipts.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 text-[#3b82f6] animate-spin" />
        </div>
      ) : receipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-6">
          <ReceiptIcon className="w-6 h-6 text-[#6b6b75] mb-2" />
          <p className="text-xs text-[#e5e5e5] mb-1">No receipts yet</p>
          <p className="text-[11px] text-[#6b6b75] max-w-[260px]">
            Run a 3-Surgeons consult to generate one.
          </p>
        </div>
      ) : (
        <div>
          {receipts.map((r, i) => (
            <ReceiptRow
              key={`${r.timestamp ?? 'rcpt'}-${i}`}
              receipt={r}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EvidenceView — main export
// ---------------------------------------------------------------------------

type TabKey = 'claims' | 'promotions' | 'pipeline' | 'receipts';

export function EvidenceView() {
  const { stats, isLoading: statsLoading, error: statsError, refresh } = useEvidencePipeline();
  const { claims, isLoading: claimsLoading } = useEvidenceClaims();
  const { promotions, isLoading: promotionsLoading } = useEvidencePromotions();
  const [activeTab, setActiveTab] = useState<TabKey>('claims');

  const handleRefresh = useCallback(() => {
    refresh();
  }, [refresh]);

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'claims', label: 'Claims', count: claims.length },
    { key: 'promotions', label: 'Promotions', count: promotions.length },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'receipts', label: 'Receipts' },
  ];

  // Loading state
  if (statsLoading) {
    return (
      <div className="flex flex-col h-full bg-[#0f0f17] items-center justify-center">
        <Loader2 className="w-5 h-5 text-[#3b82f6] animate-spin mb-2" />
        <span className="text-xs text-[#6b6b75]">Loading evidence pipeline...</span>
      </div>
    );
  }

  // Error state
  if (statsError) {
    return (
      <div className="flex flex-col h-full bg-[#0f0f17]">
        <div className="px-3 py-2 bg-red-400/10 border-b border-red-400/20 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400 flex-1">{statsError}</span>
          <button
            onClick={handleRefresh}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
          >
            <RotateCw className="w-3 h-3" /> Retry
          </button>
        </div>
        <EmptyState />
      </div>
    );
  }

  // No data state
  if (!stats) {
    return (
      <div className="flex flex-col h-full bg-[#0f0f17]">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f17]">
      {/* Stats bar */}
      <div className="border-b border-[#2a2a35]">
        <div className="flex items-center justify-between px-3 pt-2 pb-0.5">
          <span className="text-[10px] text-[#6b6b75] uppercase tracking-wider">Pipeline Overview</span>
          <button
            onClick={handleRefresh}
            className="text-[#6b6b75] hover:text-[#e5e5e5] transition-colors p-0.5"
            title="Refresh pipeline data"
          >
            <RotateCw className="w-3 h-3" />
          </button>
        </div>
        <StatsBar stats={stats} />
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#2a2a35]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-[#e5e5e5]'
                : 'text-[#6b6b75] hover:text-[#a0a0ab]'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-[10px] text-[#6b6b75]">({tab.count})</span>
            )}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3b82f6]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'claims' && (
          <>
            {claimsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 text-[#3b82f6] animate-spin" />
              </div>
            ) : claims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-6">
                <Beaker className="w-6 h-6 text-[#6b6b75] mb-2" />
                <p className="text-xs text-[#6b6b75]">
                  No claims yet. Claims are generated from learnings, bug fixes, and architecture decisions.
                </p>
              </div>
            ) : (
              claims.map((claim) => (
                <ClaimRow key={claim.id} claim={claim} />
              ))
            )}
          </>
        )}

        {activeTab === 'promotions' && (
          <>
            {promotionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 text-[#3b82f6] animate-spin" />
              </div>
            ) : promotions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-6">
                <Award className="w-6 h-6 text-[#6b6b75] mb-2" />
                <p className="text-xs text-[#6b6b75]">
                  No promotions yet. Claims are promoted when they accumulate sufficient empirical evidence.
                </p>
              </div>
            ) : (
              promotions.map((promotion) => (
                <PromotionRow key={promotion.claim_id} promotion={promotion} />
              ))
            )}
          </>
        )}

        {activeTab === 'pipeline' && (
          <PipelineFunnel stats={stats} />
        )}

        {activeTab === 'receipts' && (
          <ReceiptsPanel />
        )}
      </div>
    </div>
  );
}
