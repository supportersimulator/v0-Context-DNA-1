'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Users,
  Circle,
  Send,
  Eye,
  Edit3,
  Clock,
  Wifi,
  WifiOff,
  MousePointer2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  status: 'active' | 'idle' | 'away';
  currentFile?: string;
  currentLine?: number;
  role: 'owner' | 'editor' | 'viewer';
  lastActive: number; // epoch ms
}

interface ChatMessage {
  id: string;
  author: string;
  authorColor: string;
  text: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
function getMockCollaborators(): Collaborator[] {
  return [
    { id: 'u-aaron', name: 'Aaron', color: '#22c55e', status: 'active', currentFile: 'context-dna/injection/builder.py', currentLine: 142, role: 'owner', lastActive: Date.now() },
    { id: 'u-atlas', name: 'Atlas (Claude)', color: '#3b82f6', status: 'active', currentFile: 'admin.contextdna.io/components/ide/dockview-shell.tsx', currentLine: 82, role: 'editor', lastActive: Date.now() },
    { id: 'u-synaptic', name: 'Synaptic (Qwen3)', color: '#c678dd', status: 'idle', currentFile: 'memory/brain_state.md', role: 'viewer', lastActive: Date.now() - 120_000 },
  ];
}

function getMockMessages(): ChatMessage[] {
  return [
    { id: 'm-1', author: 'Aaron', authorColor: '#22c55e', text: 'Working on Phase 10D — debug panel', timestamp: Date.now() - 300_000 },
    { id: 'm-2', author: 'Atlas', authorColor: '#3b82f6', text: 'Building all 4 panels in parallel. Will wire into infrastructure after.', timestamp: Date.now() - 240_000 },
    { id: 'm-3', author: 'Synaptic', authorColor: '#c678dd', text: 'Pattern detected: similar panel structure to problems-panel.tsx. Recommend following that template.', timestamp: Date.now() - 180_000 },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function statusDot(status: Collaborator['status']) {
  const colors = { active: 'bg-[#22c55e]', idle: 'bg-[#e5c07b]', away: 'bg-[#6b6b75]' };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} flex-shrink-0`} />;
}

function roleLabel(role: Collaborator['role']) {
  const styles = {
    owner: 'bg-[#22c55e]/15 text-[#22c55e]',
    editor: 'bg-[#3b82f6]/15 text-[#3b82f6]',
    viewer: 'bg-[#6b6b75]/15 text-[#6b6b75]',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${styles[role]}`}>
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left px-3 py-1 hover:bg-[#1a1a24] text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75] border-b border-[#2a2a35]/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="flex-1">{title}</span>
        {count !== undefined && (
          <span className="bg-[#1a1a24] px-1.5 rounded-full text-[9px]">{count}</span>
        )}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollaborationPanel — main export
// ---------------------------------------------------------------------------
export function CollaborationPanel() {
  const [collaborators, setCollaborators] = useState<Collaborator[]>(getMockCollaborators);
  const [messages, setMessages] = useState<ChatMessage[]>(getMockMessages);
  const [draft, setDraft] = useState('');
  const [connected, setConnected] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch collaborator state (future: WebSocket)
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch(getServiceUrl('helper_agent') + '/api/collaboration/state', {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.collaborators) setCollaborators(data.collaborators);
          if (data.messages) setMessages(data.messages);
          setConnected(true);
        }
      } catch {
        // Keep mock data, mark offline
      }
    };
    fetchState();
    const interval = setInterval(fetchState, 15_000);
    return () => clearInterval(interval);
  }, []);

  const sendMessage = useCallback(() => {
    if (!draft.trim()) return;
    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      author: 'Atlas',
      authorColor: '#3b82f6',
      text: draft.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setDraft('');
  }, [draft]);

  const activeCount = collaborators.filter((c) => c.status === 'active').length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Users className="w-3.5 h-3.5 text-[#3b82f6]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Collaboration</span>
        <span className="text-[10px] text-[#6b6b75] ml-auto flex items-center gap-1">
          {connected ? (
            <><Wifi className="w-3 h-3 text-[#22c55e]" /> Connected</>
          ) : (
            <><WifiOff className="w-3 h-3 text-[#ef4444]" /> Offline</>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Active collaborators */}
        <Section title="Participants" count={collaborators.length}>
          {collaborators.map((collab) => (
            <div key={collab.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#1a1a24]/50">
              {/* Avatar placeholder with color */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black flex-shrink-0"
                style={{ backgroundColor: collab.color }}
              >
                {collab.name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {statusDot(collab.status)}
                  <span className="text-xs text-[#e5e5e5] truncate">{collab.name}</span>
                  {roleLabel(collab.role)}
                </div>
                {collab.currentFile && (
                  <div className="flex items-center gap-1 text-[9px] text-[#6b6b75] mt-0.5 pl-3.5">
                    <MousePointer2 className="w-2.5 h-2.5" style={{ color: collab.color }} />
                    <span className="truncate">{collab.currentFile}</span>
                    {collab.currentLine && <span>:{collab.currentLine}</span>}
                  </div>
                )}
              </div>

              <span className="text-[9px] text-[#6b6b75] flex-shrink-0">
                {timeAgo(collab.lastActive)}
              </span>
            </div>
          ))}
        </Section>

        {/* Chat */}
        <Section title="Team Chat" count={messages.length}>
          <div className="px-3 py-1 space-y-2 max-h-[300px] overflow-y-auto">
            {messages.map((msg) => (
              <div key={msg.id} className="text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium" style={{ color: msg.authorColor }}>{msg.author}</span>
                  <span className="text-[9px] text-[#6b6b75]">{timeAgo(msg.timestamp)}</span>
                </div>
                <div className="text-[#e5e5e5] mt-0.5 pl-0">{msg.text}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </Section>
      </div>

      {/* Chat input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[#2a2a35] flex-shrink-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Send a message..."
          className="flex-1 px-2 py-1 text-xs bg-[#1a1a24] border border-[#2a2a35] rounded text-[#e5e5e5] placeholder-[#6b6b75] focus:outline-none focus:border-[#3b82f6]/50"
          spellCheck={false}
        />
        <button
          onClick={sendMessage}
          disabled={!draft.trim()}
          className="p-1.5 rounded bg-[#3b82f6] text-white hover:bg-[#3b82f6]/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
