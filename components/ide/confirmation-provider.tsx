'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCapabilityBus } from '@/lib/ide/capability-bus';
import type { ActionRequest } from '@/lib/ide/capability-bus';
import type { IntegrationAction } from '@/lib/ide/integration-manifest';
import { getSettingsStore } from '@/lib/ide/settings-store';
import type { SafetyTier } from '@/lib/ide/permission-guard';
import { ConfirmationDialog } from './confirmation-dialog';

// ---------------------------------------------------------------------------
// Pending confirmation state
// ---------------------------------------------------------------------------

interface PendingConfirmation {
  request: ActionRequest;
  action: IntegrationAction;
  resolve: (confirmed: boolean) => void;
}

// ---------------------------------------------------------------------------
// ConfirmationProvider — wraps the app to handle destructive action dialogs
// ---------------------------------------------------------------------------

export function ConfirmationProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    const bus = getCapabilityBus();

    bus.setConfirmationCallback(
      (request: ActionRequest, action: IntegrationAction) => {
        return new Promise<boolean>((resolve) => {
          setPending({ request, action, resolve });
        });
      },
    );

    // Cleanup: remove callback (though bus is a singleton, this is good hygiene)
    return () => {
      bus.setConfirmationCallback(async () => false);
    };
  }, []);

  const handleConfirm = useCallback(() => {
    if (pending) {
      pending.resolve(true);
      setPending(null);
    }
  }, [pending]);

  const handleCancel = useCallback(() => {
    if (pending) {
      pending.resolve(false);
      setPending(null);
    }
  }, [pending]);

  const isSynaptic = pending
    ? pending.request.sourcePanel === 'synaptic' || pending.request.sourcePanel.startsWith('synaptic-')
    : false;

  const tier: SafetyTier = isSynaptic
    ? (getSettingsStore().get('security.synapticTier' as any) ?? 'limited')
    : (getSettingsStore().get('security.permissionTier' as any) ?? 'standard');

  return (
    <>
      {children}
      {pending && (
        <ConfirmationDialog
          isOpen={true}
          action={pending.action}
          request={pending.request}
          tier={tier}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
