'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  Search,
  PanelLeft,
  Terminal,
  Heart,
  MessageSquare,
  Eye,
  LayoutDashboard,
  Brain,
  Radio,
  GraduationCap,
  Save,
  RotateCcw,
  Layers,
  Activity,
  Cpu,
  Wand2,
  Mic,
  Command,
  Network,
  ShieldCheck,
  FlaskConical,
  Code2,
  GitBranch,
  Diff,
  AlertCircle,
  FileSearch,
  BookOpen,
  Clock,
  Sparkles,
  Bug,
  Puzzle,
  Users,
  Map,
  ArrowLeftRight,
  Scale,
  Bot,
  Library,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Command {
  id: string;
  label: string;
  category: 'View' | 'Navigation' | 'Workspace' | 'System' | 'AI';
  shortcut?: string;
  icon?: ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_COMMANDS_KEY = 'contextdna_recent_commands';
const MAX_RECENT = 5;
const CATEGORY_ORDER: Command['category'][] = [
  'View',
  'Navigation',
  'Workspace',
  'System',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadRecentIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* corrupted -- ignore */
  }
  return [];
}

function saveRecentIds(ids: string[]) {
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
  } catch {
    /* storage full -- silent */
  }
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  return lower.includes(q);
}

function formatShortcut(shortcut: string): ReactNode {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const parts = shortcut.split('+').map((part) => {
    const p = part.trim();
    if (p === 'Cmd') return isMac ? '\u2318' : 'Ctrl';
    if (p === 'Shift') return isMac ? '\u21E7' : 'Shift';
    if (p === 'Alt') return isMac ? '\u2325' : 'Alt';
    return p;
  });

  return (
    <span className="flex items-center gap-0.5">
      {parts.map((p, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-[#111118] border border-[#2a2a35] text-[10px] font-mono text-[#6b6b75]"
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// useCommandPalette hook
// ---------------------------------------------------------------------------

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Global keyboard shortcut: Cmd+Shift+P / Ctrl+Shift+P
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [toggle]);

  return { isOpen, open, close, toggle };
}

// ---------------------------------------------------------------------------
// Default commands factory
// ---------------------------------------------------------------------------

export function createDefaultCommands(actions: {
  toggleExplorer?: () => void;
  toggleTerminal?: () => void;
  toggleHealth?: () => void;
  toggleSynapticChat?: () => void;
  toggleInjection?: () => void;
  toggleSearch?: () => void;
  goToDashboard?: () => void;
  goToSynaptic?: () => void;
  goToLiveView?: () => void;
  goToProfessor?: () => void;
  saveLayout?: () => void;
  resetLayout?: () => void;
  switchWorkspace?: (slot: number) => void;
  checkHealth?: () => void;
  viewModels?: () => void;
  openInstallWizard?: () => void;
  toggleVoiceChat?: () => void;
  toggleSwarm?: () => void;
  toggleHarmonizer?: () => void;
  toggleEvidence?: () => void;
  toggleEditor?: () => void;
  toggleGit?: () => void;
  toggleDiff?: () => void;
  toggleProblems?: () => void;
  toggleFindReplace?: () => void;
  toggleMemory?: () => void;
  toggleTimeline?: () => void;
  toggleInlineAssistant?: () => void;
  toggleDebug?: () => void;
  toggleExtensions?: () => void;
  toggleCollaboration?: () => void;
  toggleMinimap?: () => void;
  toggleContextBus?: () => void;
  toggleSync?: () => void;
  toggleInjectionViewer?: () => void;
  toggleEpistemic?: () => void;
  toggleLLMOrchestration?: () => void;
  toggleAgents?: () => void;
  toggleLibrarian?: () => void;
}): Command[] {
  const noop = () => {};
  return [
    // View
    {
      id: 'view:toggle-explorer',
      label: 'Toggle Explorer',
      category: 'View',
      shortcut: 'Cmd+B',
      icon: <PanelLeft className="w-4 h-4" />,
      action: actions.toggleExplorer ?? noop,
    },
    {
      id: 'view:toggle-terminal',
      label: 'Toggle Terminal',
      category: 'View',
      shortcut: 'Cmd+`',
      icon: <Terminal className="w-4 h-4" />,
      action: actions.toggleTerminal ?? noop,
    },
    {
      id: 'view:toggle-health',
      label: 'Toggle Health Panel',
      category: 'View',
      icon: <Heart className="w-4 h-4" />,
      action: actions.toggleHealth ?? noop,
    },
    {
      id: 'view:toggle-synaptic-chat',
      label: 'Toggle Synaptic Chat',
      category: 'View',
      icon: <MessageSquare className="w-4 h-4" />,
      action: actions.toggleSynapticChat ?? noop,
    },
    {
      id: 'view:toggle-injection',
      label: 'Toggle Injection View',
      category: 'View',
      shortcut: 'Cmd+1',
      icon: <Eye className="w-4 h-4" />,
      action: actions.toggleInjection ?? noop,
    },
    {
      id: 'view:toggle-search',
      label: 'Toggle Search Panel',
      category: 'View',
      icon: <Search className="w-4 h-4" />,
      action: actions.toggleSearch ?? noop,
    },
    {
      id: 'view:toggle-swarm',
      label: 'Toggle Swarm Panel',
      category: 'View',
      icon: <Network className="w-4 h-4" />,
      action: actions.toggleSwarm ?? noop,
    },
    {
      id: 'view:toggle-harmonizer',
      label: 'Toggle Harmonizer Panel',
      category: 'View',
      icon: <ShieldCheck className="w-4 h-4" />,
      action: actions.toggleHarmonizer ?? noop,
    },
    {
      id: 'view:toggle-evidence',
      label: 'Toggle Evidence Panel',
      category: 'View',
      icon: <FlaskConical className="w-4 h-4" />,
      action: actions.toggleEvidence ?? noop,
    },
    {
      id: 'view:toggle-editor',
      label: 'Toggle Code Editor',
      category: 'View',
      shortcut: 'Cmd+Shift+E',
      icon: <Code2 className="w-4 h-4" />,
      action: actions.toggleEditor ?? noop,
    },
    {
      id: 'view:toggle-git',
      label: 'Toggle Source Control',
      category: 'View',
      shortcut: 'Cmd+Shift+G',
      icon: <GitBranch className="w-4 h-4" />,
      action: actions.toggleGit ?? noop,
    },
    {
      id: 'view:toggle-diff',
      label: 'Toggle Diff Viewer',
      category: 'View',
      shortcut: 'Cmd+Shift+D',
      icon: <Diff className="w-4 h-4" />,
      action: actions.toggleDiff ?? noop,
    },
    {
      id: 'view:toggle-problems',
      label: 'Toggle Problems Panel',
      category: 'View',
      shortcut: 'Cmd+Shift+M',
      icon: <AlertCircle className="w-4 h-4" />,
      action: actions.toggleProblems ?? noop,
    },
    {
      id: 'view:toggle-find-replace',
      label: 'Find in Files',
      category: 'View',
      shortcut: 'Cmd+Shift+F',
      icon: <FileSearch className="w-4 h-4" />,
      action: actions.toggleFindReplace ?? noop,
    },
    {
      id: 'view:toggle-memory',
      label: 'Toggle Memory Explorer',
      category: 'View',
      shortcut: 'Cmd+Shift+L',
      icon: <BookOpen className="w-4 h-4" />,
      action: actions.toggleMemory ?? noop,
    },
    {
      id: 'view:toggle-timeline',
      label: 'Toggle Session Timeline',
      category: 'View',
      icon: <Clock className="w-4 h-4" />,
      action: actions.toggleTimeline ?? noop,
    },
    {
      id: 'view:toggle-debug',
      label: 'Toggle Debug Panel',
      category: 'View',
      icon: <Bug className="w-4 h-4" />,
      action: actions.toggleDebug ?? noop,
    },
    {
      id: 'view:toggle-extensions',
      label: 'Toggle Extensions',
      category: 'View',
      shortcut: 'Cmd+Shift+X',
      icon: <Puzzle className="w-4 h-4" />,
      action: actions.toggleExtensions ?? noop,
    },
    {
      id: 'view:toggle-collaboration',
      label: 'Toggle Collaboration',
      category: 'View',
      icon: <Users className="w-4 h-4" />,
      action: actions.toggleCollaboration ?? noop,
    },
    {
      id: 'view:toggle-minimap',
      label: 'Toggle Minimap',
      category: 'View',
      icon: <Map className="w-4 h-4" />,
      action: actions.toggleMinimap ?? noop,
    },
    {
      id: 'view:toggle-context-bus',
      label: 'Toggle ContextBus Panel',
      category: 'View',
      icon: <Radio className="w-4 h-4" />,
      action: actions.toggleContextBus ?? noop,
    },
    {
      id: 'view:toggle-sync',
      label: 'Toggle Bidirectional Sync',
      category: 'View',
      icon: <ArrowLeftRight className="w-4 h-4" />,
      action: actions.toggleSync ?? noop,
    },
    {
      id: 'view:toggle-injection-viewer',
      label: 'Toggle Injection Viewer (9-Section)',
      category: 'View',
      icon: <Eye className="w-4 h-4" />,
      action: actions.toggleInjectionViewer ?? noop,
    },
    {
      id: 'view:toggle-epistemic',
      label: 'Toggle Epistemic Sustainability',
      category: 'View',
      icon: <Scale className="w-4 h-4" />,
      action: actions.toggleEpistemic ?? noop,
    },
    {
      id: 'view:toggle-llm-orchestration',
      label: 'Toggle LLM Orchestration',
      category: 'View',
      icon: <Cpu className="w-4 h-4" />,
      action: actions.toggleLLMOrchestration ?? noop,
    },
    {
      id: 'view:toggle-agents',
      label: 'Toggle Agent Tasks',
      category: 'View',
      icon: <Bot className="w-4 h-4" />,
      action: actions.toggleAgents ?? noop,
    },
    {
      id: 'view:toggle-librarian',
      label: 'Toggle Repo Librarian',
      category: 'View',
      icon: <Library className="w-4 h-4" />,
      action: actions.toggleLibrarian ?? noop,
    },
    {
      id: 'ai:inline-assistant',
      label: 'Inline LLM Assistant',
      category: 'AI',
      shortcut: 'Cmd+I',
      icon: <Sparkles className="w-4 h-4" />,
      action: actions.toggleInlineAssistant ?? noop,
    },

    // Navigation
    {
      id: 'nav:dashboard',
      label: 'Go to Dashboard',
      category: 'Navigation',
      shortcut: 'Cmd+3',
      icon: <LayoutDashboard className="w-4 h-4" />,
      action: actions.goToDashboard ?? noop,
    },
    {
      id: 'nav:synaptic',
      label: 'Go to Synaptic',
      category: 'Navigation',
      shortcut: 'Cmd+2',
      icon: <Brain className="w-4 h-4" />,
      action: actions.goToSynaptic ?? noop,
    },
    {
      id: 'nav:live-view',
      label: 'Go to Live View',
      category: 'Navigation',
      shortcut: 'Cmd+1',
      icon: <Radio className="w-4 h-4" />,
      action: actions.goToLiveView ?? noop,
    },
    {
      id: 'nav:professor',
      label: 'Go to Professor',
      category: 'Navigation',
      shortcut: 'Cmd+4',
      icon: <GraduationCap className="w-4 h-4" />,
      action: actions.goToProfessor ?? noop,
    },

    // Workspace
    {
      id: 'workspace:save-layout',
      label: 'Save Workspace Layout',
      category: 'Workspace',
      icon: <Save className="w-4 h-4" />,
      action: actions.saveLayout ?? noop,
    },
    {
      id: 'workspace:reset-layout',
      label: 'Reset Layout to Default',
      category: 'Workspace',
      icon: <RotateCcw className="w-4 h-4" />,
      action: actions.resetLayout ?? noop,
    },
    {
      id: 'workspace:switch-1',
      label: 'Switch to Workspace 1',
      category: 'Workspace',
      icon: <Layers className="w-4 h-4" />,
      action: () => actions.switchWorkspace?.(1),
    },
    {
      id: 'workspace:switch-2',
      label: 'Switch to Workspace 2',
      category: 'Workspace',
      icon: <Layers className="w-4 h-4" />,
      action: () => actions.switchWorkspace?.(2),
    },
    {
      id: 'workspace:switch-3',
      label: 'Switch to Workspace 3',
      category: 'Workspace',
      icon: <Layers className="w-4 h-4" />,
      action: () => actions.switchWorkspace?.(3),
    },

    // System
    {
      id: 'system:check-health',
      label: 'Check System Health',
      category: 'System',
      icon: <Activity className="w-4 h-4" />,
      action: actions.checkHealth ?? noop,
    },
    {
      id: 'system:view-models',
      label: 'View Models',
      category: 'System',
      icon: <Cpu className="w-4 h-4" />,
      action: actions.viewModels ?? noop,
    },
    {
      id: 'system:install-wizard',
      label: 'Open Install Wizard',
      category: 'System',
      icon: <Wand2 className="w-4 h-4" />,
      action: actions.openInstallWizard ?? noop,
    },
    {
      id: 'system:toggle-voice',
      label: 'Toggle Voice Chat',
      category: 'System',
      icon: <Mic className="w-4 h-4" />,
      action: actions.toggleVoiceChat ?? noop,
    },
  ];
}

// ---------------------------------------------------------------------------
// CommandPalette component
// ---------------------------------------------------------------------------

export function CommandPalette({ commands, isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent commands on mount
  useEffect(() => {
    setRecentIds(loadRecentIds());
  }, []);

  // Reset state and focus input when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setRecentIds(loadRecentIds());
      // Small delay to let the DOM render before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Build filtered + grouped command list
  const { flatList, groups } = useMemo(() => {
    const hasQuery = query.trim().length > 0;

    // Filter commands by query
    const filtered = hasQuery
      ? commands.filter(
          (cmd) =>
            fuzzyMatch(cmd.label, query) || fuzzyMatch(cmd.category, query),
        )
      : commands;

    // When no query, show recent commands first
    const recentCommands: Command[] = [];
    if (!hasQuery && recentIds.length > 0) {
      for (const id of recentIds) {
        const cmd = commands.find((c) => c.id === id);
        if (cmd) recentCommands.push(cmd);
      }
    }

    // Group remaining by category in defined order
    const grouped: { category: string; items: Command[] }[] = [];
    const flat: Command[] = [];

    // Add recent group first if present
    if (recentCommands.length > 0) {
      grouped.push({ category: 'Recent', items: recentCommands });
      flat.push(...recentCommands);
    }

    // Add category groups
    for (const cat of CATEGORY_ORDER) {
      const items = filtered.filter(
        (cmd) =>
          cmd.category === cat &&
          // Don't duplicate commands already shown in recent
          !recentCommands.some((r) => r.id === cmd.id),
      );
      if (items.length > 0) {
        grouped.push({ category: cat, items });
        flat.push(...items);
      }
    }

    return { flatList: flat, groups: grouped };
  }, [commands, query, recentIds]);

  // Clamp selected index when list changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatList.length - 1)));
  }, [flatList.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Execute a command
  const executeCommand = useCallback(
    (cmd: Command) => {
      // Update recent commands
      const updated = [cmd.id, ...recentIds.filter((id) => id !== cmd.id)].slice(
        0,
        MAX_RECENT,
      );
      setRecentIds(updated);
      saveRecentIds(updated);

      onClose();

      // Execute after close animation
      requestAnimationFrame(() => {
        cmd.action();
      });
    },
    [recentIds, onClose],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < flatList.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatList.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (flatList[selectedIndex]) {
            executeCommand(flatList[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList, selectedIndex, executeCommand, onClose],
  );

  if (!isOpen) return null;

  // Track the flat index across groups for selection highlighting
  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="mx-auto mt-[15vh] max-w-[600px] rounded-xl border border-[#2a2a35] bg-[#111118] shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a35]">
          <Command className="w-4 h-4 text-[#6b6b75] flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-[#e5e5e5] placeholder-[#6b6b75] outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="text-[#6b6b75] hover:text-[#e5e5e5] transition-colors text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {groups.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[#6b6b75]">
              No matching commands
            </div>
          )}

          {groups.map((group) => (
            <div key={group.category}>
              {/* Category header */}
              <div className="px-4 pt-2 pb-1">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75]">
                  {group.category}
                </span>
              </div>

              {/* Commands in this category */}
              {group.items.map((cmd) => {
                const currentIndex = flatIndex;
                const isSelected = currentIndex === selectedIndex;
                flatIndex++;

                return (
                  <button
                    key={`${group.category}-${cmd.id}`}
                    data-selected={isSelected}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#22c55e]/10 text-[#22c55e]'
                        : 'text-[#e5e5e5] hover:bg-[#1a1a24]'
                    }`}
                  >
                    {/* Icon */}
                    <span
                      className={`flex-shrink-0 ${
                        isSelected ? 'text-[#22c55e]' : 'text-[#6b6b75]'
                      }`}
                    >
                      {cmd.icon ?? <Command className="w-4 h-4" />}
                    </span>

                    {/* Label */}
                    <span className="flex-1 text-sm truncate">{cmd.label}</span>

                    {/* Shortcut */}
                    {cmd.shortcut && (
                      <span className="flex-shrink-0 ml-auto">
                        {formatShortcut(cmd.shortcut)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[#2a2a35] text-[10px] text-[#6b6b75]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#1a1a24] border border-[#2a2a35] text-[9px] font-mono">
                &uarr;
              </kbd>
              <kbd className="inline-flex items-center justify-center w-4 h-4 rounded bg-[#1a1a24] border border-[#2a2a35] text-[9px] font-mono">
                &darr;
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center min-w-[28px] h-4 px-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[9px] font-mono">
                enter
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex items-center justify-center min-w-[20px] h-4 px-1 rounded bg-[#1a1a24] border border-[#2a2a35] text-[9px] font-mono">
                esc
              </kbd>
              close
            </span>
          </div>
          <span>{flatList.length} commands</span>
        </div>
      </div>
    </div>
  );
}
