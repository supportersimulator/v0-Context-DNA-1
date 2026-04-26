'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type NotificationSource =
  | 'swarm'
  | 'harmonizer'
  | 'evidence'
  | 'health'
  | 'git'
  | 'system';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  source?: NotificationSource;
  action?: NotificationAction;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_DISMISS_MS = 5000;

// ---------------------------------------------------------------------------
// NotificationStore (singleton)
// ---------------------------------------------------------------------------

export class NotificationStore {
  private static instance: NotificationStore | null = null;

  notifications: Notification[] = [];
  listeners: Set<() => void> = new Set();

  private dismissTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private constructor() {}

  static getInstance(): NotificationStore {
    if (!NotificationStore.instance) {
      NotificationStore.instance = new NotificationStore();
    }
    return NotificationStore.instance;
  }

  // --- notify listeners ----------------------------------------------------

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  // --- core CRUD -----------------------------------------------------------

  add(
    type: NotificationType,
    title: string,
    message: string,
    opts?: {
      source?: NotificationSource;
      action?: NotificationAction;
    },
  ): Notification {
    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      source: opts?.source,
      action: opts?.action,
    };

    // Newest first
    this.notifications = [notification, ...this.notifications];
    this.emit();

    // Auto-dismiss info/success after 5 s
    if (type === 'info' || type === 'success') {
      const timer = setTimeout(() => {
        this.dismiss(notification.id);
      }, AUTO_DISMISS_MS);
      this.dismissTimers.set(notification.id, timer);
    }

    return notification;
  }

  // --- convenience helpers -------------------------------------------------

  info(title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }): Notification {
    return this.add('info', title, message, opts);
  }

  success(title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }): Notification {
    return this.add('success', title, message, opts);
  }

  warn(title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }): Notification {
    return this.add('warning', title, message, opts);
  }

  error(title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }): Notification {
    return this.add('error', title, message, opts);
  }

  // --- domain event helpers ------------------------------------------------

  /** swarm:completed — A swarm run finished */
  swarmCompleted(message?: string, action?: NotificationAction): Notification {
    return this.add('success', 'Swarm run completed', message ?? 'All agents finished execution.', {
      source: 'swarm',
      action,
    });
  }

  /** evidence:promoted — A claim was promoted to wisdom */
  evidencePromoted(message?: string, action?: NotificationAction): Notification {
    return this.add('info', 'Claim promoted to wisdom', message ?? 'Evidence threshold met — claim is now trusted wisdom.', {
      source: 'evidence',
      action,
    });
  }

  /** harmonizer:verdict — Code check verdict */
  harmonizerVerdict(verdict: 'ACCEPT' | 'REVIEW' | 'REJECT', message?: string, action?: NotificationAction): Notification {
    const type: NotificationType = verdict === 'ACCEPT' ? 'success' : verdict === 'REVIEW' ? 'warning' : 'error';
    return this.add(type, `Code check: ${verdict}`, message ?? `Harmonizer returned ${verdict} for the latest change.`, {
      source: 'harmonizer',
      action,
    });
  }

  // --- read state ----------------------------------------------------------

  markRead(id: string): void {
    const n = this.notifications.find((n) => n.id === id);
    if (n && !n.read) {
      n.read = true;
      this.emit();
    }
  }

  markAllRead(): void {
    let changed = false;
    for (const n of this.notifications) {
      if (!n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  // --- removal -------------------------------------------------------------

  dismiss(id: string): void {
    const timer = this.dismissTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.dismissTimers.delete(id);
    }
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.emit();
  }

  clear(): void {
    for (const timer of this.dismissTimers.values()) {
      clearTimeout(timer);
    }
    this.dismissTimers.clear();
    this.notifications = [];
    this.emit();
  }

  // --- derived state -------------------------------------------------------

  get unreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  // --- subscriptions -------------------------------------------------------

  subscribe(listener: () => void): void {
    this.listeners.add(listener);
  }

  unsubscribe(listener: () => void): void {
    this.listeners.delete(listener);
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton accessor
// ---------------------------------------------------------------------------

let _store: NotificationStore | null = null;

export function getNotificationStore(): NotificationStore {
  if (!_store) {
    _store = NotificationStore.getInstance();
  }
  return _store;
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export function useNotifications() {
  // getNotificationStore() is itself a stable singleton accessor; no ref needed.
  const store = getNotificationStore();
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    store.subscribe(listener);
    return () => store.unsubscribe(listener);
  }, [store]);

  const add = useCallback(
    (
      type: NotificationType,
      title: string,
      message: string,
      opts?: { source?: NotificationSource; action?: NotificationAction },
    ) => store.add(type, title, message, opts),
    [store],
  );

  const dismiss = useCallback((id: string) => store.dismiss(id), [store]);
  const markAllRead = useCallback(() => store.markAllRead(), [store]);
  const info = useCallback(
    (title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }) =>
      store.info(title, message, opts),
    [store],
  );
  const success = useCallback(
    (title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }) =>
      store.success(title, message, opts),
    [store],
  );
  const warn = useCallback(
    (title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }) =>
      store.warn(title, message, opts),
    [store],
  );
  const error = useCallback(
    (title: string, message: string, opts?: { source?: NotificationSource; action?: NotificationAction }) =>
      store.error(title, message, opts),
    [store],
  );

  return {
    notifications: store.notifications,
    unreadCount: store.unreadCount,
    add,
    dismiss,
    markAllRead,
    info,
    success,
    warn,
    error,
  };
}
