'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  X,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import {
  useNotifications,
  getNotificationStore,
  type Notification,
  type NotificationType,
} from '@/lib/notifications/notification-store';

// ---------------------------------------------------------------------------
// Theme constants
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<NotificationType, string> = {
  info: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};

const TYPE_ICONS: Record<NotificationType, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isToday(ts: number): boolean {
  const now = new Date();
  const date = new Date(ts);
  return (
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate()
  );
}

// ---------------------------------------------------------------------------
// Toast (single notification card)
// ---------------------------------------------------------------------------

function Toast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  const Icon = TYPE_ICONS[notification.type];
  const color = TYPE_COLORS[notification.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="pointer-events-auto w-[340px] rounded-lg border bg-[#1a1a24] border-[#2a2a35] shadow-xl overflow-hidden"
    >
      <div className="flex items-start gap-2.5 p-3" style={{ borderLeft: `3px solid ${color}` }}>
        <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-[#e5e5e5] truncate">
              {notification.title}
            </p>
            <button
              onClick={() => onDismiss(notification.id)}
              className="flex-shrink-0 text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-[#8b8b95] mt-0.5 leading-relaxed line-clamp-2">
            {notification.message}
          </p>
          {notification.action && (
            <button
              onClick={() => {
                notification.action!.onClick();
                onDismiss(notification.id);
              }}
              className="mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded transition-colors"
              style={{ color, backgroundColor: `${color}20` }}
            >
              {notification.action.label}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ToastContainer (bottom-right floating toasts)
// ---------------------------------------------------------------------------

export function ToastContainer() {
  const { notifications, dismiss } = useNotifications();

  // Show latest 3 unread notifications as toasts
  const toasts = notifications.filter((n) => !n.read).slice(0, 3);

  return (
    <div className="fixed bottom-10 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((n) => (
          <Toast key={n.id} notification={n} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationPanel (dropdown list from bell)
// ---------------------------------------------------------------------------

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function NotificationItem({
  notification,
  onDismiss,
  onClick,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const Icon = TYPE_ICONS[notification.type];
  const color = TYPE_COLORS[notification.type];

  return (
    <div
      onClick={() => onClick(notification)}
      className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-[#111118] transition-colors cursor-pointer group"
      style={{
        borderLeft: notification.read ? '3px solid transparent' : `3px solid ${color}`,
      }}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-xs truncate ${notification.read ? 'text-[#8b8b95] font-normal' : 'text-[#e5e5e5] font-semibold'}`}
          >
            {notification.title}
          </p>
          <span className="text-[10px] text-[#6b6b75] flex-shrink-0 whitespace-nowrap">
            {timeAgo(notification.timestamp)}
          </span>
        </div>
        <p className="text-[11px] text-[#6b6b75] mt-0.5 leading-relaxed line-clamp-2">
          {notification.message}
        </p>
        {notification.action && (
          <span
            className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ color, backgroundColor: `${color}15` }}
          >
            {notification.action.label}
          </span>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-[#6b6b75] hover:text-[#e5e5e5] transition-all"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { notifications, dismiss, markAllRead } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleItemClick = useCallback((n: Notification) => {
    getNotificationStore().markRead(n.id);
    if (n.action) n.action.onClick();
  }, []);

  const handleClearAll = useCallback(() => {
    getNotificationStore().clear();
  }, []);

  if (!isOpen) return null;

  // Group by today / earlier
  const todayItems = notifications.filter((n) => isToday(n.timestamp));
  const earlierItems = notifications.filter((n) => !isToday(n.timestamp));

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute right-0 top-full mt-1.5 z-50 w-[360px] rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a35]">
        <span className="text-xs font-semibold text-[#e5e5e5]">Notifications</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={markAllRead}
            className="flex items-center gap-1 text-[10px] text-[#6b6b75] hover:text-[#e5e5e5] transition-colors px-1.5 py-0.5 rounded hover:bg-[#111118]"
            title="Mark all read"
          >
            <CheckCheck className="w-3 h-3" />
            <span>Read all</span>
          </button>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-[10px] text-[#6b6b75] hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-500/10"
            title="Clear all"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[400px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#6b6b75]">
            <Bell className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">No notifications</p>
          </div>
        ) : (
          <>
            {todayItems.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-[#111118]/60">
                  <span className="text-[10px] font-semibold text-[#6b6b75] uppercase tracking-wider">
                    Today
                  </span>
                </div>
                {todayItems.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onDismiss={dismiss}
                    onClick={handleItemClick}
                  />
                ))}
              </div>
            )}
            {earlierItems.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-[#111118]/60">
                  <span className="text-[10px] font-semibold text-[#6b6b75] uppercase tracking-wider">
                    Earlier
                  </span>
                </div>
                {earlierItems.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onDismiss={dismiss}
                    onClick={handleItemClick}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// NotificationBell (icon + badge + panel toggle)
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const { unreadCount, notifications } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const prevCountRef = useRef(unreadCount);

  // Trigger shake animation when new notification arrives
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  return (
    <div className="relative">
      <button
        onClick={() => setPanelOpen((prev) => !prev)}
        className="relative flex items-center justify-center w-8 h-8 rounded-md transition-colors text-[#6b6b75] hover:bg-[#1a1a24] hover:text-[#e5e5e5]"
        title="Notifications"
      >
        <motion.div
          animate={shake ? { rotate: [0, -12, 12, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        >
          <Bell className="w-4 h-4" />
        </motion.div>

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-[#ef4444] rounded-full leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {panelOpen && (
          <NotificationPanel
            isOpen={panelOpen}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
