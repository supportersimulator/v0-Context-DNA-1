'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Brain,
  Syringe,
  Home,
  Activity,
  GraduationCap,
  Search,
  HeartPulse,
  Cpu,
  Download,
  Zap,
  BookOpen,
  Network,
  Mic,
  MessageCircle,
  MoreVertical,
  Check,
  Square,
  X,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useResponsive } from '@/lib/contexts/responsive-context';
import { ElectronWindowControls } from '@/components/electron/electron-window-controls';
import { PANEL_METADATA, getPanelsForPage, type ParentPage } from './panel-factory';

// View components (direct imports — no dockview wrapper needed)
import { HomeView } from '@/components/dashboard/views/home-view';
import { ActivityView } from '@/components/dashboard/views/activity-view';
import { ProfessorView } from '@/components/dashboard/views/professor-view';
import { SearchView } from '@/components/dashboard/views/search-view';
import { HealthView } from '@/components/dashboard/views/health-view';
import { ModelsView } from '@/components/dashboard/views/models-view';
import { InstallWizardView } from '@/components/dashboard/views/install-wizard-view';
import { SynapticChatView } from '@/components/dashboard/views/synaptic-chat-view';
import { InjectionFocusView } from '@/components/dashboard/views/injection-focus-view';
import { LearningPanel } from '@/components/dashboard/views/learning-panel';
import { ArchitecturalAwarenessPanel } from '@/components/dashboard/views/architectural-awareness';
import { VoiceChatView } from '@/components/dashboard/views/voice-chat-view';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PageId = ParentPage;

// ---------------------------------------------------------------------------
// Panel icon map
// ---------------------------------------------------------------------------
const PANEL_ICONS: Record<string, React.FC<{ className?: string }>> = {
  home: Home,
  activity: Activity,
  professor: GraduationCap,
  search: Search,
  health: HeartPulse,
  models: Cpu,
  install: Download,
  synaptic: Brain,
  injection: Zap,
  learnings: BookOpen,
  architecture: Network,
  voicechat: Mic,
};

// ---------------------------------------------------------------------------
// Panel view map (renders actual view without dockview wrapper)
// ---------------------------------------------------------------------------
const PANEL_VIEWS: Record<string, React.FC> = {
  home: HomeView,
  activity: ActivityView,
  professor: ProfessorView,
  search: SearchView,
  health: HealthView,
  models: ModelsView,
  install: InstallWizardView,
  synaptic: SynapticChatView,
  injection: InjectionFocusView,
  learnings: () => <LearningPanel currentInjection={null} />,
  architecture: ArchitecturalAwarenessPanel,
  voicechat: VoiceChatView,
};

// ---------------------------------------------------------------------------
// Default active panel per page
// ---------------------------------------------------------------------------
function getDefaultPanel(page: PageId): string {
  switch (page) {
    case 'dashboard':
      return 'home';
    case 'synaptic':
      return 'synaptic';
    case 'live':
      return 'injection';
    default:
      return 'home';
  }
}

// ---------------------------------------------------------------------------
// Synaptic floating button + bottom sheet
// ---------------------------------------------------------------------------
function SynapticFloatingButton({
  visible,
  onOpen,
}: {
  visible: boolean;
  onOpen: () => void;
}) {
  if (!visible) return null;

  return (
    <button
      onClick={onOpen}
      className={cn(
        'fixed z-40 bottom-[72px] right-4',
        'w-12 h-12 rounded-full',
        'bg-[#22c55e] text-[#0a0a0f]',
        'flex items-center justify-center',
        'shadow-[0_0_16px_rgba(34,197,94,0.4)]',
        'active:scale-95 transition-transform',
      )}
      aria-label="Open Synaptic Chat"
    >
      <MessageCircle className="w-5 h-5" />
    </button>
  );
}

function SynapticBottomSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTranslate: number } | null>(null);
  const [translateY, setTranslateY] = useState(0);

  // Reset position when opened
  useEffect(() => {
    if (open) setTranslateY(0);
  }, [open]);

  // Swipe-down to dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragRef.current = { startY: touch.clientY, startTranslate: translateY };
  }, [translateY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    const delta = touch.clientY - dragRef.current.startY;
    // Only allow dragging down
    if (delta > 0) {
      setTranslateY(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current) return;
    // If dragged more than 120px down, dismiss
    if (translateY > 120) {
      onClose();
    }
    setTranslateY(0);
    dragRef.current = null;
  }, [translateY, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl overflow-hidden"
        style={{
          height: '80vh',
          transform: `translateY(${translateY}px)`,
          transition: translateY === 0 ? 'transform 0.3s ease-out' : 'none',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center h-8 bg-[#111118] border-b border-[#2a2a35] cursor-grab flex-shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-[#6b6b75]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#111118] border-b border-[#2a2a35] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#22c55e]" />
            <span className="text-sm font-semibold text-[#e5e5e5]">
              Synaptic
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md text-[#6b6b75] hover:text-[#e5e5e5] hover:bg-[#1a1a24] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat content */}
        <div className="flex-1 min-h-0 overflow-auto bg-[#0a0a0f]">
          <SynapticChatView />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel management menu (hamburger replacement for desktop PanelDropdown)
// ---------------------------------------------------------------------------
function MobilePanelMenu({
  activePage,
  activePanel,
  onSelectPanel,
}: {
  activePage: PageId;
  activePanel: string;
  onSelectPanel: (panelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const availablePanels = getPanelsForPage(activePage);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center h-8 w-8 rounded-md border border-[#2a2a35] bg-[#0a0a0f]/30 text-[#6b6b75] hover:text-[#e5e5e5] transition-colors"
        title="All panels"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[240px] rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-lg">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#2a2a35]/50">
            <span className="text-sm font-semibold text-[#e5e5e5]">
              Panels
            </span>
          </div>

          {/* Panel list */}
          <div className="py-1 max-h-[360px] overflow-y-auto">
            {availablePanels.map((panelId) => {
              const isActive = panelId === activePanel;
              const meta = PANEL_METADATA[panelId];
              const Icon = PANEL_ICONS[panelId];

              return (
                <button
                  key={panelId}
                  onClick={() => {
                    onSelectPanel(panelId);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-[#111118] transition-colors flex items-center gap-2.5 cursor-pointer"
                >
                  {/* Active indicator */}
                  <div className="flex-shrink-0">
                    {isActive ? (
                      <Check className="w-4 h-4 text-[#22c55e]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#6b6b75]" />
                    )}
                  </div>

                  {/* Icon */}
                  {Icon && (
                    <Icon
                      className={cn(
                        'w-4 h-4 flex-shrink-0',
                        isActive ? 'text-[#22c55e]' : 'text-[#6b6b75]',
                      )}
                    />
                  )}

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        'text-sm block',
                        isActive ? 'text-[#22c55e]' : 'text-[#e5e5e5]',
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-[#6b6b75] block mt-0.5 truncate">
                      {meta.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom tab bar
// ---------------------------------------------------------------------------
function MobileTabBar({
  activePage,
  activePanel,
  onSelectPanel,
}: {
  activePage: PageId;
  activePanel: string;
  onSelectPanel: (panelId: string) => void;
}) {
  const availablePanels = getPanelsForPage(activePage);
  // Show max 5 tabs in the bottom bar; rest accessible via panel menu
  const visibleTabs = availablePanels.slice(0, 5);

  return (
    <div className="flex items-center justify-around bg-[#111118] border-t border-[#2a2a35] flex-shrink-0 safe-area-bottom">
      {visibleTabs.map((panelId) => {
        const isActive = panelId === activePanel;
        const meta = PANEL_METADATA[panelId];
        const Icon = PANEL_ICONS[panelId];

        return (
          <button
            key={panelId}
            onClick={() => onSelectPanel(panelId)}
            className={cn(
              'flex flex-col items-center justify-center py-2 px-1 min-w-0 flex-1',
              'transition-colors',
              isActive
                ? 'text-[#22c55e]'
                : 'text-[#6b6b75] active:text-[#e5e5e5]',
            )}
          >
            {Icon && <Icon className="w-5 h-5" />}
            <span
              className={cn(
                'text-[10px] mt-0.5 truncate max-w-full',
                isActive ? 'font-semibold' : 'font-normal',
              )}
            >
              {meta.label}
            </span>
          </button>
        );
      })}

      {/* More tab if there are hidden panels */}
      {availablePanels.length > 5 && (
        <MoreTabButton
          activePage={activePage}
          activePanel={activePanel}
          hiddenPanels={availablePanels.slice(5)}
          onSelectPanel={onSelectPanel}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "More" button in tab bar (for overflow panels)
// ---------------------------------------------------------------------------
function MoreTabButton({
  activePage,
  activePanel,
  hiddenPanels,
  onSelectPanel,
}: {
  activePage: PageId;
  activePanel: string;
  hiddenPanels: string[];
  onSelectPanel: (panelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isActiveInHidden = hiddenPanels.includes(activePanel);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative flex flex-col items-center justify-center py-2 px-1 min-w-0 flex-1">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex flex-col items-center justify-center w-full',
          'transition-colors',
          isActiveInHidden
            ? 'text-[#22c55e]'
            : 'text-[#6b6b75] active:text-[#e5e5e5]',
        )}
      >
        <MoreVertical className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">More</span>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[200px] rounded-lg border border-[#2a2a35] bg-[#1a1a24] shadow-lg">
          <div className="py-1">
            {hiddenPanels.map((panelId) => {
              const isActive = panelId === activePanel;
              const meta = PANEL_METADATA[panelId];
              const Icon = PANEL_ICONS[panelId];

              return (
                <button
                  key={panelId}
                  onClick={() => {
                    onSelectPanel(panelId);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-[#111118] transition-colors flex items-center gap-2.5"
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'w-4 h-4 flex-shrink-0',
                        isActive ? 'text-[#22c55e]' : 'text-[#6b6b75]',
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'text-sm',
                      isActive ? 'text-[#22c55e]' : 'text-[#e5e5e5]',
                    )}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileLayout — main export
// ---------------------------------------------------------------------------
export function MobileLayout() {
  const [activePage, setActivePage] = useState<PageId>('synaptic');
  const [activePanel, setActivePanel] = useState<string>('synaptic');
  const [synapticSheetOpen, setSynapticSheetOpen] = useState(false);
  const { state } = useResponsive();

  // Very small screen detection (icons only for nav)
  const isVerySmall = state.width < 480;

  // Switch page and set default panel for that page
  const switchPage = useCallback(
    (newPage: PageId) => {
      if (newPage === activePage) return;
      setActivePage(newPage);
      setActivePanel(getDefaultPanel(newPage));
    },
    [activePage],
  );

  // Switch active panel within current page
  const switchPanel = useCallback((panelId: string) => {
    setActivePanel(panelId);
  }, []);

  // Show floating Synaptic button on Dashboard and Live pages
  // (not on Synaptic page since it's the main content there)
  const showSynapticFloat =
    activePage !== 'synaptic' && activePanel !== 'synaptic';

  // Render the active panel view
  const ActivePanelView = PANEL_VIEWS[activePanel];

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f]">
      {/* ------------------------------------------------------------------ */}
      {/* Top bar: Electron window controls (replaces workspace slots bar)   */}
      {/* ------------------------------------------------------------------ */}
      {state.isElectron && (
        <div className="flex items-center h-7 bg-[#0a0a0f] border-b border-[#2a2a35]/50 flex-shrink-0 select-none app-drag-region">
          <div className="w-[78px] flex-shrink-0" />
          <div className="flex-1" />
          <div className="no-drag">
            <ElectronWindowControls />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Navigation bar: Logo + 3 nav buttons + panel menu                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#111118] border-b border-[#2a2a35] w-full flex-shrink-0">
        {/* Logo — compact on very small */}
        <div className="flex items-center gap-1 mr-2 flex-shrink-0 select-none">
          <span className="text-lg">&#x1F9EC;</span>
          {!isVerySmall && (
            <span className="text-xs font-semibold text-[#e5e5e5]">
              DNA
            </span>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center flex-1 min-w-0">
          <div className="flex bg-[#0a0a0f]/30 rounded-lg p-0.5 gap-0.5">
            {/* Dashboard */}
            <button
              onClick={() => switchPage('dashboard')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                activePage === 'dashboard'
                  ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
                  : 'text-[#6b6b75] active:text-[#e5e5e5] active:bg-[#0a0a0f]/50',
              )}
            >
              <LayoutDashboard className="w-3.5 h-3.5 flex-shrink-0" />
              {!isVerySmall && <span>Dashboard</span>}
            </button>

            {/* Synaptic */}
            <button
              onClick={() => switchPage('synaptic')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                activePage === 'synaptic'
                  ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
                  : 'text-[#6b6b75] active:text-[#e5e5e5] active:bg-[#0a0a0f]/50',
              )}
            >
              <Brain className="w-3.5 h-3.5 flex-shrink-0" />
              {!isVerySmall && <span>Synaptic</span>}
            </button>

            {/* Live View */}
            <button
              onClick={() => switchPage('live')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                activePage === 'live'
                  ? 'bg-[#22c55e] text-[#0a0a0f] shadow-[0_0_10px_rgba(34,197,94,0.4)]'
                  : 'text-[#6b6b75] active:text-[#e5e5e5] active:bg-[#0a0a0f]/50',
              )}
            >
              <Syringe className="w-3.5 h-3.5 flex-shrink-0" />
              {!isVerySmall && <span>Live</span>}
            </button>
          </div>
        </div>

        {/* Panel menu (hamburger replacement) */}
        <MobilePanelMenu
          activePage={activePage}
          activePanel={activePanel}
          onSelectPanel={switchPanel}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Active panel — takes all remaining vertical space                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 min-h-0 overflow-auto bg-[#0a0a0f]">
        {ActivePanelView ? (
          <ActivePanelView />
        ) : (
          <div className="flex items-center justify-center h-full text-[#6b6b75] text-sm">
            Panel not found
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom tab bar                                                      */}
      {/* ------------------------------------------------------------------ */}
      <MobileTabBar
        activePage={activePage}
        activePanel={activePanel}
        onSelectPanel={switchPanel}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Floating Synaptic button                                            */}
      {/* ------------------------------------------------------------------ */}
      <SynapticFloatingButton
        visible={showSynapticFloat}
        onOpen={() => setSynapticSheetOpen(true)}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Synaptic bottom sheet overlay                                       */}
      {/* ------------------------------------------------------------------ */}
      <SynapticBottomSheet
        open={synapticSheetOpen}
        onClose={() => setSynapticSheetOpen(false)}
      />
    </div>
  );
}
