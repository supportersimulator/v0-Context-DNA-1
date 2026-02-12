// =============================================================================
// custom-pages.ts — User-Created Custom Parent Pages
//
// Lets users create blank canvas pages that appear alongside the fixed
// Dashboard | Synaptic | Live View navigation. Each custom page can host
// any combination of panels from the panel-factory registry.
//
// Persistence: localStorage (same pattern as dockview layout)
// =============================================================================

const STORAGE_KEY = 'contextdna_custom_pages';
const WIRES_STORAGE_KEY = 'contextdna_panel_wires';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomPagePanel {
  /** Panel component key from panel-factory (e.g. 'editor', 'terminal') */
  panelId: string;
  /** Grid column span (1-4) */
  colSpan: number;
  /** Grid row span (1-3) */
  rowSpan: number;
}

export interface CustomPage {
  id: string;
  name: string;
  panels: CustomPagePanel[];
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Panel Wiring — cross-page event connections
// ---------------------------------------------------------------------------

export interface PanelWire {
  id: string;
  /** Source panel + page */
  sourcePageId: string;
  sourcePanelId: string;
  /** Target panel + page */
  targetPageId: string;
  targetPanelId: string;
  /** CapabilityBus event type that triggers this wire */
  triggerEvent: string;
  /** Action to execute on target */
  targetAction: string;
  /** Whether wire auto-fires or requires confirmation */
  autoExecute: boolean;
  /** User-provided label */
  label: string;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _counter = 0;

export function generatePageId(): string {
  _counter += 1;
  return `page_${Date.now().toString(36)}_${_counter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

export function loadCustomPages(): CustomPage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomPage[];
  } catch {
    return [];
  }
}

export function saveCustomPages(pages: CustomPage[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch {
    // localStorage full or disabled — silent fail
  }
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export function createCustomPage(name: string): CustomPage {
  return {
    id: generatePageId(),
    name: name.trim() || 'Untitled',
    panels: [],
    createdAt: Date.now(),
  };
}

export function addPanelToPage(
  page: CustomPage,
  panelId: string,
  colSpan = 1,
  rowSpan = 1,
): CustomPage {
  return {
    ...page,
    panels: [...page.panels, { panelId, colSpan, rowSpan }],
  };
}

export function removePanelFromPage(
  page: CustomPage,
  index: number,
): CustomPage {
  return {
    ...page,
    panels: page.panels.filter((_, i) => i !== index),
  };
}

export function renamePage(page: CustomPage, newName: string): CustomPage {
  return { ...page, name: newName.trim() || page.name };
}

// ---------------------------------------------------------------------------
// Wire persistence
// ---------------------------------------------------------------------------

export function loadPanelWires(): PanelWire[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WIRES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PanelWire[];
  } catch {
    return [];
  }
}

export function savePanelWires(wires: PanelWire[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WIRES_STORAGE_KEY, JSON.stringify(wires));
  } catch {
    // silent fail
  }
}

// ---------------------------------------------------------------------------
// Wire CRUD
// ---------------------------------------------------------------------------

let _wireCounter = 0;

export function createWire(
  sourcePageId: string,
  sourcePanelId: string,
  targetPageId: string,
  targetPanelId: string,
  triggerEvent: string,
  targetAction: string,
  label: string,
  autoExecute = false,
): PanelWire {
  _wireCounter += 1;
  return {
    id: `wire_${Date.now().toString(36)}_${_wireCounter.toString(36)}`,
    sourcePageId,
    sourcePanelId,
    targetPageId,
    targetPanelId,
    triggerEvent,
    targetAction,
    autoExecute,
    label: label.trim() || `${sourcePanelId} → ${targetPanelId}`,
  };
}

export function addWire(wires: PanelWire[], wire: PanelWire): PanelWire[] {
  return [...wires, wire];
}

export function removeWire(wires: PanelWire[], wireId: string): PanelWire[] {
  return wires.filter((w) => w.id !== wireId);
}

/** Get all wires originating from a page */
export function getWiresFromPage(wires: PanelWire[], pageId: string): PanelWire[] {
  return wires.filter((w) => w.sourcePageId === pageId);
}

/** Get all wires targeting a page */
export function getWiresToPage(wires: PanelWire[], pageId: string): PanelWire[] {
  return wires.filter((w) => w.targetPageId === pageId);
}

/** Remove all wires associated with a page (called on page delete) */
export function removeWiresForPage(wires: PanelWire[], pageId: string): PanelWire[] {
  return wires.filter((w) => w.sourcePageId !== pageId && w.targetPageId !== pageId);
}
