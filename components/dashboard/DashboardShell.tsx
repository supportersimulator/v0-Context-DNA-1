'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TabId, Tab } from '@/lib/types';
import { DEFAULT_TABS } from '@/lib/types';
import { TabList } from './TabList';
import { HomeView } from './views/home-view';
import { ActivityView } from './views/activity-view';
import { ProfessorView } from './views/professor-view';
import { SearchView } from './views/search-view';
import { HealthView } from './views/health-view';
import { ModelsView } from './views/models-view';
import { InjectionFocusView } from './views/injection-focus-view';
import { InstallWizardView } from './views/install-wizard-view';
import { SynapticSplitView } from './views/synaptic-split-view';
import { CustomPageView } from './views/custom-page-view';
// Voice is now integrated into SynapticChatView - no separate view needed
import { WelcomeModal } from './welcome-modal';
import { VoiceWakeOverlay } from '../auth/voice-wake-overlay';
import { cn } from '@/lib/utils';
import { Syringe, Brain, LayoutDashboard, Plus, X, Layers } from 'lucide-react';
import { getWorkspaceManager, useWorkspaceSlot } from '@/lib/ide/workspace';
import { getEventBus } from '@/lib/ide/event-bus';
import { getStoredUsername } from '@/lib/auth/session';
import type { CustomPage, PanelWire } from '@/lib/custom-pages';
import {
  loadCustomPages,
  saveCustomPages,
  createCustomPage,
  loadPanelWires,
  savePanelWires,
  addWire,
  removeWire,
  removeWiresForPage,
} from '@/lib/custom-pages';

const FIRST_TIME_KEY = 'contextdna_first_visit_completed';
const VOICE_VERIFIED_KEY = 'synaptic_voice_verified';

export default function DashboardShell() {
  // Default to Synaptic view on login (middle button)
  const [activeTab, setActiveTab] = useState<TabId>('synaptic');
  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [focusMode, setFocusMode] = useState(false);
  const [previousTab, setPreviousTab] = useState<TabId>('synaptic');
  const [showWelcome, setShowWelcome] = useState(false);
  const [voiceVerified, setVoiceVerified] = useState<boolean | null>(null);

  // ── Custom Pages ──
  const [customPages, setCustomPages] = useState<CustomPage[]>([]);
  const [activeCustomPageId, setActiveCustomPageId] = useState<string | null>(null);
  const [showNewPageDialog, setShowNewPageDialog] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [contextMenuPageId, setContextMenuPageId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const newPageInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ── Panel Wires (cross-page connections) ──
  const [panelWires, setPanelWires] = useState<PanelWire[]>([]);

  // ── Workspace Manager ──
  const workspaceSlot = useWorkspaceSlot();

  // Load custom pages + wires from localStorage on mount
  useEffect(() => {
    setCustomPages(loadCustomPages());
    setPanelWires(loadPanelWires());
  }, []);

  // Wire workspace auto-save to editor events
  useEffect(() => {
    const bus = getEventBus();
    const mgr = getWorkspaceManager();
    const handler = () => mgr.scheduleSave();
    const subs = [
      (bus as any).on('editor:file-opened', handler),
      (bus as any).on('editor:file-closed', handler),
      (bus as any).on('editor:active-changed', handler),
    ];
    return () => { subs.forEach((s: any) => s?.dispose?.()); };
  }, []);

  // Persist custom pages on change
  useEffect(() => {
    if (customPages.length > 0 || loadCustomPages().length > 0) {
      saveCustomPages(customPages);
    }
  }, [customPages]);

  // Persist wires on change
  useEffect(() => {
    if (panelWires.length > 0 || loadPanelWires().length > 0) {
      savePanelWires(panelWires);
    }
  }, [panelWires]);

  // Focus input when dialog opens
  useEffect(() => {
    if (showNewPageDialog) {
      setTimeout(() => newPageInputRef.current?.focus(), 50);
    }
  }, [showNewPageDialog]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuPageId) return;
    const handle = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuPageId(null);
        setContextMenuPos(null);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [contextMenuPageId]);

  // Create new custom page
  const handleCreatePage = useCallback(() => {
    if (!newPageName.trim()) return;
    const page = createCustomPage(newPageName);
    setCustomPages((prev) => [...prev, page]);
    setActiveCustomPageId(page.id);
    setFocusMode(false);
    setNewPageName('');
    setShowNewPageDialog(false);
  }, [newPageName]);

  // Delete custom page
  const handleDeletePage = useCallback((pageId: string) => {
    setCustomPages((prev) => prev.filter((p) => p.id !== pageId));
    // Clean up any wires associated with this page
    setPanelWires((prev) => removeWiresForPage(prev, pageId));
    if (activeCustomPageId === pageId) {
      setActiveCustomPageId(null);
      setActiveTab('injection');
      setFocusMode(true);
    }
    setContextMenuPageId(null);
    setContextMenuPos(null);
  }, [activeCustomPageId]);

  // Update custom page (panel add/remove)
  const handleUpdatePage = useCallback((updated: CustomPage) => {
    setCustomPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  // Wire management
  const handleAddWire = useCallback((wire: PanelWire) => {
    setPanelWires((prev) => addWire(prev, wire));
  }, []);

  const handleRemoveWire = useCallback((wireId: string) => {
    setPanelWires((prev) => removeWire(prev, wireId));
  }, []);

  // Check voice verification status on mount
  // Web (production): Always require voice verification when server is reachable
  // Local dev: Auto-bypass if voice server is unreachable (prevents blocking UI)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const verified = sessionStorage.getItem(VOICE_VERIFIED_KEY) === 'true';
    if (verified) {
      setVoiceVerified(true);
      return;
    }
    // Use same base URL logic as VoiceWakeOverlay
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const baseUrl = isLocal
      ? 'http://localhost:8000/api/contextdna'
      : '/api';
    // Probe voice server — production always shows overlay, local dev bypasses if down
    const controller = new AbortController();
    fetch(`${baseUrl}/voice/enrollment-status`, {
      signal: controller.signal,
      method: 'GET',
    })
      .then(() => setVoiceVerified(false)) // server reachable → require verification
      .catch(() => {
        // Production: still show overlay (server may be temporarily slow)
        // Local dev: bypass so app is usable without voice server running
        setVoiceVerified(isLocal ? true : false);
      });
    return () => controller.abort();
  }, []);

  // Handle voice wake completion
  const handleVoiceWake = useCallback(() => {
    setVoiceVerified(true);
  }, []);

  // Handle URL parameters for deep linking (e.g., ?view=injection from Synaptic 8888)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      if (view === 'injection') {
        // Auto-enter focus mode / Live View
        setPreviousTab('synaptic');
        setActiveTab('injection');
        setFocusMode(true);
        // Clean up URL without reload
        window.history.replaceState({}, '', window.location.pathname);
      } else if (view === 'synaptic') {
        setActiveTab('synaptic');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (view === 'home') {
        setActiveTab('home');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // Handle tab change - exit focus mode if switching to non-injection tab
  const handleTabChange = useCallback((tabId: string) => {
    // Cast string back to TabId since TabList uses string generically
    const id = tabId as TabId;
    if (activeTab === id && !activeCustomPageId) return;

    setActiveCustomPageId(null);
    if (id === 'injection') {
      setPreviousTab(activeTab);
      setFocusMode(true);
      setActiveTab('injection');
    } else {
      setFocusMode(false);
      setActiveTab(id);
    }
  }, [activeTab, activeCustomPageId]);

  const handleTabsReorder = (newTabs: Tab[]) => {
    setTabs(newTabs);
  };

  const handleTabClose = (id: string) => {
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    // If we closed the active tab, switch to the first available one
    if (activeTab === id && newTabs.length > 0) {
      handleTabChange(newTabs[0].id);
    }
  };

  const handleTabAdd = () => {
    // Logic to add a new tab (e.g., from hidden tabs or a default 'search')
    const visibleIds = new Set(tabs.map((t) => t.id));
    const hiddenTabs = DEFAULT_TABS.filter((t) => !visibleIds.has(t.id));

    if (hiddenTabs.length > 0) {
      setTabs([...tabs, hiddenTabs[0]]);
    }
  };

  // Exit focus mode
  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    setActiveTab(previousTab);
  }, [previousTab]);

  // First-time user detection
  useEffect(() => {
    // Check if this is the user's first visit
    const hasVisitedBefore = localStorage.getItem(FIRST_TIME_KEY);
    if (!hasVisitedBefore) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setShowWelcome(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Handle welcome modal close
  const handleWelcomeClose = useCallback(() => {
    setShowWelcome(false);
    // Mark as visited so we don't show again
    localStorage.setItem(FIRST_TIME_KEY, 'true');
  }, []);

  // Handle start setup from welcome modal
  const handleStartSetup = useCallback(() => {
    setShowWelcome(false);
    localStorage.setItem(FIRST_TIME_KEY, 'true');
    // Navigate to install wizard
    handleTabChange('install');
  }, [handleTabChange]);

  // Keyboard shortcuts for instant view switching
  // ⌘1 = Live Dashboard (3-panel injection view)
  // ⌘2 = Synaptic Cowork Chat
  // ⌘3 = Home Overview
  // ⌘4 = Professor
  // ⌘I = Toggle focus mode (legacy)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to exit focus mode
      if (e.key === 'Escape' && focusMode) {
        exitFocusMode();
        return;
      }

      // Don't handle shortcuts when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // ⌘1 = Live Dashboard (3-panel injection focus mode)
      if (isMod && e.key === '1') {
        e.preventDefault();
        setActiveCustomPageId(null);
        if (!focusMode) {
          const current = activeTab;
          setPreviousTab(current === 'injection' ? 'synaptic' : current);
          setActiveTab('injection');
          setFocusMode(true);
        }
        return;
      }

      // ⌘2 = Synaptic Cowork Chat
      if (isMod && e.key === '2') {
        e.preventDefault();
        setActiveCustomPageId(null);
        if (focusMode) setFocusMode(false);
        setActiveTab('synaptic');
        return;
      }

      // ⌘3 = Home Overview dashboard
      if (isMod && e.key === '3') {
        e.preventDefault();
        setActiveCustomPageId(null);
        if (focusMode) setFocusMode(false);
        setActiveTab('home');
        return;
      }

      // ⌘4 = Professor view
      if (isMod && e.key === '4') {
        e.preventDefault();
        setActiveCustomPageId(null);
        if (focusMode) setFocusMode(false);
        setActiveTab('professor');
        return;
      }

      // ⌘I = Toggle focus mode (legacy shortcut)
      if (isMod && (e.key === 'i' || e.code === 'KeyI')) {
        e.preventDefault();
        setActiveCustomPageId(null);
        if (focusMode) {
          exitFocusMode();
        } else {
          const current = activeTab;
          setPreviousTab(current === 'injection' ? 'synaptic' : current);
          setActiveTab('injection');
          setFocusMode(true);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, activeTab, exitFocusMode]);

  const renderView = () => {
    // Custom page takes priority when active
    if (activeCustomPageId) {
      const page = customPages.find((p) => p.id === activeCustomPageId);
      if (page) {
        return (
          <CustomPageView
            page={page}
            onUpdate={handleUpdatePage}
            allPages={customPages}
            wires={panelWires}
            onAddWire={handleAddWire}
            onRemoveWire={handleRemoveWire}
          />
        );
      }
    }

    switch (activeTab) {
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
      case 'install':
        return <InstallWizardView />;
      case 'synaptic':
        return (
          <div className="relative h-full">
            <SynapticSplitView />
            {voiceVerified === false && (
              <VoiceWakeOverlay
                onWake={handleVoiceWake}
                userEmail={getStoredUsername() || 'user@contextdna.io'}
              />
            )}
          </div>
        );
      case 'injection':
        return <InjectionFocusView onClose={exitFocusMode} />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Welcome Modal for first-time users */}
      {showWelcome && (
        <WelcomeModal
          onClose={handleWelcomeClose}
          onStartSetup={handleStartSetup}
        />
      )}

      {/* Tab bar */}
      {/* Top Header / Tab Bar Area */}
      <div className="flex items-center gap-1 px-4 py-2 bg-secondary border-b border-border w-full flex-shrink-0">

        {/* 1. Context DNA Logo (Fixed) */}
        <div className="flex items-center gap-1 mr-4 flex-shrink-0 select-none">
          <span className="text-xl">🧬</span>
          <span className="text-sm font-semibold text-foreground">Context DNA</span>
        </div>

        {/* 2. Quick Navigation: Dashboard | Synaptic | Live View */}
        <div className="flex items-center mr-4 flex-shrink-0 border-r border-border pr-4">
          <div className="flex bg-background/30 rounded-lg p-0.5 gap-0.5">
            {/* Dashboard Button */}
            <button
              onClick={() => {
                setActiveCustomPageId(null);
                if (focusMode) setFocusMode(false);
                setActiveTab('home');
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                !focusMode && !activeCustomPageId && activeTab === 'home'
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title="Dashboard (⌘3)"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            {/* Synaptic Button - Main View (default after login) */}
            <button
              onClick={() => {
                setActiveCustomPageId(null);
                if (focusMode) setFocusMode(false);
                setActiveTab('synaptic');
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                !focusMode && !activeCustomPageId && activeTab === 'synaptic'
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title="Synaptic Chat (⌘2)"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Synaptic</span>
            </button>

            {/* Live View Button */}
            <button
              onClick={() => {
                setActiveCustomPageId(null);
                if (!focusMode) {
                  setPreviousTab(activeTab === 'injection' ? 'synaptic' : activeTab);
                  setActiveTab('injection');
                  setFocusMode(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                focusMode && !activeCustomPageId
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title="Live View (⌘1)"
            >
              <Syringe className="w-3.5 h-3.5" />
              <span>Live View</span>
            </button>
          </div>

          {/* ── Custom Page Buttons + [+] Add Button ── */}
          <div className="flex items-center gap-0.5 ml-1">
            {/* Custom page buttons */}
            {customPages.map((page) => (
              <button
                key={page.id}
                onClick={() => {
                  setActiveCustomPageId(page.id);
                  setFocusMode(false);
                  setActiveTab('injection'); // keep injection as base
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenuPageId(page.id);
                  setContextMenuPos({ x: e.clientX, y: e.clientY });
                }}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all max-w-[120px]",
                  activeCustomPageId === page.id
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
                title={`${page.name} (right-click to delete)`}
              >
                <span className="truncate">{page.name}</span>
              </button>
            ))}

            {/* [+] Add new page button (up to 30) */}
            {customPages.length < 30 && (
              <div className="relative">
                <button
                  onClick={() => setShowNewPageDialog(!showNewPageDialog)}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                    "text-muted-foreground hover:text-foreground hover:bg-background/50",
                    showNewPageDialog && "bg-background/50 text-foreground"
                  )}
                  title="Add custom page"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>

                {/* New page naming dialog */}
                {showNewPageDialog && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-xl p-3">
                    <p className="text-xs text-muted-foreground mb-2">Name your new page</p>
                    <input
                      ref={newPageInputRef}
                      type="text"
                      value={newPageName}
                      onChange={(e) => setNewPageName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreatePage();
                        if (e.key === 'Escape') {
                          setShowNewPageDialog(false);
                          setNewPageName('');
                        }
                      }}
                      placeholder="e.g. App Dev, Robotics..."
                      maxLength={24}
                      className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary mb-2"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setShowNewPageDialog(false);
                          setNewPageName('');
                        }}
                        className="px-2.5 py-1 text-xs rounded-md hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreatePage}
                        disabled={!newPageName.trim()}
                        className="px-2.5 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Draggable Tabs (Flexible) */}
        <div className={cn(
          "flex-1 min-w-0 overflow-hidden transition-all duration-500",
          focusMode && "opacity-20 pointer-events-none blur-[1px]"
        )}>
          <TabList
            tabs={tabs}
            activeTabId={activeTab}
            onTabChange={handleTabChange}
            onTabsReorder={handleTabsReorder}
            onTabClose={handleTabClose}
            onTabAdd={handleTabAdd}
          />
        </div>

        {/* 4. Workspace Indicator (Far Right — title bar level) */}
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {[1, 2, 3].map((slot) => (
            <button
              key={slot}
              onClick={() => getWorkspaceManager().switchTo(slot)}
              className={cn(
                "w-6 h-6 rounded text-[11px] font-mono font-bold transition-all",
                workspaceSlot === slot
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50 border border-transparent"
              )}
              title={`Workspace ${slot}`}
            >
              {slot}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className={cn(
        "flex-1 overflow-auto transition-all duration-300",
        focusMode && !activeCustomPageId && "bg-background/95"
      )}>
        {activeCustomPageId ? (
          // Custom page: full-height canvas
          <div className="h-full">
            {renderView()}
          </div>
        ) : focusMode ? (
          // Focus mode: full-screen injection view
          <div className="h-full">
            <InjectionFocusView onClose={exitFocusMode} />
          </div>
        ) : (
          // Normal mode: standard view container
          <div className={cn(
            activeTab === 'synaptic' || activeTab === 'injection'
              ? "h-full"
              : "max-w-[1400px] mx-auto p-6"
          )}>
            {renderView()}
          </div>
        )}
      </main>

      {/* Right-click context menu for custom pages */}
      {contextMenuPageId && contextMenuPos && (
        <div
          ref={contextMenuRef}
          className="fixed z-[999] bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
        >
          <button
            onClick={() => handleDeletePage(contextMenuPageId)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Delete Page
          </button>
        </div>
      )}
    </div>
  );
}
