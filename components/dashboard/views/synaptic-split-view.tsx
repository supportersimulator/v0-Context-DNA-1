'use client';

import { useState, useEffect } from 'react';
import { Bot, Brain, ExternalLink } from 'lucide-react';
import { ResizableSplitPane } from '@/components/ide/resizable-split-pane';
import { SynapticChatView } from './synaptic-chat-view';

// ---------------------------------------------------------------------------
// SynapticSplitView
//
// Side-by-side layout: OpenHands agent (left) | Synaptic chat (right).
// On narrow screens, stacks with Synaptic on top (priority).
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

export function SynapticSplitView() {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f]">
      {/* Header bar with pane labels */}
      <div className="flex items-center h-8 px-3 border-b border-[#2a2a35] bg-[#111118] flex-shrink-0 select-none">
        {isNarrow ? (
          // Narrow: stacked labels (Synaptic first = priority)
          <>
            <Brain className="w-3 h-3 text-[#22c55e] mr-1.5" />
            <span className="text-xs font-medium text-[#e5e5e5]">
              Local LLM (Synaptic)
            </span>
            <span className="mx-2 text-[#2a2a35]">|</span>
            <Bot className="w-3 h-3 text-[#6b6b75] mr-1.5" />
            <span className="text-xs text-[#6b6b75]">
              API Agents (OpenHands)
            </span>
          </>
        ) : (
          // Wide: left and right labels matching pane positions
          <>
            <Bot className="w-3 h-3 text-[#22c55e] mr-1.5" />
            <span className="text-xs font-medium text-[#e5e5e5]">
              API Agents (OpenHands)
            </span>
            <div className="flex-1" />
            <div className="w-px h-4 bg-[#2a2a35]" />
            <div className="flex-1" />
            <Brain className="w-3 h-3 text-[#22c55e] mr-1.5" />
            <span className="text-xs font-medium text-[#e5e5e5]">
              Local LLM (Synaptic)
            </span>
          </>
        )}
      </div>

      {/* Split content */}
      <div className="flex-1 min-h-0">
        {isNarrow ? (
          // Narrow: stack with Synaptic on top (priority)
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 overflow-hidden">
              <SynapticChatView />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden border-t border-[#2a2a35]">
              <OpenHandsPane />
            </div>
          </div>
        ) : (
          <ResizableSplitPane
            defaultSplit={0.5}
            minLeftWidth={200}
            minRightWidth={200}
          >
            <OpenHandsPane />
            <SynapticChatView />
          </ResizableSplitPane>
        )}
      </div>
    </div>
  );
}
