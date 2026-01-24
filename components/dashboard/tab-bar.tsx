'use client';

import React from "react"

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Tab, TabId } from '@/lib/types';
import { DEFAULT_TABS } from '@/lib/types';
import { X, Plus, GripVertical, Syringe } from 'lucide-react';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
  focusMode?: boolean;
  onFocusModeToggle?: () => void;
}

export function TabBar({ activeTab, onTabChange, focusMode, onFocusModeToggle }: TabBarProps) {
  const [tabs, setTabs] = useState<Tab[]>(DEFAULT_TABS);
  const [draggedTab, setDraggedTab] = useState<TabId | null>(null);

  const handleDragStart = (e: React.DragEvent, tabId: TabId) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetTabId: TabId) => {
    e.preventDefault();
    if (!draggedTab || draggedTab === targetTabId) return;

    const newTabs = [...tabs];
    const draggedIndex = newTabs.findIndex((t) => t.id === draggedTab);
    const targetIndex = newTabs.findIndex((t) => t.id === targetTabId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(targetIndex, 0, removed);
      setTabs(newTabs);
    }
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
  };

  const handleCloseTab = (tabId: TabId) => {
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTab === tabId) {
      onTabChange(newTabs[0].id);
    }
  };

  const handleAddTab = () => {
    // Find tabs that are not currently visible
    const visibleIds = new Set(tabs.map((t) => t.id));
    const hiddenTabs = DEFAULT_TABS.filter((t) => !visibleIds.has(t.id));

    if (hiddenTabs.length > 0) {
      setTabs([...tabs, hiddenTabs[0]]);
    }
  };

  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide h-full">
      <div className={cn(
        "flex items-center gap-1 flex-1 h-full",
        focusMode && "opacity-20 pointer-events-none filter blur-[1px]"
      )}>
        {isMounted ? tabs.map((tab) => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200',
              'hover:bg-muted',
              activeTab === tab.id
                ? 'bg-card text-foreground shadow-sm ring-1 ring-primary/20'
                : 'text-muted-foreground',
              draggedTab === tab.id && 'opacity-50'
            )}
            onClick={() => onTabChange(tab.id)}
          >
            <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-50 cursor-grab" />
            <span className="text-sm">{tab.icon}</span>
            <span className="text-sm font-medium whitespace-nowrap">{tab.label}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded p-0.5 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )) : (
          <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground text-sm">
            Loading tabs...
          </div>
        )}
      </div>

      <div className={cn("flex items-center pl-2", focusMode && "opacity-20")}>
        {isMounted && tabs.length < DEFAULT_TABS.length && (
          <button
            onClick={handleAddTab}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
