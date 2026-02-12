'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Shield, Bot, X } from 'lucide-react';
import type { ActionRequest } from '@/lib/ide/capability-bus';
import type { IntegrationAction } from '@/lib/ide/integration-manifest';
import type { SafetyTier } from '@/lib/ide/permission-guard';
import { TIER_LABELS } from '@/lib/ide/permission-guard';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConfirmationDialogProps {
  isOpen: boolean;
  action: IntegrationAction;
  request: ActionRequest;
  tier: SafetyTier;
  onConfirm: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Auto-cancel timeout (30 seconds)
// ---------------------------------------------------------------------------

const AUTO_CANCEL_MS = 30_000;

// ---------------------------------------------------------------------------
// ConfirmationDialog
// ---------------------------------------------------------------------------

export function ConfirmationDialog({
  isOpen,
  action,
  request,
  tier,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [remainingMs, setRemainingMs] = useState(AUTO_CANCEL_MS);
  const isSynaptic = request.sourcePanel === 'synaptic' || request.sourcePanel.startsWith('synaptic-');

  // Auto-cancel countdown
  useEffect(() => {
    if (!isOpen) return;
    setRemainingMs(AUTO_CANCEL_MS);
    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          onCancel();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, onCancel]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const paramSummary = Object.entries(request.params)
    .filter(([k]) => !k.startsWith('_'))
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-white/10 bg-[#0a0a0f] p-6 shadow-2xl">
        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          {action.destructive ? (
            <div className="rounded-full bg-red-500/20 p-2">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
          ) : (
            <div className="rounded-full bg-yellow-500/20 p-2">
              <Shield size={20} className="text-yellow-400" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-white">
              {action.destructive ? 'Destructive Action' : 'Action Confirmation'}
            </h3>
            <p className="text-xs text-white/50">
              {TIER_LABELS[tier]} tier
              {isSynaptic && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300">
                  <Bot size={10} /> Synaptic
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action details */}
        <div className="mb-4 space-y-2">
          <div className="rounded border border-white/5 bg-white/5 p-3">
            <p className="text-xs font-medium text-white/70">Action</p>
            <p className="text-sm font-mono text-white">{action.label}</p>
            <p className="mt-1 text-xs text-white/40">{action.description}</p>
          </div>

          {paramSummary && (
            <div className="rounded border border-white/5 bg-white/5 p-3">
              <p className="text-xs font-medium text-white/70">Parameters</p>
              <pre className="mt-1 text-xs font-mono text-white/60 whitespace-pre-wrap break-all">
                {paramSummary}
              </pre>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-white/40">
            <span>Source: {request.sourcePanel}</span>
            <span>Auto-cancel in {Math.ceil(remainingMs / 1000)}s</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-red-500/60 transition-all duration-1000 ease-linear"
            style={{ width: `${(remainingMs / AUTO_CANCEL_MS) * 100}%` }}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            autoFocus
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white ${
              action.destructive
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-green-600 hover:bg-green-500'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
