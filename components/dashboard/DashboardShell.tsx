'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { SynapticChatView } from './views/synaptic-chat-view';
import { VoiceChatView } from './views/voice-chat-view';
import { WelcomeModal } from './welcome-modal';
import { VoiceWakeOverlay } from '../auth/voice-wake-overlay';
import { cn } from '@/lib/utils';
import { Syringe, Brain, LayoutDashboard, Mic } from 'lucide-react';
import { getStoredUsername } from '@/lib/auth/session';

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

  // Check voice verification status on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const verified = sessionStorage.getItem(VOICE_VERIFIED_KEY) === 'true';
      setVoiceVerified(verified);
    }
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
      } else if (view === 'voice') {
        setActiveTab('voice');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // Handle tab change - exit focus mode if switching to non-injection tab
  const handleTabChange = useCallback((tabId: string) => {
    // Cast string back to TabId since TabList uses string generically
    const id = tabId as TabId;
    if (activeTab === id) return;

    if (id === 'injection') {
      setPreviousTab(activeTab);
      setFocusMode(true);
      setActiveTab('injection');
    } else {
      setFocusMode(false);
      setActiveTab(id);
    }
  }, [activeTab]);

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
        if (focusMode) setFocusMode(false);
        setActiveTab('synaptic');
        return;
      }

      // ⌘3 = Home Overview dashboard
      if (isMod && e.key === '3') {
        e.preventDefault();
        if (focusMode) setFocusMode(false);
        setActiveTab('home');
        return;
      }

      // ⌘4 = Professor view
      if (isMod && e.key === '4') {
        e.preventDefault();
        if (focusMode) setFocusMode(false);
        setActiveTab('professor');
        return;
      }

      // ⌘5 = Voice Chat
      if (isMod && e.key === '5') {
        e.preventDefault();
        if (focusMode) setFocusMode(false);
        setActiveTab('voice');
        return;
      }

      // ⌘I = Toggle focus mode (legacy shortcut)
      if (isMod && (e.key === 'i' || e.code === 'KeyI')) {
        e.preventDefault();
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
        // Show voice wake overlay if not verified
        return (
          <div className="relative h-full">
            <SynapticChatView />
            {voiceVerified === false && (
              <VoiceWakeOverlay
                onWake={handleVoiceWake}
                userEmail={getStoredUsername() || 'user@contextdna.io'}
              />
            )}
          </div>
        );
      case 'voice':
        return <VoiceChatView />;
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
                if (focusMode) setFocusMode(false);
                setActiveTab('home');
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                !focusMode && activeTab === 'home'
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
                if (focusMode) setFocusMode(false);
                setActiveTab('synaptic');
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                !focusMode && activeTab === 'synaptic'
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title="Synaptic Chat (⌘2)"
            >
              <Brain className="w-3.5 h-3.5" />
              <span>Synaptic</span>
            </button>

            {/* Voice Chat Button - Mobile-friendly voice interaction */}
            <button
              onClick={() => {
                if (focusMode) setFocusMode(false);
                setActiveTab('voice');
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                !focusMode && activeTab === 'voice'
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title="Voice Chat (⌘5)"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>

            {/* Live View Button */}
            <button
              onClick={() => {
                if (!focusMode) {
                  setPreviousTab(activeTab === 'injection' ? 'synaptic' : activeTab);
                  setActiveTab('injection');
                  setFocusMode(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                focusMode
                  ? "bg-primary text-primary-foreground shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
              title="Live View (⌘1)"
            >
              <Syringe className="w-3.5 h-3.5" />
              <span>Live View</span>
            </button>
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
      </div>

      {/* Main content */}
      <main className={cn(
        "flex-1 overflow-auto transition-all duration-300",
        focusMode && "bg-background/95"
      )}>
        {focusMode ? (
          // Focus mode: full-screen injection view
          <div className="h-full">
            <InjectionFocusView onClose={exitFocusMode} />
          </div>
        ) : (
          // Normal mode: standard view container
          <div className="max-w-[1400px] mx-auto p-6">
            {renderView()}
          </div>
        )}
      </main>
    </div>
  );
}
