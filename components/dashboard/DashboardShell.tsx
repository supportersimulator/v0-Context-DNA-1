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
import { WelcomeModal } from './welcome-modal';
import { cn } from '@/lib/utils';
import { Syringe } from 'lucide-react';

const FIRST_TIME_KEY = 'contextdna_first_visit_completed';

export default function DashboardShell() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [focusMode, setFocusMode] = useState(false);
  const [previousTab, setPreviousTab] = useState<TabId>('home');
  const [showWelcome, setShowWelcome] = useState(false);

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

  // Keyboard shortcut: Cmd+I to toggle focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to exit
      if (e.key === 'Escape' && focusMode) {
        exitFocusMode();
      }

      // Cmd+I (or Ctrl+I) to toggle
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.code === 'KeyI')) {
        e.preventDefault();
        console.log("Shortcut triggered: Cmd+I"); // Debug log for user

        if (focusMode) {
          exitFocusMode();
        } else {
          // Explicitly save current tab before switching
          const current = activeTab;
          setPreviousTab(current === 'injection' ? 'home' : current);
          setActiveTab('injection');
          setFocusMode(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, activeTab, exitFocusMode]); // Fixed dependencies

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

        {/* 2. Focus Mode Toggle (Fixed & Explicit) */}
        <div className="mr-4 flex-shrink-0 border-r border-border pr-4 h-6 flex items-center">
          <button
            onClick={focusMode ? exitFocusMode : () => handleTabChange('injection')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-300 border border-transparent",
              focusMode
                ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse font-bold"
                : "bg-background/50 hover:bg-background border-white/10 text-muted-foreground hover:text-foreground"
            )}
            style={{ minWidth: '110px' }}
            title="Toggle Live Injection Focus Mode (Cmd+I)"
          >
            <Syringe className={cn("w-4 h-4", focusMode && "animate-none")} />
            <span className="text-xs font-bold uppercase tracking-wider">
              {focusMode ? "EXIT VIEW" : "LIVE VIEW"}
            </span>
          </button>
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
