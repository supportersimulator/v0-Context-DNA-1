'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Workflow,
  Play,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Wifi,
  WifiOff,
  Server,
  Database,
  Zap,
  ChevronDown,
  ChevronRight,
  Trash2,
  Send,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';
import { getNodeREDBridge, type FlowTemplate, type NodeRedMessage, type BridgeState } from '@/lib/ide/nodered-bridge';
import { getCapabilityBus } from '@/lib/ide/capability-bus';

// =============================================================================
// Node-RED Flow Monitor Panel
//
// Visual event-driven flow monitoring panel that:
// 1. Embeds the Node-RED editor via iframe (localhost:1880)
// 2. Shows connection health for Node-RED, Agent API, PostgreSQL
// 3. Displays a live event log of keyword hits / automation events
// 4. Provides setup instructions with Docker Compose config
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceHealth {
  name: string;
  url: string;
  status: 'healthy' | 'degraded' | 'offline' | 'checking';
  latency: number;
  lastChecked: number;
}

interface FlowEvent {
  id: string;
  type: string;
  ts: number;
  keyword?: string;
  source?: string;
  url?: string;
  score?: number;
  title?: string;
  matched_text?: string;
  [key: string]: unknown;
}

type TabId = 'editor' | 'events' | 'templates' | 'debug' | 'setup';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODERED_URL = 'http://127.0.0.1:1880';
const AGENT_API_URL = 'http://127.0.0.1:8000';

const DOCKER_COMPOSE = `version: '3.8'

services:
  nodered:
    image: nodered/node-red:latest
    container_name: nodered
    ports:
      - "1880:1880"
    volumes:
      - nodered_data:/data
    environment:
      - TZ=America/Denver

  agent_api:
    build:
      context: ./agent_api
    container_name: agent_api
    ports:
      - "8000:8000"
    environment:
      - NODERED_WEBHOOK_URL=http://nodered:1880/hook/keyword-hit
      - TZ=America/Denver
    depends_on:
      - nodered

  postgres:
    image: postgres:16-alpine
    container_name: nodered_pg
    ports:
      - "5433:5432"
    environment:
      - POSTGRES_DB=socialauto_db
      - POSTGRES_USER=devuser
      - POSTGRES_PASSWORD=devpass
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    container_name: nodered_redis
    ports:
      - "6380:6379"

volumes:
  nodered_data:
  pg_data:`;

const NODERED_FLOW_JSON = `[
  {
    "id": "a1_http_in",
    "type": "http in",
    "z": "flow1",
    "name": "Keyword Hit Webhook",
    "url": "/hook/keyword-hit",
    "method": "post",
    "upload": false,
    "x": 180,
    "y": 160,
    "wires": [["a2_debug","a3_http_response"]]
  },
  {
    "id": "a2_debug",
    "type": "debug",
    "z": "flow1",
    "name": "Show Event Payload",
    "active": true,
    "tosidebar": true,
    "tostatus": true,
    "complete": "payload",
    "targetType": "msg",
    "statusVal": "payload.keyword",
    "statusType": "msg",
    "x": 460,
    "y": 140,
    "wires": []
  },
  {
    "id": "a3_http_response",
    "type": "http response",
    "z": "flow1",
    "name": "OK",
    "statusCode": "200",
    "x": 460,
    "y": 200,
    "wires": []
  },
  {
    "id": "flow1",
    "type": "tab",
    "label": "Keyword Monitor",
    "disabled": false
  }
]`;

const AGENT_API_MAIN_PY = `import os, time, requests
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

NODERED_WEBHOOK_URL = os.getenv(
    "NODERED_WEBHOOK_URL",
    "http://localhost:1880/hook/keyword-hit",
)

class KeywordHit(BaseModel):
    keyword: str
    source: str = "reddit"
    url: str
    score: int = 0
    title: str = ""
    matched_text: str = ""

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/emit")
def emit(hit: KeywordHit):
    event = {
        "type": "keyword_hit",
        "ts": int(time.time()),
        **hit.model_dump(),
    }
    r = requests.post(NODERED_WEBHOOK_URL, json=event, timeout=10)
    r.raise_for_status()
    return {"sent_to": NODERED_WEBHOOK_URL, "event": event}`;

// ---------------------------------------------------------------------------
// Health check hook
// ---------------------------------------------------------------------------

function useServiceHealthCheck(
  name: string,
  url: string,
  intervalMs = 15_000,
): ServiceHealth {
  const [health, setHealth] = useState<ServiceHealth>({
    name,
    url,
    status: 'checking',
    latency: -1,
    lastChecked: 0,
  });

  const checkHealth = useCallback(async () => {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const healthUrl =
        name === 'Node-RED'
          ? url
          : name === 'Agent API'
            ? `${url}/health`
            : url;
      const res = await fetch(healthUrl, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - start);
      setHealth({
        name,
        url,
        status: res.ok ? 'healthy' : 'degraded',
        latency,
        lastChecked: Date.now(),
      });
    } catch {
      setHealth({
        name,
        url,
        status: 'offline',
        latency: -1,
        lastChecked: Date.now(),
      });
    }
  }, [name, url]);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, intervalMs);
    return () => clearInterval(id);
  }, [checkHealth, intervalMs]);

  return health;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ health }: { health: ServiceHealth }) {
  const colors = {
    healthy: 'bg-[#22c55e]',
    degraded: 'bg-yellow-500',
    offline: 'bg-red-500',
    checking: 'bg-[#6b6b75] animate-pulse',
  };

  const icons = {
    healthy: <Wifi className="w-3 h-3" />,
    degraded: <AlertCircle className="w-3 h-3" />,
    offline: <WifiOff className="w-3 h-3" />,
    checking: <RefreshCw className="w-3 h-3 animate-spin" />,
  };

  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span
        className={`inline-block w-2 h-2 rounded-full ${colors[health.status]}`}
      />
      {icons[health.status]}
      <span className="text-[#cccccc]">{health.name}</span>
      {health.latency > 0 && (
        <span className="text-[#6b6b75]">{health.latency}ms</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copyable code block
// ---------------------------------------------------------------------------

function CodeBlock({
  code,
  language = 'yaml',
  maxHeight = 300,
}: {
  code: string;
  language?: string;
  maxHeight?: number;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 rounded bg-[#2a2a3a] hover:bg-[#3a3a4a] opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-[#22c55e]" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-[#8888aa]" />
        )}
      </button>
      <pre
        className="bg-[#1a1a2a] text-[#cccccc] text-[11px] leading-[1.5] p-3 rounded overflow-auto font-mono"
        style={{ maxHeight }}
      >
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#2a2a3a] rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 p-2 text-left text-[12px] font-medium text-[#cccccc] hover:bg-[#1a1a2a]"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#8888aa]" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#8888aa]" />
        )}
        {title}
      </button>
      {open && <div className="p-2 pt-0">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow Editor Tab (iframe embed)
// ---------------------------------------------------------------------------

function FlowEditorTab({ nodeRedHealth }: { nodeRedHealth: ServiceHealth }) {
  if (nodeRedHealth.status === 'offline' || nodeRedHealth.status === 'checking') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[#8888aa] p-4">
        <Workflow className="w-12 h-12 opacity-30" />
        <div className="text-center">
          <p className="text-[13px] font-medium text-[#cccccc] mb-1">
            Node-RED is {nodeRedHealth.status === 'checking' ? 'connecting...' : 'not running'}
          </p>
          <p className="text-[11px] max-w-[300px]">
            Start Node-RED with Docker to see the visual flow editor here.
            Check the Setup tab for instructions.
          </p>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => window.open(NODERED_URL, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] bg-[#2a2a3a] hover:bg-[#3a3a4a] rounded text-[#cccccc]"
          >
            <ExternalLink className="w-3 h-3" />
            Open in Browser
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 bg-[#1a1a2a] border-b border-[#2a2a3a]">
        <span className="text-[11px] text-[#8888aa]">
          {NODERED_URL}
        </span>
        <button
          onClick={() => window.open(NODERED_URL, '_blank')}
          className="p-1 hover:bg-[#2a2a3a] rounded"
          title="Open in new window"
        >
          <ExternalLink className="w-3 h-3 text-[#8888aa]" />
        </button>
      </div>
      <iframe
        src={NODERED_URL}
        className="flex-1 w-full border-0 bg-[#1a1a2a]"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Node-RED Flow Editor"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event Log Tab
// ---------------------------------------------------------------------------

function EventLogTab({ agentHealth }: { agentHealth: ServiceHealth }) {
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [testKeyword, setTestKeyword] = useState('contextdna');
  const [sending, setSending] = useState(false);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Send a test event via the agent API
  const sendTestEvent = useCallback(async () => {
    if (agentHealth.status !== 'healthy') return;
    setSending(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/emit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: testKeyword,
          source: 'test',
          url: 'https://example.com/test-post',
          score: 42,
          title: `Test event: ${testKeyword}`,
          matched_text: `This is a test event for keyword: ${testKeyword}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const event: FlowEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          ...data.event,
        };
        setEvents((prev) => [...prev.slice(-99), event]);
      }
    } catch {
      // offline — silently fail
    } finally {
      setSending(false);
    }
  }, [agentHealth.status, testKeyword]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Test Event Emitter */}
      <div className="flex items-center gap-2 p-2 bg-[#1a1a2a] border-b border-[#2a2a3a]">
        <Zap className="w-3.5 h-3.5 text-[#f59e0b]" />
        <input
          type="text"
          value={testKeyword}
          onChange={(e) => setTestKeyword(e.target.value)}
          placeholder="keyword..."
          className="flex-1 bg-[#0e0e1a] text-[#cccccc] text-[11px] px-2 py-1 rounded border border-[#2a2a3a] focus:border-[#4a4a6a] outline-none"
          onKeyDown={(e) => e.key === 'Enter' && sendTestEvent()}
        />
        <button
          onClick={sendTestEvent}
          disabled={agentHealth.status !== 'healthy' || sending}
          className="flex items-center gap-1 px-2 py-1 text-[11px] bg-[#2a4a2a] hover:bg-[#3a5a3a] disabled:opacity-40 disabled:cursor-not-allowed rounded text-[#cccccc]"
        >
          <Send className="w-3 h-3" />
          Emit
        </button>
        <button
          onClick={() => setEvents([])}
          disabled={events.length === 0}
          className="p-1 hover:bg-[#2a2a3a] rounded disabled:opacity-30"
          title="Clear events"
        >
          <Trash2 className="w-3 h-3 text-[#8888aa]" />
        </button>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
            <Workflow className="w-8 h-8 opacity-30" />
            <p className="text-[11px]">No events yet. Emit a test event above.</p>
            {agentHealth.status !== 'healthy' && (
              <p className="text-[10px] text-yellow-600">
                Agent API is offline — start it with docker compose up
              </p>
            )}
          </div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className="p-2 bg-[#1a1a2a] rounded border border-[#2a2a3a] text-[11px] space-y-1"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-[#2a4a2a] text-[#22c55e] rounded text-[10px] font-mono">
                    {evt.type}
                  </span>
                  {evt.keyword && (
                    <span className="px-1.5 py-0.5 bg-[#2a2a4a] text-[#818cf8] rounded text-[10px]">
                      {evt.keyword}
                    </span>
                  )}
                  {evt.source && (
                    <span className="text-[#6b6b75]">via {evt.source}</span>
                  )}
                </div>
                <span className="text-[10px] text-[#6b6b75] font-mono">
                  {new Date(evt.ts * 1000).toLocaleTimeString()}
                </span>
              </div>
              {evt.title && (
                <p className="text-[#cccccc] truncate">{evt.title}</p>
              )}
              {evt.url && (
                <a
                  href={evt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#818cf8] hover:underline truncate block"
                >
                  {evt.url}
                </a>
              )}
              {evt.score !== undefined && evt.score > 0 && (
                <span className="text-[10px] text-[#6b6b75]">
                  score: {evt.score}
                </span>
              )}
            </div>
          ))
        )}
        <div ref={eventsEndRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup Tab
// ---------------------------------------------------------------------------
// Templates Tab — Flow template browser with Deploy button
// ---------------------------------------------------------------------------

function TemplatesTab() {
  const templates = getNodeREDBridge().getTemplates();

  const categoryColors: Record<string, string> = {
    evidence: 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/30',
    injection: 'text-[#818cf8] bg-[#818cf8]/10 border-[#818cf8]/30',
    scheduler: 'text-[#e5c07b] bg-[#e5c07b]/10 border-[#e5c07b]/30',
    custom: 'text-[#8888aa] bg-[#8888aa]/10 border-[#8888aa]/30',
  };

  return (
    <div className="flex-1 overflow-auto p-3 space-y-2">
      <div className="text-[10px] text-[#6b6b75] uppercase tracking-wider font-semibold mb-2">
        Context DNA Flow Templates
      </div>
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="border border-[#2a2a3a] rounded-lg p-3 hover:border-[#818cf8]/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${categoryColors[tpl.category] ?? categoryColors.custom}`}>
              {tpl.category}
            </span>
            <span className="text-xs font-medium text-[#cccccc]">{tpl.name}</span>
          </div>
          <p className="text-[11px] text-[#8888aa] mb-2">{tpl.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#6b6b75]">
              {(tpl.flow as any)?.nodes?.length ?? 0} nodes
            </span>
            <button
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-[#818cf8]/20 text-[#818cf8] text-[10px] font-medium hover:bg-[#818cf8]/30 transition-colors"
              onClick={() => {
                // Future: deploy template to Node-RED
                try {
                  getCapabilityBus().emit('nodered.flow.deploy', {
                    flowId: tpl.id,
                    source: 'templates-tab',
                  });
                } catch { /* bus not ready */ }
              }}
            >
              <Play className="w-3 h-3" />
              Deploy
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Debug Tab — Real-time Node-RED debug messages via CapabilityBus
// ---------------------------------------------------------------------------

function LiveDebugTab() {
  const [messages, setMessages] = useState<{ nodeId: string; message: string; timestamp: number }[]>([]);
  const [bridgeState, setBridgeState] = useState<BridgeState>('disconnected');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bridge = getNodeREDBridge();
    setBridgeState(bridge.getState());

    // Connect if not connected
    bridge.connect();

    // Load existing debug messages
    const existing = bridge.getDebugMessages().map((m) => ({
      nodeId: (m.data as any)?.id ?? 'unknown',
      message: typeof m.data === 'string' ? m.data : JSON.stringify(m.data),
      timestamp: Date.now(),
    }));
    setMessages(existing.slice(-50));

    // Subscribe to new debug messages via CapabilityBus
    const bus = getCapabilityBus();
    const sub = bus.on('nodered.debug', (data) => {
      setMessages((prev) => {
        const next = [...prev, data].slice(-100);
        return next;
      });
    });

    // Subscribe to bridge state changes
    const stateSub = bridge.onStateChange((state) => {
      setBridgeState(state);
    });

    return () => {
      sub.dispose();
      stateSub();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const stateColor = bridgeState === 'connected' ? 'text-[#22c55e]' : bridgeState === 'connecting' ? 'text-[#e5c07b]' : 'text-[#ef4444]';

  return (
    <div className="flex flex-col h-full">
      {/* Connection status bar */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[#2a2a3a] flex-shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${bridgeState === 'connected' ? 'bg-[#22c55e]' : bridgeState === 'connecting' ? 'bg-[#e5c07b] animate-pulse' : 'bg-[#ef4444]'}`} />
        <span className={`text-[10px] ${stateColor}`}>
          {bridgeState === 'connected' ? 'Connected to Node-RED' : bridgeState === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </span>
        <span className="text-[10px] text-[#6b6b75] ml-auto">{messages.length} messages</span>
        <button
          onClick={() => setMessages([])}
          className="text-[10px] text-[#6b6b75] hover:text-[#ef4444] transition-colors"
          title="Clear"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Debug message stream */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-1 font-mono text-[10px] space-y-0.5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
            <Send className="w-6 h-6 opacity-40" />
            <span className="text-xs">No debug messages yet</span>
            <span className="text-[10px]">Add debug nodes in Node-RED to see output here</span>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className="flex items-start gap-2 px-2 py-0.5 rounded hover:bg-[#1a1a24]/50"
          >
            <span className="text-[#6b6b75] flex-shrink-0 w-[50px] text-right">
              {new Date(msg.timestamp).toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-[#818cf8] flex-shrink-0">[{msg.nodeId.slice(0, 8)}]</span>
            <span className="text-[#cccccc] break-all">{msg.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetupTab() {
  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      <div className="text-[12px] text-[#cccccc] space-y-1">
        <h3 className="font-medium flex items-center gap-1.5">
          <Workflow className="w-4 h-4 text-[#818cf8]" />
          Node-RED + FastAPI + PostgreSQL
        </h3>
        <p className="text-[11px] text-[#8888aa]">
          Visual event-driven automation. Python agents as endpoints,
          Node-RED as the wiring board.
        </p>
      </div>

      <Collapsible title="1. Docker Compose (copy to project root)" defaultOpen>
        <CodeBlock code={DOCKER_COMPOSE} language="yaml" maxHeight={250} />
      </Collapsible>

      <Collapsible title="2. Agent API — main.py">
        <CodeBlock code={AGENT_API_MAIN_PY} language="python" maxHeight={250} />
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-[#8888aa]">
            Also create <code className="text-[#818cf8]">agent_api/requirements.txt</code>:
          </p>
          <CodeBlock
            code={`fastapi==0.116.1\nuvicorn[standard]==0.35.0\nrequests==2.32.3`}
            language="text"
            maxHeight={80}
          />
          <p className="text-[11px] text-[#8888aa]">
            And <code className="text-[#818cf8]">agent_api/Dockerfile</code>:
          </p>
          <CodeBlock
            code={`FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY main.py .\nEXPOSE 8000\nCMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`}
            language="dockerfile"
            maxHeight={150}
          />
        </div>
      </Collapsible>

      <Collapsible title="3. Node-RED Starter Flow (import in Node-RED)">
        <p className="text-[11px] text-[#8888aa] mb-2">
          Import this JSON in Node-RED (Menu &rarr; Import &rarr; Clipboard):
        </p>
        <CodeBlock code={NODERED_FLOW_JSON} language="json" maxHeight={200} />
      </Collapsible>

      <Collapsible title="4. Quick Start Commands">
        <CodeBlock
          code={`# Start all services
docker compose up --build -d

# Check services are running
docker compose ps

# Open Node-RED editor
open http://localhost:1880

# Send a test event
curl -X POST http://localhost:8000/emit \\
  -H "Content-Type: application/json" \\
  -d '{"keyword":"contextdna","source":"reddit","url":"https://example.com","score":123,"title":"Someone mentioned ContextDNA"}'

# View Node-RED debug output
# (Open the Debug pane in the Node-RED editor sidebar)

# Stop all services
docker compose down`}
          language="bash"
          maxHeight={250}
        />
      </Collapsible>

      <Collapsible title="5. Architecture">
        <div className="text-[11px] text-[#8888aa] space-y-2">
          <div className="bg-[#1a1a2a] p-3 rounded font-mono text-[10px] leading-[1.6]">
            <pre>{`┌─────────────┐     POST /emit     ┌─────────────┐
│  Your Code  │ ─────────────────▶ │  Agent API  │
│ (Claude Code│                    │  (FastAPI)  │
│  / Scripts) │                    │  :8000      │
└─────────────┘                    └──────┬──────┘
                                          │
                                   POST /hook/keyword-hit
                                          │
                                          ▼
┌─────────────┐                    ┌─────────────┐
│  PostgreSQL  │ ◀─── store ────── │  Node-RED   │
│  :5433      │                    │  :1880      │
└─────────────┘                    └──────┬──────┘
                                          │
                                   ┌──────┴──────┐
                                   │  Debug /    │
                                   │  Slack /    │
                                   │  Email /    │
                                   │  More...    │
                                   └─────────────┘`}</pre>
          </div>
          <p>
            <strong>Pattern:</strong> Node-RED owns the event flow.
            Python owns the brains. Your code posts events to the Agent API,
            which forwards to Node-RED. Node-RED routes, transforms, stores,
            and notifies.
          </p>
          <p>
            <strong>Deploy to EC2:</strong> Same docker-compose.yml works
            on any EC2 instance. Just <code>scp</code> the project folder
            and <code>docker compose up</code>.
          </p>
        </div>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel Component
// ---------------------------------------------------------------------------

export function NodeRedPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('editor');

  // Health checks for all 3 services
  const nodeRedHealth = useServiceHealthCheck('Node-RED', NODERED_URL);
  const agentHealth = useServiceHealthCheck('Agent API', AGENT_API_URL);
  // Use the service registry for PostgreSQL if available, fallback to direct
  const pgUrl = getServiceUrl('django_backend') || 'http://127.0.0.1:5433';
  const pgHealth = useServiceHealthCheck('PostgreSQL', pgUrl, 30_000);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'editor',
      label: 'Flow Editor',
      icon: <Workflow className="w-3.5 h-3.5" />,
    },
    {
      id: 'events',
      label: 'Event Log',
      icon: <Zap className="w-3.5 h-3.5" />,
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: <Copy className="w-3.5 h-3.5" />,
    },
    {
      id: 'debug',
      label: 'Live Debug',
      icon: <Send className="w-3.5 h-3.5" />,
    },
    {
      id: 'setup',
      label: 'Setup',
      icon: <Server className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0e0e1a] text-[#cccccc]">
      {/* Header: Service Health */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#16162a] border-b border-[#2a2a3a]">
        <div className="flex items-center gap-3">
          <StatusBadge health={nodeRedHealth} />
          <StatusBadge health={agentHealth} />
          <StatusBadge health={pgHealth} />
        </div>
        <button
          onClick={() => window.open(NODERED_URL, '_blank')}
          className="p-1 hover:bg-[#2a2a3a] rounded"
          title="Open Node-RED in browser"
        >
          <ExternalLink className="w-3 h-3 text-[#8888aa]" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[#2a2a3a]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#818cf8] text-[#cccccc] bg-[#1a1a2a]'
                : 'border-transparent text-[#6b6b75] hover:text-[#8888aa] hover:bg-[#1a1a2a]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'editor' && (
          <FlowEditorTab nodeRedHealth={nodeRedHealth} />
        )}
        {activeTab === 'events' && <EventLogTab agentHealth={agentHealth} />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'debug' && <LiveDebugTab />}
        {activeTab === 'setup' && <SetupTab />}
      </div>
    </div>
  );
}
