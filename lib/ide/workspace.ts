'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { getEventBus } from './event-bus';

// =============================================================================
// Types
// =============================================================================

export interface WorkspaceState {
  /** Workspace slot number (1-9) */
  slot: number;
  /** Display name */
  name: string;
  /** Root path of the project */
  rootPath: string;
  /** Paths of currently open editor files */
  openFiles: string[];
  /** Active file path */
  activeFile: string | null;
  /** Last opened timestamp */
  lastOpened: number;
}

// =============================================================================
// Storage keys
// =============================================================================

const CURRENT_KEY = 'contextdna_workspace_current';
const SLOTS_KEY = 'contextdna_workspace_slots';

// =============================================================================
// WorkspaceManager — singleton
// =============================================================================

type Subscriber = () => void;

class WorkspaceManager {
  private currentSlot = 1;
  private slots: Map<number, WorkspaceState> = new Map();
  private subscribers = new Set<Subscriber>();
  private version = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromStorage();
  }

  // -------------------------------------------------------------------------
  // Slot switching
  // -------------------------------------------------------------------------

  switchTo(slot: number): void {
    if (slot < 1 || slot > 9) return;
    if (slot === this.currentSlot) return;

    // Save current state before switching
    this.captureCurrentState();

    const previous = this.currentSlot;
    this.currentSlot = slot;

    // Ensure slot exists
    if (!this.slots.has(slot)) {
      this.slots.set(slot, {
        slot,
        name: `Workspace ${slot}`,
        rootPath: '',
        openFiles: [],
        activeFile: null,
        lastOpened: Date.now(),
      });
    }

    const ws = this.slots.get(slot)!;
    ws.lastOpened = Date.now();

    this.persistToStorage();
    this.bump();

    // Emit workspace changed events
    try {
      const bus = getEventBus();
      (bus as any).emit('workspace:switched', { slot, previous, name: ws.name });
    } catch {
      // EventBus not available
    }
  }

  getCurrentSlot(): number {
    return this.currentSlot;
  }

  getCurrentWorkspace(): WorkspaceState {
    const ws = this.slots.get(this.currentSlot);
    if (ws) return ws;

    // Create default
    const defaultWs: WorkspaceState = {
      slot: this.currentSlot,
      name: `Workspace ${this.currentSlot}`,
      rootPath: '',
      openFiles: [],
      activeFile: null,
      lastOpened: Date.now(),
    };
    this.slots.set(this.currentSlot, defaultWs);
    return defaultWs;
  }

  getAllSlots(): WorkspaceState[] {
    return Array.from(this.slots.values()).sort((a, b) => a.slot - b.slot);
  }

  getUsedSlots(): number[] {
    return Array.from(this.slots.keys()).sort((a, b) => a - b);
  }

  // -------------------------------------------------------------------------
  // State capture — called by DashboardShell on editor events
  // -------------------------------------------------------------------------

  captureCurrentState(): void {
    try {
      // Import dynamically to avoid circular deps
      const { getEditorStore } = require('./editor-store');
      const store = getEditorStore();
      const ws = this.getCurrentWorkspace();
      ws.openFiles = store.getOpenFiles().map((f: any) => f.path);
      ws.activeFile = store.getActiveFilePath();
      ws.lastOpened = Date.now();
    } catch {
      // EditorStore not available
    }
  }

  /** Debounced save — call on every editor event */
  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.captureCurrentState();
      this.persistToStorage();
    }, 1000);
  }

  // -------------------------------------------------------------------------
  // Rename
  // -------------------------------------------------------------------------

  rename(slot: number, name: string): void {
    const ws = this.slots.get(slot);
    if (!ws) return;
    ws.name = name.trim() || `Workspace ${slot}`;
    this.persistToStorage();
    this.bump();
  }

  // -------------------------------------------------------------------------
  // Subscription (useSyncExternalStore)
  // -------------------------------------------------------------------------

  subscribe(handler: Subscriber): () => void {
    this.subscribers.add(handler);
    return () => { this.subscribers.delete(handler); };
  }

  getVersion(): number {
    return this.version;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private bump(): void {
    this.version++;
    for (const handler of this.subscribers) {
      try { handler(); } catch { /* silent */ }
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const currentRaw = localStorage.getItem(CURRENT_KEY);
      if (currentRaw) this.currentSlot = parseInt(currentRaw, 10) || 1;

      const slotsRaw = localStorage.getItem(SLOTS_KEY);
      if (slotsRaw) {
        const parsed = JSON.parse(slotsRaw) as WorkspaceState[];
        if (Array.isArray(parsed)) {
          for (const ws of parsed) {
            if (ws.slot >= 1 && ws.slot <= 9) {
              this.slots.set(ws.slot, ws);
            }
          }
        }
      }
    } catch {
      // Corrupted storage — start fresh
    }

    // Ensure current slot exists
    if (!this.slots.has(this.currentSlot)) {
      this.slots.set(this.currentSlot, {
        slot: this.currentSlot,
        name: `Workspace ${this.currentSlot}`,
        rootPath: '',
        openFiles: [],
        activeFile: null,
        lastOpened: Date.now(),
      });
    }
  }

  private persistToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CURRENT_KEY, String(this.currentSlot));
      localStorage.setItem(SLOTS_KEY, JSON.stringify(Array.from(this.slots.values())));
    } catch {
      // Storage full — silent
    }
  }
}

// =============================================================================
// Singleton
// =============================================================================

let _manager: WorkspaceManager | null = null;

export function getWorkspaceManager(): WorkspaceManager {
  if (!_manager) {
    _manager = new WorkspaceManager();
  }
  return _manager;
}

// =============================================================================
// React Hooks
// =============================================================================

/** Returns the current workspace slot number (reactive). */
export function useWorkspaceSlot(): number {
  const mgr = getWorkspaceManager();
  return useSyncExternalStore(
    useCallback((cb: () => void) => mgr.subscribe(cb), [mgr]),
    () => mgr.getCurrentSlot(),
    () => 1,
  );
}

/** Returns the current workspace state (reactive). */
export function useWorkspace(): WorkspaceState {
  const mgr = getWorkspaceManager();
  return useSyncExternalStore(
    useCallback((cb: () => void) => mgr.subscribe(cb), [mgr]),
    () => mgr.getCurrentWorkspace(),
    () => ({ slot: 1, name: 'Workspace 1', rootPath: '', openFiles: [], activeFile: null, lastOpened: 0 }),
  );
}
