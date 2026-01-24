'use client';

import { useState } from 'react';
import type { TabId } from '@/lib/types';
import { TabBar } from './tab-bar';
import { HomeView } from './views/home-view';
import { ActivityView } from './views/activity-view';
import { ProfessorView } from './views/professor-view';
import { SearchView } from './views/search-view';
import { HealthView } from './views/health-view';

export function DashboardShell() {
  const [activeTab, setActiveTab] = useState<TabId>('home');

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
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1400px] mx-auto p-6">
          {renderView()}
        </div>
      </main>
    </div>
  );
}
