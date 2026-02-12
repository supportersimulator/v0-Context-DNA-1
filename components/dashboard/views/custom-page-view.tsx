'use client';

// =============================================================================
// custom-page-view.tsx — Blank Canvas for User-Created Pages
//
// Renders a custom page with a panel grid. Users can add panels from the
// panel-factory registry, resize them, and remove them. The layout is a
// responsive CSS grid that adapts to the number of panels.
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, X, GripVertical, Layout, Maximize2, Minimize2, Cable, Unplug } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomPage, CustomPagePanel, PanelWire } from '@/lib/custom-pages';
import { addPanelToPage, removePanelFromPage, getWiresFromPage, getWiresToPage } from '@/lib/custom-pages';
import { getAllPanelMetadata } from '@/components/ide/panel-factory';

// View imports for rendering panels inline
import { HomeView } from './home-view';
import { ActivityView } from './activity-view';
import { ProfessorView } from './professor-view';
import { SearchView } from './search-view';
import { HealthView } from './health-view';
import { ModelsView } from './models-view';
import { InjectionFocusView } from './injection-focus-view';
import { LearningPanel } from './learning-panel';
import { ArchitecturalAwarenessPanel } from './architectural-awareness';
import { SynapticSplitView } from './synaptic-split-view';
import { NodeRedPanel } from '@/components/ide/panels/node-red-panel';

// ---------------------------------------------------------------------------
// Panel component renderer — maps panelId to inline component
// ---------------------------------------------------------------------------

function renderPanelContent(panelId: string): React.ReactNode {
  switch (panelId) {
    case 'home':
      return <HomeView />;
    case 'activity':
      return <ActivityView />;
    case 'professor':
      return <ProfessorView />;
    case 'search':
      return <SearchView />;
    case 'health':
      return <HealthView />;
    case 'models':
      return <ModelsView />;
    case 'synaptic':
      return <SynapticSplitView />;
    case 'injection':
      return <InjectionFocusView onClose={() => {}} />;
    case 'learnings':
      return <LearningPanel />;
    case 'architecture':
      return <ArchitecturalAwarenessPanel />;
    case 'node-red':
      return <NodeRedPanel />;
    default:
      // For IDE-only panels and others, show a placeholder
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <Layout className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">{panelId}</p>
            <p className="text-xs opacity-60">Panel available in IDE mode</p>
          </div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Panel Picker Dialog
// ---------------------------------------------------------------------------

interface PanelPickerProps {
  onSelect: (panelId: string) => void;
  onClose: () => void;
  existingPanels: string[];
}

function PanelPicker({ onSelect, onClose, existingPanels }: PanelPickerProps) {
  const [search, setSearch] = useState('');
  const allMeta = getAllPanelMetadata();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Filter out dashboard-shell and already-added panels
  const available = Object.entries(allMeta)
    .filter(([id]) => id !== 'dashboard-shell')
    .filter(([, meta]) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        meta.label.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q)
      );
    })
    .sort(([, a], [, b]) => a.label.localeCompare(b.label));

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-2 w-80 max-h-96 overflow-auto bg-popover border border-border rounded-lg shadow-xl"
    >
      <div className="sticky top-0 bg-popover border-b border-border p-3">
        <input
          type="text"
          placeholder="Search panels..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </div>
      <div className="p-2">
        {available.map(([id, meta]) => {
          const isAdded = existingPanels.includes(id);
          return (
            <button
              key={id}
              onClick={() => { if (!isAdded) onSelect(id); }}
              disabled={isAdded}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                isAdded
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-accent cursor-pointer"
              )}
            >
              <div className="font-medium">{meta.label}</div>
              <div className="text-xs text-muted-foreground">{meta.description}</div>
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No matching panels
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Page View
// ---------------------------------------------------------------------------

interface CustomPageViewProps {
  page: CustomPage;
  onUpdate: (updated: CustomPage) => void;
  /** All custom pages (for cross-page wiring target selection) */
  allPages?: CustomPage[];
  /** Current wires */
  wires?: PanelWire[];
  /** Wire CRUD callbacks */
  onAddWire?: (wire: PanelWire) => void;
  onRemoveWire?: (wireId: string) => void;
}

export function CustomPageView({
  page,
  onUpdate,
  allPages = [],
  wires = [],
  onAddWire,
  onRemoveWire,
}: CustomPageViewProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<number | null>(null);
  const [showWiring, setShowWiring] = useState(false);

  const handleAddPanel = useCallback(
    (panelId: string) => {
      onUpdate(addPanelToPage(page, panelId));
      setShowPicker(false);
    },
    [page, onUpdate],
  );

  const handleRemovePanel = useCallback(
    (index: number) => {
      onUpdate(removePanelFromPage(page, index));
      if (expandedPanel === index) setExpandedPanel(null);
    },
    [page, onUpdate, expandedPanel],
  );

  const allMeta = getAllPanelMetadata();

  // Empty state
  if (page.panels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <Layout className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold mb-2">{page.name}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            This page is a blank canvas. Add panels to build your custom workspace.
          </p>
          <div className="relative inline-block">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First Panel
            </button>
            {showPicker && (
              <PanelPicker
                onSelect={handleAddPanel}
                onClose={() => setShowPicker(false)}
                existingPanels={page.panels.map((p) => p.panelId)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Expanded single panel view
  if (expandedPanel !== null && page.panels[expandedPanel]) {
    const panel = page.panels[expandedPanel];
    const meta = allMeta[panel.panelId];
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 bg-secondary border-b border-border flex-shrink-0">
          <span className="text-sm font-medium">{meta?.label ?? panel.panelId}</span>
          <button
            onClick={() => setExpandedPanel(null)}
            className="p-1 rounded hover:bg-accent"
            title="Exit fullscreen"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {renderPanelContent(panel.panelId)}
        </div>
      </div>
    );
  }

  // Grid layout
  const gridCols = page.panels.length === 1 ? 1 : page.panels.length === 2 ? 2 : Math.min(page.panels.length, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-secondary border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{page.name}</span>
          <span className="text-xs text-muted-foreground">
            {page.panels.length} panel{page.panels.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Wiring toggle */}
          {onAddWire && page.panels.length >= 1 && (
            <button
              onClick={() => setShowWiring(!showWiring)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 border rounded-md text-xs font-medium transition-colors",
                showWiring
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-background border-border hover:bg-accent"
              )}
            >
              <Cable className="w-3.5 h-3.5" />
              {showWiring ? 'Hide Wires' : 'Wires'}
              {(getWiresFromPage(wires, page.id).length + getWiresToPage(wires, page.id).length) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary">
                  {getWiresFromPage(wires, page.id).length + getWiresToPage(wires, page.id).length}
                </span>
              )}
            </button>
          )}

          {/* Add panel */}
          <div className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-background border border-border rounded-md text-xs font-medium hover:bg-accent transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Panel
            </button>
            {showPicker && (
              <PanelPicker
                onSelect={handleAddPanel}
                onClose={() => setShowPicker(false)}
                existingPanels={page.panels.map((p) => p.panelId)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Panel Grid */}
      <div
        className="flex-1 overflow-auto p-3 gap-3"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridAutoRows: 'minmax(250px, 1fr)',
          alignContent: 'start',
        }}
      >
        {page.panels.map((panel, index) => {
          const meta = allMeta[panel.panelId];
          const panelWireCount = wires.filter(
            (w) =>
              (w.sourcePageId === page.id && w.sourcePanelId === panel.panelId) ||
              (w.targetPageId === page.id && w.targetPanelId === panel.panelId),
          ).length;

          return (
            <div
              key={`${panel.panelId}-${index}`}
              className="relative group bg-background border border-border rounded-lg overflow-hidden flex flex-col"
              style={{
                gridColumn: `span ${Math.min(panel.colSpan, gridCols)}`,
                gridRow: `span ${panel.rowSpan}`,
              }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/50 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <GripVertical className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-xs font-medium">
                    {meta?.label ?? panel.panelId}
                  </span>
                  {panelWireCount > 0 && (
                    <Cable className="w-3 h-3 text-primary/60" />
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setExpandedPanel(index)}
                    className="p-1 rounded hover:bg-accent"
                    title="Expand"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleRemovePanel(index)}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                    title="Remove panel"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-auto">
                {renderPanelContent(panel.panelId)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Wiring panel */}
      {showWiring && (
        <WiringPanel
          page={page}
          allPages={allPages}
          wires={wires}
          allMeta={allMeta}
          onAddWire={onAddWire}
          onRemoveWire={onRemoveWire}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WiringPanel — shows existing wires and allows creating new ones
// ---------------------------------------------------------------------------

function WiringPanel({
  page,
  allPages,
  wires,
  allMeta,
  onAddWire,
  onRemoveWire,
}: {
  page: CustomPage;
  allPages: CustomPage[];
  wires: PanelWire[];
  allMeta: Record<string, { label: string; description: string }>;
  onAddWire?: (wire: PanelWire) => void;
  onRemoveWire?: (wireId: string) => void;
}) {
  const pageWires = [
    ...getWiresFromPage(wires, page.id),
    ...getWiresToPage(wires, page.id).filter((w) => w.sourcePageId !== page.id),
  ];

  const [newWire, setNewWire] = useState({
    sourcePanelId: page.panels[0]?.panelId ?? '',
    targetPageId: '',
    targetPanelId: '',
    label: '',
  });

  // Available target pages (all pages including this one)
  const targetPages = allPages.length > 0 ? allPages : [page];
  const targetPage = targetPages.find((p) => p.id === newWire.targetPageId);

  return (
    <div className="border-t border-border bg-secondary/30 px-4 py-3 flex-shrink-0">
      <div className="flex items-center gap-2 mb-3">
        <Cable className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Panel Wires</span>
        <span className="text-xs text-muted-foreground">
          Connect panels across pages
        </span>
      </div>

      {/* Existing wires */}
      {pageWires.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {pageWires.map((wire) => {
            const sourcePage = allPages.find((p) => p.id === wire.sourcePageId);
            const targetPage2 = allPages.find((p) => p.id === wire.targetPageId);
            return (
              <div
                key={wire.id}
                className="flex items-center justify-between px-3 py-1.5 bg-background border border-border rounded-md text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {sourcePage?.name ?? '?'}.{allMeta[wire.sourcePanelId]?.label ?? wire.sourcePanelId}
                  </span>
                  <span className="text-primary">→</span>
                  <span className="text-muted-foreground">
                    {targetPage2?.name ?? '?'}.{allMeta[wire.targetPanelId]?.label ?? wire.targetPanelId}
                  </span>
                  {wire.label && (
                    <span className="text-muted-foreground/60 italic">({wire.label})</span>
                  )}
                </div>
                {onRemoveWire && (
                  <button
                    onClick={() => onRemoveWire(wire.id)}
                    className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                  >
                    <Unplug className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New wire form */}
      {onAddWire && page.panels.length >= 1 && (
        <div className="flex items-end gap-2 flex-wrap">
          {/* Source panel */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">From</label>
            <select
              value={newWire.sourcePanelId}
              onChange={(e) => setNewWire((p) => ({ ...p, sourcePanelId: e.target.value }))}
              className="px-2 py-1 text-xs bg-background border border-border rounded-md"
            >
              {page.panels.map((p) => (
                <option key={p.panelId} value={p.panelId}>
                  {allMeta[p.panelId]?.label ?? p.panelId}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-muted-foreground pb-1">→</span>

          {/* Target page */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">To Page</label>
            <select
              value={newWire.targetPageId}
              onChange={(e) => setNewWire((p) => ({ ...p, targetPageId: e.target.value, targetPanelId: '' }))}
              className="px-2 py-1 text-xs bg-background border border-border rounded-md"
            >
              <option value="">Select page...</option>
              {targetPages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.id === page.id ? ' (this page)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Target panel */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">To Panel</label>
            <select
              value={newWire.targetPanelId}
              onChange={(e) => setNewWire((p) => ({ ...p, targetPanelId: e.target.value }))}
              className="px-2 py-1 text-xs bg-background border border-border rounded-md"
              disabled={!targetPage}
            >
              <option value="">Select panel...</option>
              {targetPage?.panels.map((p) => (
                <option key={p.panelId} value={p.panelId}>
                  {allMeta[p.panelId]?.label ?? p.panelId}
                </option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Label</label>
            <input
              type="text"
              value={newWire.label}
              onChange={(e) => setNewWire((p) => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Build → Deploy"
              className="px-2 py-1 text-xs bg-background border border-border rounded-md w-32"
            />
          </div>

          {/* Create button */}
          <button
            onClick={() => {
              if (!newWire.sourcePanelId || !newWire.targetPageId || !newWire.targetPanelId) return;
              const wire: PanelWire = {
                id: `wire_${Date.now().toString(36)}`,
                sourcePageId: page.id,
                sourcePanelId: newWire.sourcePanelId,
                targetPageId: newWire.targetPageId,
                targetPanelId: newWire.targetPanelId,
                triggerEvent: '',
                targetAction: '',
                autoExecute: false,
                label: newWire.label,
              };
              onAddWire(wire);
              setNewWire((p) => ({ ...p, targetPageId: '', targetPanelId: '', label: '' }));
            }}
            disabled={!newWire.sourcePanelId || !newWire.targetPageId || !newWire.targetPanelId}
            className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Wire
          </button>
        </div>
      )}

      {page.panels.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add panels to this page first, then wire them together.
        </p>
      )}
    </div>
  );
}
