'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  X,
  Volume2,
  VolumeX,
  Settings,
  ChevronDown,
  ChevronRight,
  Zap,
  RefreshCw,
  Trash2,
  CheckCheck,
  Circle,
  Shield,
  GitMerge,
  Loader2,
  Activity,
  Bot,
  Eye,
  Database,
} from 'lucide-react';
import { getServiceUrl, getServiceWsUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: number;
  dismissed: boolean;
  source?: string;
}

type EventType =
  | 'sync_complete'
  | 'injection_fired'
  | 'learning_captured'
  | 'build_success'
  | 'agent_spawned'
  | 'watchdog_restart';

interface SystemEvent {
  id: string;
  type: EventType;
  message: string;
  timestamp: number;
}

interface ActionItem {
  id: string;
  kind: 'tool_approval' | 'sop_review' | 'sync_conflict';
  title: string;
  detail: string;
  timestamp: number;
}

interface NotificationSettings {
  alerts: boolean;
  events: boolean;
  actions: boolean;
  sound: boolean;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------
function severityIcon(severity: AlertSeverity) {
  switch (severity) {
    case 'critical':
      return <AlertCircle className="w-3.5 h-3.5 text-[#ef4444] flex-shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-3.5 h-3.5 text-[#e5c07b] flex-shrink-0" />;
    case 'info':
      return <Info className="w-3.5 h-3.5 text-[#3b82f6] flex-shrink-0" />;
  }
}

function severityBorder(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical': return 'border-l-[#ef4444]';
    case 'warning': return 'border-l-[#e5c07b]';
    case 'info': return 'border-l-[#3b82f6]';
  }
}

function severityBg(severity: AlertSeverity): string {
  switch (severity) {
    case 'critical': return 'bg-[#ef4444]/5';
    case 'warning': return 'bg-[#e5c07b]/5';
    case 'info': return 'bg-[#3b82f6]/5';
  }
}

function eventTypeIcon(type: EventType) {
  switch (type) {
    case 'sync_complete':
      return <Database className="w-3 h-3 text-[#22c55e] flex-shrink-0" />;
    case 'injection_fired':
      return <Zap className="w-3 h-3 text-[#c678dd] flex-shrink-0" />;
    case 'learning_captured':
      return <CheckCircle2 className="w-3 h-3 text-[#3b82f6] flex-shrink-0" />;
    case 'build_success':
      return <CheckCircle2 className="w-3 h-3 text-[#22c55e] flex-shrink-0" />;
    case 'agent_spawned':
      return <Bot className="w-3 h-3 text-[#3b82f6] flex-shrink-0" />;
    case 'watchdog_restart':
      return <RefreshCw className="w-3 h-3 text-[#e5c07b] flex-shrink-0" />;
  }
}

function actionKindIcon(kind: ActionItem['kind']) {
  switch (kind) {
    case 'tool_approval':
      return <Shield className="w-3 h-3 text-[#e5c07b] flex-shrink-0" />;
    case 'sop_review':
      return <Eye className="w-3 h-3 text-[#c678dd] flex-shrink-0" />;
    case 'sync_conflict':
      return <GitMerge className="w-3 h-3 text-[#ef4444] flex-shrink-0" />;
  }
}

function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------
function Section({ title, count, badge, defaultOpen = true, children }: {
  title: string;
  count?: number;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1 hover:bg-[#1a1a24] text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75] border-b border-[#2a2a35]/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="flex-1">{title}</span>
        {badge}
        {count !== undefined && (
          <span className="bg-[#1a1a24] px-1.5 rounded-full text-[9px]">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockAlerts(): Alert[] {
  const now = Date.now();
  return [
    {
      id: 'alert-1',
      severity: 'critical',
      message: 'vllm-mlx RSS below 2GB threshold',
      timestamp: now - 45000,
      dismissed: false,
      source: 'watchdog',
    },
    {
      id: 'alert-2',
      severity: 'warning',
      message: 'session_archive.db 45s behind sync target',
      timestamp: now - 120000,
      dismissed: false,
      source: 'sync',
    },
    {
      id: 'alert-3',
      severity: 'info',
      message: '3 new learnings captured this session',
      timestamp: now - 300000,
      dismissed: false,
      source: 'evidence',
    },
    {
      id: 'alert-4',
      severity: 'info',
      message: 'Hindsight validator found 1 suspect pattern',
      timestamp: now - 600000,
      dismissed: false,
      source: 'hindsight',
    },
  ];
}

function getMockEvents(): SystemEvent[] {
  const now = Date.now();
  return [
    { id: 'ev-1', type: 'injection_fired', message: 'Section 2 WISDOM injected (Qwen3 reasoning)', timestamp: now - 8000 },
    { id: 'ev-2', type: 'learning_captured', message: 'Learning #314: Redis cache fix recorded', timestamp: now - 25000 },
    { id: 'ev-3', type: 'sync_complete', message: 'learnings.db -> PG sync (270 rows)', timestamp: now - 60000 },
    { id: 'ev-4', type: 'agent_spawned', message: 'Agent a-004 spawned: "Build check"', timestamp: now - 90000 },
    { id: 'ev-5', type: 'build_success', message: 'admin.contextdna.io build passed', timestamp: now - 180000 },
    { id: 'ev-6', type: 'watchdog_restart', message: 'vllm-mlx watchdog restart (strike 2/3)', timestamp: now - 240000 },
    { id: 'ev-7', type: 'injection_fired', message: 'Section 8 8TH_INTELLIGENCE injected', timestamp: now - 350000 },
    { id: 'ev-8', type: 'learning_captured', message: 'Learning #313: FD leak fix pattern', timestamp: now - 420000 },
    { id: 'ev-9', type: 'sync_complete', message: 'observability.db -> PG (271 claims)', timestamp: now - 500000 },
    { id: 'ev-10', type: 'build_success', message: 'context-dna Docker stack healthy', timestamp: now - 650000 },
  ];
}

function getMockActionItems(): ActionItem[] {
  const now = Date.now();
  return [
    {
      id: 'act-1',
      kind: 'tool_approval',
      title: 'Agent a-002 requests Write',
      detail: 'panel-factory.tsx — add notifications-panel import',
      timestamp: now - 5000,
    },
    {
      id: 'act-2',
      kind: 'sop_review',
      title: 'SOP candidate: FD exhaustion recovery',
      detail: 'confidence 0.85, 3 occurrences — needs human review',
      timestamp: now - 180000,
    },
    {
      id: 'act-3',
      kind: 'sync_conflict',
      title: 'Merge conflict: lite_scheduler.py',
      detail: 'Local vs PG diverged on job_frequencies table',
      timestamp: now - 360000,
    },
  ];
}

// ---------------------------------------------------------------------------
// ToggleSwitch
// ---------------------------------------------------------------------------
function ToggleSwitch({ enabled, onToggle, label }: {
  enabled: boolean; onToggle: () => void; label: string;
}) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 w-full py-1 px-2 hover:bg-[#1a1a24]/50 rounded">
      <div className={`w-6 h-3.5 rounded-full relative transition-colors ${enabled ? 'bg-[#3b82f6]' : 'bg-[#2a2a35]'}`}>
        <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-[10px] text-[#e5e5e5]">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// NotificationsPanel — main export
// ---------------------------------------------------------------------------
export function NotificationsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>(getMockAlerts);
  const [events, setEvents] = useState<SystemEvent[]>(getMockEvents);
  const [actionItems, setActionItems] = useState<ActionItem[]>(getMockActionItems);
  const [settings, setSettings] = useState<NotificationSettings>({
    alerts: true,
    events: true,
    actions: true,
    sound: true,
  });
  const [loading, setLoading] = useState(false);
  const eventsFeedRef = useRef<HTMLDivElement>(null);

  // Counts
  const activeAlerts = useMemo(() => alerts.filter((a) => !a.dismissed), [alerts]);
  const criticalCount = useMemo(() => activeAlerts.filter((a) => a.severity === 'critical').length, [activeAlerts]);
  const unreadCount = useMemo(() => activeAlerts.length + actionItems.length, [activeAlerts, actionItems]);
  const totalCount = useMemo(() => alerts.length + events.length + actionItems.length, [alerts, events, actionItems]);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(getServiceUrl('helper_agent') + '/api/notifications', {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.alerts) setAlerts(data.alerts);
      if (data.events) setEvents(data.events);
      if (data.actionItems) setActionItems(data.actionItems);
    } catch {
      /* keep mock data */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // WebSocket for live event updates
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const ws = new WebSocket(getServiceWsUrl('events_ws'));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'event' && msg.data) {
            setEvents((prev) => [msg.data, ...prev].slice(0, 20));
          }
          if (msg.type === 'alert' && msg.data) {
            setAlerts((prev) => [msg.data, ...prev]);
          }
          if (msg.type === 'action' && msg.data) {
            setActionItems((prev) => [msg.data, ...prev]);
          }
        } catch { /* ignore parse errors */ }
      };
      ws.onerror = () => ws.close();
      return () => { ws.onclose = null; ws.close(); };
    } catch { /* no WS */ }
  }, []);

  // Auto-scroll event feed
  useEffect(() => {
    if (eventsFeedRef.current) {
      eventsFeedRef.current.scrollTop = 0;
    }
  }, [events]);

  // Dismiss alert
  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
    );
  }, []);

  // Clear all alerts
  const clearAllAlerts = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, dismissed: true })));
  }, []);

  // Mark all read
  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, dismissed: true })));
    setActionItems([]);
  }, []);

  // Action item handlers
  const approveAction = useCallback(async (id: string) => {
    setActionItems((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`${getServiceUrl('helper_agent')}/api/notifications/actions/${id}/approve`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* ignore */ }
  }, []);

  const denyAction = useCallback(async (id: string) => {
    setActionItems((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch(`${getServiceUrl('helper_agent')}/api/notifications/actions/${id}/deny`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* ignore */ }
  }, []);

  const toggleSetting = useCallback((key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Bell className="w-3.5 h-3.5 text-[#3b82f6]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Notifications</span>

        {unreadCount > 0 && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
            criticalCount > 0
              ? 'bg-[#ef4444]/15 text-[#ef4444]'
              : 'bg-[#3b82f6]/15 text-[#3b82f6]'
          }`}>
            {unreadCount}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={fetchNotifications}
          className="p-1 rounded hover:bg-[#1a1a24] text-[#6b6b75] hover:text-[#e5e5e5]"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Active Alerts */}
        <Section
          title="Active Alerts"
          count={activeAlerts.length}
          badge={
            criticalCount > 0 ? (
              <span className="text-[9px] px-1 rounded bg-[#ef4444]/20 text-[#ef4444] mr-1">
                {criticalCount} critical
              </span>
            ) : undefined
          }
        >
          <div className="px-2 py-1 space-y-1">
            {activeAlerts.length === 0 && (
              <div className="text-[10px] text-[#6b6b75] py-2 text-center">
                No active alerts
              </div>
            )}
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-2 py-1.5 px-2 rounded border-l-2 ${severityBorder(alert.severity)} ${severityBg(alert.severity)}`}
              >
                {severityIcon(alert.severity)}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[#e5e5e5] leading-snug">{alert.message}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {alert.source && (
                      <span className="text-[9px] text-[#6b6b75]">{alert.source}</span>
                    )}
                    <span className="text-[9px] text-[#6b6b75]">{timeAgo(alert.timestamp)}</span>
                  </div>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="p-0.5 rounded hover:bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] flex-shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* Event Feed */}
        <Section title="Event Feed" count={events.length}>
          <div ref={eventsFeedRef} className="px-2 py-1 space-y-0.5 max-h-[250px] overflow-y-auto">
            {events.length === 0 && (
              <div className="text-[10px] text-[#6b6b75] py-2 text-center">
                No events yet
              </div>
            )}
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-2 py-1 px-1 rounded hover:bg-[#1a1a24]/50 text-[10px] group"
              >
                {eventTypeIcon(event.type)}
                <span className="text-[#e5e5e5] flex-1 truncate">{event.message}</span>
                <span className="text-[9px] text-[#6b6b75] flex-shrink-0 opacity-60 group-hover:opacity-100">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* Action Items */}
        <Section
          title="Action Items"
          count={actionItems.length}
          defaultOpen={actionItems.length > 0}
        >
          <div className="px-2 py-1 space-y-1">
            {actionItems.length === 0 && (
              <div className="text-[10px] text-[#6b6b75] py-2 text-center">
                No pending actions
              </div>
            )}
            {actionItems.map((item) => (
              <div
                key={item.id}
                className="py-1.5 px-2 rounded bg-[#1a1a24]/50 border border-[#2a2a35]/50"
              >
                <div className="flex items-center gap-2">
                  {actionKindIcon(item.kind)}
                  <span className="text-[10px] text-[#e5e5e5] flex-1 truncate">{item.title}</span>
                  <span className="text-[9px] text-[#6b6b75]">{timeAgo(item.timestamp)}</span>
                </div>
                <div className="text-[9px] text-[#6b6b75] mt-0.5 pl-5 truncate">{item.detail}</div>
                <div className="flex items-center gap-1.5 mt-1.5 pl-5">
                  {item.kind === 'tool_approval' && (
                    <>
                      <button
                        onClick={() => approveAction(item.id)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-[#22c55e]/15 text-[#22c55e] hover:bg-[#22c55e]/25"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => denyAction(item.id)}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25"
                      >
                        Deny
                      </button>
                    </>
                  )}
                  {item.kind === 'sop_review' && (
                    <button
                      onClick={() => approveAction(item.id)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#c678dd]/15 text-[#c678dd] hover:bg-[#c678dd]/25"
                    >
                      Review
                    </button>
                  )}
                  {item.kind === 'sync_conflict' && (
                    <button
                      onClick={() => approveAction(item.id)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#3b82f6]/15 text-[#3b82f6] hover:bg-[#3b82f6]/25"
                    >
                      Resolve
                    </button>
                  )}
                  <button
                    onClick={() => denyAction(item.id)}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Notification Settings */}
        <Section title="Settings" defaultOpen={false}>
          <div className="px-3 py-2 space-y-1.5">
            <ToggleSwitch
              enabled={settings.alerts}
              onToggle={() => toggleSetting('alerts')}
              label="Alert notifications"
            />
            <ToggleSwitch
              enabled={settings.events}
              onToggle={() => toggleSetting('events')}
              label="Event feed updates"
            />
            <ToggleSwitch
              enabled={settings.actions}
              onToggle={() => toggleSetting('actions')}
              label="Action items"
            />
            <div className="border-t border-[#2a2a35]/50 my-1" />
            <ToggleSwitch
              enabled={settings.sound}
              onToggle={() => toggleSetting('sound')}
              label={settings.sound ? 'Sound on' : 'Sound off'}
            />
            <div className="flex items-center gap-1 mt-0.5 text-[9px] text-[#6b6b75] pl-2">
              {settings.sound
                ? <Volume2 className="w-3 h-3 text-[#22c55e]" />
                : <VolumeX className="w-3 h-3 text-[#6b6b75]" />
              }
              <span>{settings.sound ? 'Audio alerts enabled' : 'Audio alerts muted'}</span>
            </div>
            <div className="border-t border-[#2a2a35]/50 my-1" />
            <div className="flex items-center gap-2">
              <button
                onClick={clearAllAlerts}
                className="flex items-center gap-1 px-2 py-1 text-[9px] rounded bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#2a2a35]/80"
              >
                <Trash2 className="w-3 h-3" /> Clear All
              </button>
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 px-2 py-1 text-[9px] rounded bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#2a2a35]/80"
              >
                <CheckCheck className="w-3 h-3" /> Mark All Read
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-[#2a2a35] flex-shrink-0 flex items-center gap-2 text-[9px] text-[#6b6b75]">
        <Bell className="w-3 h-3" />
        <span>{unreadCount} unread &middot; {totalCount} total</span>
        <div className="flex-1" />
        {criticalCount > 0 && (
          <span className="flex items-center gap-1 text-[#ef4444]">
            <Activity className="w-3 h-3" />
            {criticalCount} critical
          </span>
        )}
      </div>
    </div>
  );
}
