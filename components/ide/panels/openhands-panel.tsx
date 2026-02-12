'use client';

import { Bot, ExternalLink } from 'lucide-react';

// ---------------------------------------------------------------------------
// OpenHands AI coding agent panel
//
// Phase 1: iframe embedding the OpenHands web UI
// Phase 2: Native ContextDNA tool integration (API-based)
// ---------------------------------------------------------------------------

const OPENHANDS_URL = process.env.NEXT_PUBLIC_OPENHANDS_URL || 'http://127.0.0.1:3001';

export function OpenHandsPanel() {
  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">OpenHands</span>
        <a
          href={OPENHANDS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto"
          title="Open in browser"
        >
          <ExternalLink className="w-3 h-3 text-[#6b6b75] hover:text-[#e5e5e5]" />
        </a>
      </div>

      {/* Iframe or placeholder */}
      <div className="flex-1 relative">
        <iframe
          src={OPENHANDS_URL}
          className="absolute inset-0 w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="OpenHands AI Agent"
          onError={() => {
            /* Handled by fallback below */
          }}
        />
        {/* Fallback shown if iframe fails to load */}
        <noscript>
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] text-sm gap-2 p-4">
            <Bot className="w-8 h-8 opacity-50" />
            <span>OpenHands not available</span>
            <span className="text-xs">Start OpenHands at {OPENHANDS_URL}</span>
          </div>
        </noscript>
      </div>
    </div>
  );
}
