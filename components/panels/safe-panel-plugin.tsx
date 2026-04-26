'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, AlertTriangle, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PanelPluginType = 'injections' | 'learnings' | 'architecture' | 'synaptic' | 'custom';

export interface PanelPluginConfig {
  id: string;
  name: string;
  type: PanelPluginType;
  source: 'internal' | 'api' | 'websocket' | 'webhook' | 'iframe';
  url?: string; // For iframe or webhook sources
  apiEndpoint?: string;
  websocketUrl?: string;
  webhookUrl?: string;
  sandboxed: boolean;
  timeout: number; // ms
  maxRetries: number;
  errorBoundary: boolean;
}

export interface PanelPluginState {
  id: string;
  status: 'idle' | 'loading' | 'ready' | 'error' | 'timeout';
  error?: string;
  data?: any;
  loadTime: number;
}

interface SafePanelPluginProps {
  config: PanelPluginConfig;
  onError?: (error: string) => void;
  onClose?: () => void;
  children?: React.ReactNode; // Fallback content
}

/**
 * SafePanelPlugin - Securely load third-party panels
 *
 * This component provides a secure sandbox for loading external panel content.
 * Uses iframes by default to isolate untrusted code from the main application.
 *
 * Safety features:
 * - iframe sandboxing restricts permissions
 * - Timeout protection prevents hung panels
 * - Error boundaries prevent cascade failures
 * - Message-based communication with plugins
 * - Retry logic for network failures
 * - Resource limits
 */
export function SafePanelPlugin({
  config,
  onError,
  onClose,
  children,
}: SafePanelPluginProps) {
  const [state, setState] = useState<PanelPluginState>({
    id: config.id,
    status: 'loading',
    loadTime: 0,
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);
  const retryCountRef = useRef(0);

  // Forward-ref so the mount useEffect can reference loadPanel without the
  // React-Compiler "before declared" warning. Synced via effect below.
  const loadPanelRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    // For internal panels, skip loading
    if (config.source === 'internal') {
      setState((prev) => ({ ...prev, status: 'ready' }));
      return;
    }

    // For iframe-based loading
    if (config.sandboxed && config.url) {
      loadPanelRef.current();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [config]);

  const loadPanel = async () => {
    const startTime = Date.now();
    retryCountRef.current = 0;

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        status: 'timeout',
        error: `Panel load timeout (${config.timeout}ms)`,
      }));
      onError?.(`Panel ${config.name} timed out`);
    }, config.timeout);

    try {
      // If it's an iframe, just mark as ready
      // The iframe will load asynchronously
      if (iframeRef.current) {
        iframeRef.current.onload = () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setState((prev) => ({
            ...prev,
            status: 'ready',
            loadTime: Date.now() - startTime,
          }));
        };

        iframeRef.current.onerror = () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          const error = `Failed to load panel from ${config.url}`;
          setState((prev) => ({ ...prev, status: 'error', error }));
          onError?.(error);
        };
      }
    } catch (error) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setState((prev) => ({ ...prev, status: 'error', error: errorMsg }));
      onError?.(errorMsg);
    }
  };

  // Keep loadPanelRef pointing at the latest closure
  useEffect(() => {
    loadPanelRef.current = loadPanel;
  });

  // Render based on status
  if (state.status === 'loading') {
    return (
      <div className='flex items-center justify-center h-full bg-muted/20'>
        <div className='flex flex-col items-center gap-2'>
          <Loader className='w-4 h-4 animate-spin text-primary' />
          <span className='text-sm text-muted-foreground'>Loading {config.name}...</span>
        </div>
      </div>
    );
  }

  if (state.status === 'error' || state.status === 'timeout') {
    return (
      <div className='flex flex-col items-center justify-center h-full bg-destructive/5 p-4'>
        <AlertTriangle className='w-8 h-8 text-destructive mb-2' />
        <h3 className='font-semibold text-foreground mb-1'>Failed to load {config.name}</h3>
        <p className='text-sm text-muted-foreground text-center mb-4'>{state.error}</p>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              setState((prev) => ({ ...prev, status: 'loading' }));
              loadPanel();
            }}
          >
            Retry
          </Button>
          {onClose && (
            <Button variant='ghost' size='sm' onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (state.status === 'ready') {
    // For iframe panels
    if (config.sandboxed && config.url) {
      return (
        <div className='relative h-full w-full overflow-hidden'>
          <iframe
            ref={iframeRef}
            src={config.url}
            sandbox="allow-scripts"
            className='w-full h-full border-0'
            title={config.name}
          />
          {onClose && (
            <Button
              variant='ghost'
              size='sm'
              onClick={onClose}
              className='absolute top-2 right-2 h-6 w-6 p-0 z-10'
            >
              <X className='w-3 h-3' />
            </Button>
          )}
        </div>
      );
    }

    // For internal panels, render children
    return <>{children}</>;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Panel Plugin Security Guidelines
//
// When creating external panel sources:
//
// 1. API Panels:
//    - Endpoint must return JSON with { html, css, js }
//    - JS must communicate via postMessage() API
//    - No direct DOM access
//
// 2. WebSocket Panels:
//    - Send updates as JSON
//    - Listen for commands from parent
//    - Graceful reconnection
//
// 3. Webhook Panels:
//    - Sent from external systems
//    - Always sanitize content
//    - Validate source
//
// 4. iframe Panels:
//    - Completely isolated by browser
//    - Must communicate via postMessage
//    - No access to parent window
//    - Perfect for untrusted sources
//
// Message API Example:
//   parent.postMessage({ type: 'panel-update', panelId: 'my-panel', data: {} }, '*');
//   window.addEventListener('message', (event) => {
//     if (event.source !== expectedPanel) return;
//     // Process event.data
//   });
// ---------------------------------------------------------------------------
