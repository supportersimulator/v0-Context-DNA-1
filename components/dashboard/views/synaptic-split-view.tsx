'use client';

/**
 * AI Chat Hub — Tabbed interface for all AI assistants
 *
 * Tabs: [Synaptic] [Claude] [Agents]
 *
 * - Synaptic: Local LLM (Qwen3), voice + text, free, fast
 * - Claude: Anthropic Claude, text streaming, powerful, cloud
 * - Agents: OpenHands iframe for autonomous coding tasks
 *
 * Batman/Alfred philosophy: Alfred (Synaptic) handles routine,
 * Batman (Claude) handles the hard stuff, same cave (panel).
 */

import { useState, useEffect, useCallback } from 'react';
import { Bot, Brain, Sparkles, ExternalLink } from 'lucide-react';
import { SynapticChatView } from './synaptic-chat-view';
import { ClaudeChatView } from './claude-chat-view';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tab Definitions
// ---------------------------------------------------------------------------

type TabId = 'synaptic' | 'claude' | 'agents';

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Brain;
  accent: string;
  description: string;
}

const TABS: TabDef[] = [
  {
    id: 'synaptic',
    label: 'Synaptic',
    icon: Brain,
    accent: '#d97857',       // Warm coral (matches SynapticChatView)
    description: 'Local LLM',
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: Sparkles,
    accent: '#a78bfa',       // Violet (matches ClaudeChatView)
    description: 'Cloud AI',
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: Bot,
    accent: '#22c55e',       // Green (OpenHands brand)
    description: 'OpenHands',
  },
];

const TAB_STORAGE_KEY = 'contextdna_ai_hub_tab';

// ---------------------------------------------------------------------------
// OpenHands Pane (preserved from original split view)
// ---------------------------------------------------------------------------

const OPENHANDS_URL = process.env.NEXT_PUBLIC_OPENHANDS_URL || 'http://localhost:3001';

function OpenHandsPane() {
  const [iframeError, setIframeError] = useState(false);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {iframeError ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
          <div className="w-14 h-14 rounded-xl bg-[#1a1a24] flex items-center justify-center">
            <Bot className="w-7 h-7 text-[#6b6b75]" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-[#e5e5e5]">
              OpenHands Agent
            </p>
            <p className="text-xs text-[#6b6b75] max-w-[280px]">
              API agents integration for autonomous coding tasks.
              Start OpenHands to connect.
            </p>
            <p className="text-xs text-[#6b6b75] font-mono">
              {OPENHANDS_URL}
            </p>
          </div>
          <a
            href={OPENHANDS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-[#22c55e] hover:text-[#22c55e]/80 transition-colors"
          >
            Open in browser
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <div className="flex-1 relative">
          <iframe
            src={OPENHANDS_URL}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="OpenHands AI Agent"
            onError={() => setIframeError(true)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component — Exported as SynapticSplitView for backward compat
// ---------------------------------------------------------------------------

export function SynapticSplitView() {
  const [activeTab, setActiveTab] = useState<TabId>('synaptic');
  // Track which tabs have been visited (lazy mount, keep alive)
  const [mounted, setMounted] = useState<Set<TabId>>(new Set(['synaptic']));

  // Persist tab selection
  useEffect(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY) as TabId | null;
    if (saved && TABS.some(t => t.id === saved)) {
      setActiveTab(saved);
      setMounted(prev => new Set(prev).add(saved));
    }
  }, []);

  const switchTab = useCallback((id: TabId) => {
    setActiveTab(id);
    setMounted(prev => new Set(prev).add(id));
    localStorage.setItem(TAB_STORAGE_KEY, id);
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* Tab Bar */}
      <div className="flex items-center h-9 px-1 border-b border-[#2a2a35] bg-[#111118] flex-shrink-0 select-none gap-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 h-full text-xs transition-colors relative',
                'hover:bg-[#1e1e24]',
                isActive
                  ? 'text-[#f5f5f5] font-medium'
                  : 'text-[#6b6b75]'
              )}
            >
              <Icon
                className="w-3.5 h-3.5"
                style={{ color: isActive ? tab.accent : undefined }}
              />
              <span>{tab.label}</span>
              <span
                className={cn(
                  'text-[10px] ml-1 hidden sm:inline',
                  isActive ? 'text-[#888]' : 'text-[#555]'
                )}
              >
                {tab.description}
              </span>
              {/* Active indicator bar */}
              {isActive && (
                <div
                  className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                  style={{ backgroundColor: tab.accent }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content — keep-alive: mount once, toggle visibility */}
      <div className="flex-1 min-h-0 relative">
        {mounted.has('synaptic') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'synaptic' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <SynapticChatView />
          </div>
        )}
        {mounted.has('claude') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'claude' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <ClaudeChatView />
          </div>
        )}
        {mounted.has('agents') && (
          <div
            className={cn(
              'absolute inset-0',
              activeTab === 'agents' ? 'z-10 visible' : 'z-0 invisible'
            )}
          >
            <OpenHandsPane />
          </div>
        )}
      </div>
    </div>
  );
}
