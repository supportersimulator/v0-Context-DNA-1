'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Puzzle,
  Search,
  Download,
  Check,
  Star,
  Power,
  Trash2,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Package,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ExtensionState = 'installed' | 'available' | 'disabled';

interface Extension {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  state: ExtensionState;
  stars: number;
  downloads: number;
  category: 'ai' | 'language' | 'theme' | 'tool' | 'integration';
}

// ---------------------------------------------------------------------------
// Mock data — Context DNA ecosystem extensions
// ---------------------------------------------------------------------------
function getExtensions(): Extension[] {
  return [
    // Installed
    { id: 'ext-synaptic', name: 'Synaptic Voice', author: 'Context DNA', description: 'Voice chat with 8th Intelligence', version: '1.2.0', state: 'installed', stars: 142, downloads: 1240, category: 'ai' },
    { id: 'ext-evidence', name: 'Evidence Pipeline', author: 'Context DNA', description: 'Claim tracking and outcome grounding', version: '2.0.1', state: 'installed', stars: 89, downloads: 890, category: 'tool' },
    { id: 'ext-harmonizer', name: 'Harmonizer Gate', author: 'Context DNA', description: '7-gate code quality checker', version: '1.1.0', state: 'installed', stars: 76, downloads: 760, category: 'tool' },
    { id: 'ext-swarm', name: 'Swarm Controller', author: 'Context DNA', description: 'Multi-agent orchestration panel', version: '1.0.3', state: 'installed', stars: 134, downloads: 1100, category: 'ai' },
    // Disabled
    { id: 'ext-openhands', name: 'OpenHands Agent', author: 'All Hands AI', description: 'Autonomous coding agent', version: '0.9.0', state: 'disabled', stars: 2100, downloads: 15000, category: 'ai' },
    // Available
    { id: 'ext-py-lint', name: 'Python Linter', author: 'Community', description: 'Real-time Python linting with ruff', version: '3.1.0', state: 'available', stars: 3400, downloads: 45000, category: 'language' },
    { id: 'ext-docker-mgr', name: 'Docker Manager', author: 'Container Tools', description: 'Visual Docker container management', version: '2.3.1', state: 'available', stars: 1800, downloads: 22000, category: 'integration' },
    { id: 'ext-git-lens', name: 'Git Lens', author: 'GitToolkit', description: 'Inline git blame and history', version: '14.0.0', state: 'available', stars: 8900, downloads: 120000, category: 'tool' },
    { id: 'ext-theme-dna', name: 'DNA Dark Pro', author: 'Context DNA', description: 'Official Context DNA dark theme', version: '1.0.0', state: 'available', stars: 45, downloads: 380, category: 'theme' },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function stateBadge(state: ExtensionState) {
  switch (state) {
    case 'installed':
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">Installed</span>;
    case 'disabled':
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#6b6b75]/15 text-[#6b6b75]">Disabled</span>;
    case 'available':
      return null;
  }
}

const CATEGORY_LABELS: Record<Extension['category'], string> = {
  ai: 'AI & Agents',
  language: 'Languages',
  theme: 'Themes',
  tool: 'Tools',
  integration: 'Integrations',
};

// ---------------------------------------------------------------------------
// ExtensionCard
// ---------------------------------------------------------------------------
function ExtensionCard({
  ext,
  onInstall,
  onToggle,
  onRemove,
}: {
  ext: Extension;
  onInstall: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 hover:bg-[#1a1a24]/50 group transition-colors">
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg bg-[#1a1a24] border border-[#2a2a35] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Puzzle className="w-4 h-4 text-[#6b6b75]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#e5e5e5] truncate">{ext.name}</span>
          <span className="text-[9px] text-[#6b6b75]">v{ext.version}</span>
          {stateBadge(ext.state)}
        </div>
        <div className="text-[10px] text-[#6b6b75] truncate">{ext.description}</div>
        <div className="flex items-center gap-3 mt-0.5 text-[9px] text-[#6b6b75]">
          <span>{ext.author}</span>
          <span className="flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5" /> {formatNumber(ext.stars)}
          </span>
          <span className="flex items-center gap-0.5">
            <Download className="w-2.5 h-2.5" /> {formatNumber(ext.downloads)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {ext.state === 'available' && (
          <button onClick={onInstall} className="p-1 rounded hover:bg-[#22c55e]/20 text-[#22c55e]" title="Install">
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        {ext.state === 'installed' && (
          <button onClick={onToggle} className="p-1 rounded hover:bg-[#e5c07b]/20 text-[#e5c07b]" title="Disable">
            <Power className="w-3.5 h-3.5" />
          </button>
        )}
        {ext.state === 'disabled' && (
          <button onClick={onToggle} className="p-1 rounded hover:bg-[#22c55e]/20 text-[#22c55e]" title="Enable">
            <Power className="w-3.5 h-3.5" />
          </button>
        )}
        {ext.state !== 'available' && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-[#ef4444]/20 text-[#ef4444]" title="Uninstall">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExtensionsPanel — main export
// ---------------------------------------------------------------------------
export function ExtensionsPanel() {
  const [extensions, setExtensions] = useState<Extension[]>(getExtensions);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');

  const filtered = useMemo(() => {
    let exts = extensions;
    if (filter === 'installed') exts = exts.filter((e) => e.state === 'installed' || e.state === 'disabled');
    if (filter === 'available') exts = exts.filter((e) => e.state === 'available');
    if (query.trim()) {
      const q = query.toLowerCase();
      exts = exts.filter(
        (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.author.toLowerCase().includes(q),
      );
    }
    return exts;
  }, [extensions, query, filter]);

  // Group by category
  const groups = useMemo(() => {
    const map = new Map<Extension['category'], Extension[]>();
    for (const ext of filtered) {
      const existing = map.get(ext.category) ?? [];
      existing.push(ext);
      map.set(ext.category, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const counts = useMemo(() => ({
    installed: extensions.filter((e) => e.state === 'installed').length,
    disabled: extensions.filter((e) => e.state === 'disabled').length,
    available: extensions.filter((e) => e.state === 'available').length,
  }), [extensions]);

  const handleInstall = useCallback((id: string) => {
    setExtensions((prev) => prev.map((e) => (e.id === id ? { ...e, state: 'installed' as const } : e)));
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExtensions((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        return { ...e, state: e.state === 'installed' ? 'disabled' as const : 'installed' as const };
      }),
    );
  }, []);

  const handleRemove = useCallback((id: string) => {
    setExtensions((prev) => prev.map((e) => (e.id === id ? { ...e, state: 'available' as const } : e)));
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Puzzle className="w-3.5 h-3.5 text-[#c678dd]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Extensions</span>
        <span className="text-[10px] text-[#6b6b75] ml-auto">{counts.installed} active</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-[#2a2a35] flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded">
          <Search className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search extensions..."
            className="flex-1 bg-transparent text-xs text-[#e5e5e5] placeholder-[#6b6b75] outline-none"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-[#2a2a35]/50 flex-shrink-0">
        {(['all', 'installed', 'available'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              filter === f ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'
            }`}
          >
            {f === 'all' ? `All (${extensions.length})` : f === 'installed' ? `Installed (${counts.installed})` : `Available (${counts.available})`}
          </button>
        ))}
      </div>

      {/* Extension list */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
            <Package className="w-8 h-8 opacity-50" />
            <span className="text-sm">No extensions found</span>
          </div>
        )}

        {groups.map(([category, exts]) => (
          <div key={category}>
            <div className="px-3 pt-2 pb-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75]">
                {CATEGORY_LABELS[category]}
              </span>
            </div>
            {exts.map((ext) => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                onInstall={() => handleInstall(ext.id)}
                onToggle={() => handleToggle(ext.id)}
                onRemove={() => handleRemove(ext.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
