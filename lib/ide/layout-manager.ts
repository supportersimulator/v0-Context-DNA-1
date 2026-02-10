'use client';

import type { DockviewApi } from 'dockview-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParentPage = 'dashboard' | 'synaptic' | 'live';

export interface PageLayoutState {
  /** Panel IDs currently active in the dockview */
  activePanels: string[];
  /** Full serialized dockview state (from DockviewApi.toJSON()) */
  dockviewLayout: object | null;
}

// ---------------------------------------------------------------------------
// Storage key helper
// ---------------------------------------------------------------------------

function storageKey(page: ParentPage): string {
  return `contextdna_layout_${page}`;
}

// ---------------------------------------------------------------------------
// Save page layout
// Serializes the current dockview state and active panel list to localStorage.
// ---------------------------------------------------------------------------

export function savePageLayout(
  page: ParentPage,
  activePanels: string[],
  dockviewApi: DockviewApi | null
): void {
  try {
    const state: PageLayoutState = {
      activePanels,
      dockviewLayout: dockviewApi ? dockviewApi.toJSON() : null,
    };
    localStorage.setItem(storageKey(page), JSON.stringify(state));
  } catch (err) {
    console.warn('[layout-manager] Failed to save layout:', err);
  }
}

// ---------------------------------------------------------------------------
// Load page layout
// Returns null if no saved layout exists or if parsing fails.
// ---------------------------------------------------------------------------

export function loadPageLayout(page: ParentPage): PageLayoutState | null {
  try {
    const raw = localStorage.getItem(storageKey(page));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PageLayoutState;

    // Basic validation
    if (
      !parsed ||
      !Array.isArray(parsed.activePanels) ||
      parsed.activePanels.length === 0
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Clear page layout
// ---------------------------------------------------------------------------

export function clearPageLayout(page: ParentPage): void {
  try {
    localStorage.removeItem(storageKey(page));
  } catch {
    // silently ignore
  }
}

// ---------------------------------------------------------------------------
// Get just the active panel IDs for a page
// ---------------------------------------------------------------------------

export function getActivePanels(page: ParentPage): string[] | null {
  const state = loadPageLayout(page);
  return state?.activePanels ?? null;
}

// ---------------------------------------------------------------------------
// Set just the active panel IDs for a page (preserves dockviewLayout)
// ---------------------------------------------------------------------------

export function setActivePanels(page: ParentPage, panels: string[]): void {
  try {
    const existing = loadPageLayout(page);
    const state: PageLayoutState = {
      activePanels: panels,
      dockviewLayout: existing?.dockviewLayout ?? null,
    };
    localStorage.setItem(storageKey(page), JSON.stringify(state));
  } catch (err) {
    console.warn('[layout-manager] Failed to set active panels:', err);
  }
}
