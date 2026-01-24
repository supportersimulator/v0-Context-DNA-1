'use client';

import { useState, useEffect, useCallback } from 'react';
import type { TabId } from '@/lib/types';
import { TabBar } from './tab-bar';
import { HomeView } from './views/home-view';
import { ActivityView } from './views/activity-view';
import { ProfessorView } from './views/professor-view';
import { SearchView } from './views/search-view';
import { HealthView } from './views/health-view';
import { InjectionFocusView } from './views/injection-focus-view';
import { cn } from '@/lib/utils';

export function DashboardShell() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [focusMode, setFocusMode] = useState(false);
  const [previousTab, setPreviousTab] = useState<TabId>('home');

  // Handle tab change - exit focus mode if switching to non-injection tab
  const handleTabChange = useCallback((tabId: TabId) => {
    if (tabId === 'injection') {
      setPreviousTab(activeTab);
      setFocusMode(true);
      setActiveTab('injection');
    } else {
      setFocusMode(false);
      setActiveTab(tabId);
    }
  }, [activeTab]);

  // Exit focus mode
  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    setActiveTab(previousTab);
  }, [previousTab]);

  // Keyboard shortcut: Escape to exit focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && focusMode) {
        exitFocusMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, exitFocusMode]);

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
      case 'injection':
        return <InjectionFocusView onClose={exitFocusMode} />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Tab bar - dimmed in focus mode but still functional */}
      <div className={cn(
        "transition-opacity duration-300",
        focusMode && "opacity-40 hover:opacity-70"
      )}>
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          focusMode={focusMode}
          onFocusModeToggle={() => focusMode ? exitFocusMode() : handleTabChange('injection')}
        />
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
