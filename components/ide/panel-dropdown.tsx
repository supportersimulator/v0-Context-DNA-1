'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MoreVertical, Check, Square } from 'lucide-react';
import type { DockviewApi } from 'dockview';
import type { PageId } from './dockview-shell';
import { PANEL_METADATA, getPanelsForPage } from './panel-factory';

// ---------------------------------------------------------------------------
// PanelDropdown component
// ---------------------------------------------------------------------------
interface PanelDropdownProps {
  activePage: PageId;
  dockviewApi: DockviewApi | null;
  getActivePanelIds: () => string[];
}

export function PanelDropdown({
  activePage,
  dockviewApi,
  getActivePanelIds,
}: PanelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [activePanels, setActivePanels] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Refresh active panels whenever dropdown opens or layout changes
  const refreshActivePanels = useCallback(() => {
    setActivePanels(getActivePanelIds());
  }, [getActivePanelIds]);

  // Refresh on open
  useEffect(() => {
    if (open) refreshActivePanels();
  }, [open, refreshActivePanels]);

  // Listen for dockview layout changes to keep checkbox state accurate
  useEffect(() => {
    if (!dockviewApi) return;
    const disposable = dockviewApi.onDidLayoutChange(() => {
      refreshActivePanels();
    });
    return () => disposable.dispose();
  }, [dockviewApi, refreshActivePanels]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Toggle a panel
  const togglePanel = useCallback(
    (panelId: string) => {
      if (!dockviewApi) return;

      const isActive = activePanels.includes(panelId);

      if (isActive) {
        // Remove the panel
        const panel = dockviewApi.getPanel(panelId);
        if (panel) {
          dockviewApi.removePanel(panel);
        }
      } else {
        // Add the panel
        dockviewApi.addPanel({
          id: panelId,
          component: panelId,
          title: PANEL_METADATA[panelId].label,
        });
      }

      // Refresh immediately
      setTimeout(() => refreshActivePanels(), 0);
    },
    [dockviewApi, activePanels, refreshActivePanels],
  );

  // Sort: active panels first, filtered by page
  const availablePanels = getPanelsForPage(activePage);
  const sortedPanels = [...availablePanels].sort((a, b) => {
    const aActive = activePanels.includes(a);
    const bActive = activePanels.includes(b);
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center h-8 w-8 rounded-md border border-[#2a2a35] bg-[#111118] text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24] transition-colors"
        title={`Manage panels for ${activePage}`}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[280px] rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-lg">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#2a2a35]/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#e5e5e5]">
                Panels — {activePage}
              </span>
              <span className="text-xs text-[#6b6b75]">
                {activePanels.length} active
              </span>
            </div>
          </div>

          {/* Panel list */}
          <div className="py-1 max-h-[360px] overflow-y-auto">
            {sortedPanels.map((panelId) => {
              const isActive = activePanels.includes(panelId);
              const meta = PANEL_METADATA[panelId];

              return (
                <button
                  key={panelId}
                  onClick={() => togglePanel(panelId)}
                  className="w-full px-3 py-2 text-left hover:bg-[#111118] transition-colors flex items-start gap-2.5 cursor-pointer"
                >
                  {/* Checkbox */}
                  <div className="mt-0.5 flex-shrink-0">
                    {isActive ? (
                      <Check className="w-4 h-4 text-[#22c55e]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#6b6b75]" />
                    )}
                  </div>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[#e5e5e5] block">
                      {meta.label}
                    </span>
                    <span className="text-xs text-[#6b6b75] block mt-0.5">
                      {meta.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
