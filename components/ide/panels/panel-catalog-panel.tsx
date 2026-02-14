'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Puzzle,
  Search,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
  WifiOff,
  Tag,
  Shield,
  Globe,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getPanelRegistry,
  type PanelConnection,
  type PanelConnectionStatus,
} from '@/lib/panels';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<PanelConnectionStatus, { icon: typeof Circle; color: string; label: string }> = {
  connected: { icon: CheckCircle2, color: 'text-green-400', label: 'Connected' },
  connecting: { icon: Loader2, color: 'text-yellow-400 animate-spin', label: 'Connecting' },
  disconnected: { icon: WifiOff, color: 'text-[#6b6b75]', label: 'Disconnected' },
  error: { icon: XCircle, color: 'text-red-500', label: 'Error' },
};

const PERMISSION_ICONS: Record<string, typeof Circle> = {
  none: Lock,
  'local-only': Shield,
  internet: Globe,
};

// ---------------------------------------------------------------------------
// Panel card
// ---------------------------------------------------------------------------

function PanelCard({ connection }: { connection: PanelConnection }) {
  const { manifest, status, lastActivity, error } = connection;
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;
  const NetworkIcon = PERMISSION_ICONS[manifest.permissions.network] ?? Shield;

  const timeAgo = useMemo(() => {
    const diff = Date.now() - lastActivity;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }, [lastActivity]);

  return (
    <div className="flex gap-3 px-3 py-2.5 border-b border-[#1a1a24] hover:bg-[#12121a] transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#1a1a24] flex items-center justify-center">
        <Puzzle className="w-4.5 h-4.5 text-[#6b6b75]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#e5e5e5] truncate">{manifest.name}</span>
          <span className="text-[10px] text-[#4a4a55] font-mono">v{manifest.version}</span>
          <StatusIcon className={cn('w-3.5 h-3.5 flex-shrink-0', statusConfig.color)} />
        </div>
        <p className="text-xs text-[#6b6b75] truncate mt-0.5">{manifest.description}</p>
        <div className="flex items-center gap-3 mt-1">
          {/* Tags */}
          <div className="flex items-center gap-1">
            {manifest.ui.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="flex items-center gap-0.5 text-[10px] text-[#4a4a55] bg-[#1a1a24] px-1.5 py-0.5 rounded">
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
          {/* Transport */}
          <span className="text-[10px] text-[#3a3a45]">{manifest.entry.transport}</span>
          {/* Network permission */}
          <NetworkIcon className="w-3 h-3 text-[#3a3a45]" />
          {/* Last activity */}
          <span className="text-[10px] text-[#3a3a45] ml-auto">{timeAgo}</span>
        </div>
        {error && (
          <p className="text-xs text-red-400 mt-1 truncate">{error}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelCatalogPanel — main export
// ---------------------------------------------------------------------------

export function PanelCatalogPanel() {
  const [panels, setPanels] = useState<PanelConnection[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const registry = getPanelRegistry();
    const update = (all: ReadonlyMap<string, PanelConnection>) => {
      setPanels([...all.values()]);
    };
    update(registry.getAll());
    return registry.subscribe(update);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return panels;
    const q = search.toLowerCase();
    return panels.filter(
      (p) =>
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.description.toLowerCase().includes(q) ||
        p.manifest.ui.tags.some((t) => t.includes(q)),
    );
  }, [panels, search]);

  const connected = panels.filter((p) => p.status === 'connected').length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2a2a35]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-[#f59e0b]" />
            <span className="text-xs font-medium text-[#e5e5e5]">Panel Catalog</span>
          </div>
          <span className="text-xs text-[#4a4a55]">
            {connected}/{panels.length} connected
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a4a55]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search panels..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-[#12121a] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#4a4a55] outline-none focus:border-[#3a3a45]"
          />
        </div>
      </div>

      {/* Panel list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#4a4a55] gap-2">
            <Puzzle className="w-8 h-8" />
            <span className="text-xs">
              {panels.length === 0 ? 'No panels registered' : 'No matching panels'}
            </span>
            {panels.length === 0 && (
              <span className="text-[10px] text-[#3a3a45] max-w-48 text-center">
                Register panels via Panel Protocol v1 to see them here
              </span>
            )}
          </div>
        ) : (
          filtered.map((p) => <PanelCard key={p.manifest.id} connection={p} />)
        )}
      </div>
    </div>
  );
}
