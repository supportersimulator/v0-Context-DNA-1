'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { fetchInjectionHistory, subscribeToInjections } from '@/lib/api';
import type { InjectionData, RiskLevel, SilverPlatter } from '@/lib/types';
import { RISK_LEVEL_CONFIG } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, Zap, Target, Shield, Brain, AlertTriangle, FileText, Copy, Check, Volume2, VolumeX, CalendarIcon, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AnimatePresence, motion } from 'framer-motion';
import { soundManager } from '@/lib/sound-manager';
import { SplitPanelLayout } from './split-panel-layout';
import { LearningPanel } from './learning-panel';
import { ArchitecturalAwarenessPanel } from './architectural-awareness';
import { format, isSameDay, startOfDay } from 'date-fns';

interface InjectionFocusViewProps {
  onClose?: () => void;
}

export function InjectionFocusView({ onClose }: InjectionFocusViewProps) {
  const [expandedSops, setExpandedSops] = useState<Set<string>>(new Set());
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [muted, setMuted] = useState(soundManager.isMuted());

  // Injection history navigation
  const [injectionHistory, setInjectionHistory] = useState<InjectionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const seenIdsRef = useRef(new Set<string>());
  const initialLoadDone = useRef(false);

  // Filter history by selected date
  const filteredHistory = useMemo(() => {
    return injectionHistory.filter(inj => {
      const injDate = new Date(inj.timestamp);
      return isSameDay(injDate, selectedDate);
    });
  }, [injectionHistory, selectedDate]);

  // Fetch initial history on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadHistory() {
      setIsLoadingHistory(true);
      try {
        // History contains full injection data directly
        const injections = await fetchInjectionHistory(50);
        injections.forEach(inj => seenIdsRef.current.add(inj.id));
        setInjectionHistory(injections);
      } catch (e) {
        console.error("Failed to load injection history", e);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadHistory();
  }, []);

  // Current injection from filtered history
  const injection = filteredHistory[currentIndex] || null;

  // Reset currentIndex when date changes or filtered results change
  useEffect(() => {
    setCurrentIndex(0);
  }, [selectedDate]);

  // Navigation handlers (within filtered history)
  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => Math.min(prev + 1, filteredHistory.length - 1));
  }, [filteredHistory.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const goToLatest = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  // Handle date selection
  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (date) {
      setSelectedDate(startOfDay(date));
      setCalendarOpen(false);
    }
  }, []);

  // Handle mute toggle
  const toggleMute = () => {
    const newState = !muted;
    setMuted(newState);
    soundManager.setMuted(newState);
  };

  // Subscribe to real-time WebSocket updates
  useEffect(() => {
    const unsubscribe = subscribeToInjections({
      onInjection: (newInjection) => {
        // Add to history if not already seen
        if (!seenIdsRef.current.has(newInjection.id)) {
          seenIdsRef.current.add(newInjection.id);

          setInjectionHistory(prev => {
            // Add to front
            const updated = [newInjection, ...prev];
            return updated;
          });

          // If viewing latest (index 0), stay at latest
          // Otherwise, increment index to keep viewing same injection
          setCurrentIndex(prev => prev === 0 ? 0 : prev + 1);

          soundManager.playPing();
          setPulseAnimation(true);
          setTimeout(() => setPulseAnimation(false), 2000);
        }
      },
      onStatusChange: (status) => {
        setWsConnected(status === 'connected');
      }
    });

    return () => unsubscribe();
  }, []);

  const toggleSop = (sopId: string) => {
    setExpandedSops((prev) => {
      const next = new Set(prev);
      if (next.has(sopId)) {
        next.delete(sopId);
      } else {
        next.add(sopId);
      }
      return next;
    });
  };

  const copyRawOutput = async () => {
    if (injection?.raw_output) {
      await navigator.clipboard.writeText(injection.raw_output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Waiting state - when no injection data for selected date
  if (!injection) {
    const isToday = isSameDay(selectedDate, new Date());
    const hasHistoryButNotForDate = injectionHistory.length > 0 && filteredHistory.length === 0;

    const waitingPanel = (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 relative overflow-hidden bg-background">
        {/* Scanning Radar Effect */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="w-[600px] h-[600px] rounded-full border border-primary/30 relative"
          >
            <div className="absolute w-[300px] h-[300px] left-0 top-0 bg-gradient-to-br from-primary/20 to-transparent rounded-tl-full origin-bottom-right rotate-45 transform translate-x-[300px] translate-y-[300px]" />
          </motion.div>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute w-[400px] h-[400px] rounded-full border border-primary/10"
          />
        </div>

        <div className="bg-background/80 backdrop-blur-sm p-8 rounded-2xl border border-white/5 relative z-10">
          {/* Date Picker in waiting state */}
          <div className="mb-6">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 gap-2 font-normal"
                >
                  <CalendarIcon className="w-4 h-4" />
                  {format(selectedDate, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date > new Date()}
                  endMonth={new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="text-6xl mb-4 animate-pulse">💉</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {isLoadingHistory
              ? "Loading History..."
              : hasHistoryButNotForDate
                ? `No Injections on ${format(selectedDate, 'MMM d')}`
                : isToday
                  ? "Waiting for Injection..."
                  : `No Injections on ${format(selectedDate, 'MMM d')}`}
          </h2>
          <p className="text-muted-foreground max-w-md">
            {isLoadingHistory
              ? "Fetching your injection history..."
              : hasHistoryButNotForDate
                ? "Select a different date or wait for new injections today."
                : isToday
                  ? "When you send a prompt to your IDE with Context DNA active, the injection will appear here in real-time."
                  : "No injections were recorded on this date."}
          </p>
        </div>
      </div>
    );

    return (
      <SplitPanelLayout
        leftPanel={waitingPanel}
        rightTopPanel={<LearningPanel currentInjection={null} />}
        rightBottomPanel={<ArchitecturalAwarenessPanel />}
        rightTopTitle="Today's Learnings"
        rightBottomTitle="Architecture"
      />
    );
  }

  // Extract data with safe defaults
  const analysis = injection.analysis || {
    detected_domains: [],
    risk_level: 'low' as RiskLevel,
    first_try_likelihood: 0,
    generation_time_ms: 0,
    sections_included: [],
    ab_variant: 'unknown',
    mode: 'unknown',
  };
  const trigger = injection.trigger || { hook: 'unknown', prompt: '', session_id: '' };
  const silver_platter: SilverPlatter = injection.silver_platter || {
    safety: { found: false, content: [] },
    wisdom: { the_one_thing: '', landmines: [], patterns: [], context: '' },
    sops: [],
    protocol: { risk_level: 'low', first_try_percent: 0, recommendation: '' },
  };

  const riskConfig = RISK_LEVEL_CONFIG[analysis.risk_level as RiskLevel] || RISK_LEVEL_CONFIG.low;
  const timeAgo = getTimeAgo(new Date(injection.timestamp));

  // Full injection display panel
  const injectionPanel = (
    <ScrollArea className="h-full bg-background">
      <div className={cn(
        "space-y-6 p-6 transition-all duration-500 relative",
        pulseAnimation && "ring-2 ring-primary/50 bg-primary/5 rounded-lg"
      )}>
        {/* Scan line effect on update */}
        <AnimatePresence>
          {pulseAnimation && (
            <motion.div
              initial={{ top: 0, opacity: 0.8 }}
              animate={{ top: "100%", opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "linear" }}
              className="absolute left-0 right-0 h-1 bg-primary/50 shadow-[0_0_20px_rgba(34,197,94,0.5)] z-50 pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevious}
              disabled={currentIndex >= filteredHistory.length - 1}
              className="h-8 px-2"
              title="Previous injection"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNext}
              disabled={currentIndex <= 0}
              className="h-8 px-2"
              title="Next injection (more recent)"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>

            {/* Date Picker */}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 gap-2 font-normal"
                >
                  <CalendarIcon className="w-4 h-4" />
                  {format(selectedDate, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => date > new Date()}
                  endMonth={new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* Real-time status indicator */}
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                wsConnected
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              )}
              title={wsConnected ? 'Real-time updates connected' : 'Reconnecting...'}
            >
              {wsConnected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
              {wsConnected ? 'Live' : 'Offline'}
            </div>
            <span className="font-mono">
              {filteredHistory.length > 0 ? (
                <>
                  {currentIndex + 1} / {filteredHistory.length}
                </>
              ) : (
                <span className="text-muted-foreground/60">0 injections</span>
              )}
            </span>
            {currentIndex > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goToLatest}
                className="h-6 px-2 text-xs text-primary hover:text-primary"
              >
                ← Latest
              </Button>
            )}
          </div>
        </div>

        {/* Header with Risk Badge and Controls */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={cn(
                "px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider",
                riskConfig.bgColor,
                riskConfig.color
              )}>
                {riskConfig.label} RISK
              </span>
              <span className="text-muted-foreground text-sm flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {timeAgo}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">Context DNA Injection</h1>
          </div>
          <div className="flex items-start gap-6">
            <div className="flex flex-col items-end">
              <Button variant="ghost" size="icon" onClick={toggleMute} className="text-muted-foreground hover:text-foreground">
                {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5 text-primary" />}
              </Button>
            </div>
            <div className="text-right space-y-1">
              <div className="text-3xl font-bold text-primary">
                {typeof analysis.first_try_likelihood === 'number'
                  ? `${analysis.first_try_likelihood}%`
                  : analysis.first_try_likelihood}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">First-Try Likelihood</div>
            </div>
          </div>
        </div>

        {/* Trigger Info */}
        <div className="glass rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="w-4 h-4" />
            <span className="font-medium">TRIGGER</span>
            <span className="px-2 py-0.5 bg-primary/10 rounded text-primary text-xs">
              {trigger.hook}
            </span>
          </div>
          <p className="text-foreground text-lg leading-relaxed">
            "{trigger.prompt}"
          </p>
          {trigger.session_id && (
            <div className="text-xs text-muted-foreground">
              Session: {trigger.session_id}
            </div>
          )}
        </div>

        {/* Analysis Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={<Zap className="w-4 h-4" />}
            label="Generation Time"
            value={`${analysis.generation_time_ms}ms`}
          />
          <MetricCard
            icon={<Target className="w-4 h-4" />}
            label="Mode"
            value={analysis.mode}
          />
          <MetricCard
            icon={<FileText className="w-4 h-4" />}
            label="Sections"
            value={analysis.sections_included.length.toString()}
          />
          <MetricCard
            icon={<Brain className="w-4 h-4" />}
            label="Variant"
            value={analysis.ab_variant}
          />
        </div>

        {/* Detected Domains */}
        <div className="flex flex-wrap gap-2">
          {analysis.detected_domains.map((domain) => (
            <span
              key={domain}
              className="px-3 py-1 bg-secondary rounded-full text-sm text-foreground"
            >
              {domain}
            </span>
          ))}
        </div>

        {/* Silver Platter Sections */}
        <div className="space-y-4">
          {/* Safety Rails */}
          {silver_platter.safety.found && silver_platter.safety.content.length > 0 && (
            <SectionCard
              icon={<Shield className="w-5 h-5 text-red-400" />}
              title="Safety Rails"
              titleColor="text-red-400"
            >
              <ul className="space-y-2">
                {silver_platter.safety.content.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-red-300">
                    <span className="text-red-400 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* The One Thing */}
          {silver_platter.wisdom.the_one_thing && (
            <SectionCard
              icon={<span className="text-xl">🎯</span>}
              title="THE ONE THING"
              titleColor="text-cyan-400"
              highlight
            >
              <p className="text-lg text-foreground font-medium">
                {silver_platter.wisdom.the_one_thing}
              </p>
            </SectionCard>
          )}

          {/* Landmines */}
          {silver_platter.wisdom.landmines.length > 0 && (
            <SectionCard
              icon={<AlertTriangle className="w-5 h-5 text-orange-400" />}
              title="Landmines"
              titleColor="text-orange-400"
            >
              <ul className="space-y-2">
                {silver_platter.wisdom.landmines.map((landmine, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span>{landmine.icon}</span>
                    <span className="text-foreground">{landmine.text}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* Patterns */}
          {silver_platter.wisdom.patterns.length > 0 && (
            <SectionCard
              icon={<span className="text-xl">🔄</span>}
              title="Patterns"
              titleColor="text-purple-400"
            >
              <ul className="space-y-2">
                {silver_platter.wisdom.patterns.map((pattern, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    <div>
                      <span className="text-foreground">{pattern.text}</span>
                      {pattern.file && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({pattern.file}{pattern.lines ? `:${pattern.lines}` : ''})
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* Context */}
          {silver_platter.wisdom.context && (
            <SectionCard
              icon={<Brain className="w-5 h-5 text-blue-400" />}
              title="Context"
              titleColor="text-blue-400"
            >
              <p className="text-foreground">{silver_platter.wisdom.context}</p>
            </SectionCard>
          )}

          {/* SOPs (Expandable) */}
          {silver_platter.sops.length > 0 && (
            <SectionCard
              icon={<span className="text-xl">📋</span>}
              title="Standard Operating Procedures"
              titleColor="text-green-400"
            >
              <div className="space-y-3">
                {silver_platter.sops.map((sop) => (
                  <div
                    key={sop.id}
                    className="border border-border rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleSop(sop.id)}
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-left">
                          <div className="font-medium text-foreground">{sop.title}</div>
                          <div className="text-sm text-muted-foreground">{sop.summary}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">
                          {Math.round(sop.relevance_score * 100)}% match
                        </span>
                        {expandedSops.has(sop.id) ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {expandedSops.has(sop.id) && sop.full_content && (
                      <div className="px-3 pb-3 border-t border-border">
                        <pre className="mt-3 p-3 bg-secondary/50 rounded text-sm text-foreground whitespace-pre-wrap font-mono">
                          {sop.full_content}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Protocol */}
          <SectionCard
            icon={<span className="text-xl">📊</span>}
            title="Protocol"
            titleColor="text-yellow-400"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className={cn("font-bold", riskConfig.color)}>
                  {silver_platter.protocol.risk_level.toUpperCase()}
                </span>
                <span className="text-muted-foreground mx-2">|</span>
                <span className="text-foreground">
                  {silver_platter.protocol.first_try_percent}% First-Try
                </span>
              </div>
              <span className="text-muted-foreground text-sm">
                {silver_platter.protocol.recommendation}
              </span>
            </div>
          </SectionCard>
        </div>

        {/* Raw Output (Collapsible) */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div
            onClick={() => setShowRawOutput(!showRawOutput)}
            className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors cursor-pointer select-none"
          >
            <span className="text-sm font-medium text-muted-foreground">Raw Output</span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  copyRawOutput();
                }}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
              {showRawOutput ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>
          {showRawOutput && (
            <div className="p-3 border-t border-border">
              <pre className="p-3 bg-secondary/50 rounded text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto">
                {injection.raw_output}
              </pre>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );

  return (
    <SplitPanelLayout
      leftPanel={injectionPanel}
      rightTopPanel={<LearningPanel currentInjection={injection} />}
      rightBottomPanel={<ArchitecturalAwarenessPanel />}
      rightTopTitle="Today's Learnings"
      rightBottomTitle="Architecture"
    />
  );
}

// Helper components
function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-lg p-3 flex items-center gap-3">
      <div className="text-primary">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  titleColor,
  highlight,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  titleColor: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "glass rounded-lg p-4 space-y-3",
      highlight && "ring-1 ring-cyan-500/30 bg-cyan-500/5"
    )}>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className={cn("font-semibold uppercase tracking-wider text-sm", titleColor)}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
