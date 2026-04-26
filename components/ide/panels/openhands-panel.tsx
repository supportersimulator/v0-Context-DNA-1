'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  ExternalLink,
  RefreshCw,
  Wifi,
  WifiOff,
  Maximize2,
  Minimize2,
  Terminal,
  Play,
  Square,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// OpenHands AI coding agent panel
//
// Phase 1: iframe embedding the OpenHands web UI with health detection
// Phase 2: Native API integration (agent task submission, streaming, tools)
//
// OpenHands backend runs on port 3000, frontend dev on 3001.
// In production, backend serves frontend on 3000.
// ---------------------------------------------------------------------------

type ConnectionState = 'checking' | 'connected' | 'offline';

// ---------------------------------------------------------------------------
// OpenHandsPanel
// ---------------------------------------------------------------------------

export function OpenHandsPanel() {
  const [status, setStatus] = useState<ConnectionState>('checking');
  const [iframeKey, setIframeKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showStartHelp, setShowStartHelp] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const baseUrl = getServiceUrl('openhands') || 'http://127.0.0.1:3000';

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${baseUrl}/api/options/models`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      setStatus(res.ok ? 'connected' : 'offline');
    } catch {
      setStatus('offline');
    }
  }, [baseUrl]);

  // Initial check + polling
  useEffect(() => {
    checkHealth();
    pollRef.current = setInterval(checkHealth, 30_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkHealth]);

  const handleRefresh = useCallback(() => {
    setStatus('checking');
    setIframeKey((k) => k + 1);
    checkHealth();
  }, [checkHealth]);

  const statusDot =
    status === 'connected'
      ? 'bg-[#22c55e]'
      : status === 'checking'
        ? 'bg-yellow-500 animate-pulse'
        : 'bg-red-500';

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">OpenHands</span>
        <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} title={status} />
        <span className="text-[10px] text-[#6b6b75]">
          {status === 'connected' ? 'Connected' : status === 'checking' ? 'Checking...' : 'Offline'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5]"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5]"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <a
            href={baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-[#2a2a35] text-[#6b6b75] hover:text-[#e5e5e5]"
            title="Open in browser"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {status === 'connected' ? (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={baseUrl}
            className="absolute inset-0 w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            title="OpenHands AI Agent"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-4 p-6">
            {status === 'checking' ? (
              <>
                <RefreshCw className="w-8 h-8 animate-spin opacity-50" />
                <span className="text-sm">Connecting to OpenHands...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-8 h-8 opacity-40" />
                <span className="text-sm font-medium text-[#e5e5e5]">OpenHands Not Running</span>
                <span className="text-xs text-center max-w-[280px]">
                  Start OpenHands to enable AI coding agents with parallel task execution.
                </span>

                {/* Start instructions */}
                <button
                  onClick={() => setShowStartHelp(!showStartHelp)}
                  className="text-xs text-[#22c55e] hover:underline mt-2"
                >
                  {showStartHelp ? 'Hide setup instructions' : 'How to start OpenHands'}
                </button>

                {showStartHelp && (
                  <div className="w-full max-w-[320px] rounded border border-[#2a2a35] bg-[#111118] p-3 text-xs space-y-3">
                    <div>
                      <p className="text-[#e5e5e5] font-medium mb-1 flex items-center gap-1.5">
                        <Terminal className="w-3 h-3" /> Option 1: Docker (recommended)
                      </p>
                      <code className="block bg-[#0a0a0f] rounded px-2 py-1.5 text-[10px] text-[#22c55e] break-all">
                        docker run -it --rm -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock
                        ghcr.io/all-hands-ai/openhands:main
                      </code>
                    </div>
                    <div>
                      <p className="text-[#e5e5e5] font-medium mb-1 flex items-center gap-1.5">
                        <Play className="w-3 h-3" /> Option 2: uv (Python)
                      </p>
                      <code className="block bg-[#0a0a0f] rounded px-2 py-1.5 text-[10px] text-[#22c55e] break-all">
                        uv tool install openhands && openhands serve
                      </code>
                    </div>
                    <p className="text-[10px] text-[#6b6b75]">
                      Once running, OpenHands serves on{' '}
                      <span className="text-[#e5e5e5]">{baseUrl}</span>
                    </p>
                  </div>
                )}

                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 rounded bg-[#22c55e]/10 px-3 py-1.5 text-xs text-[#22c55e] hover:bg-[#22c55e]/20 mt-2"
                >
                  <Wifi className="w-3 h-3" />
                  Retry Connection
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
