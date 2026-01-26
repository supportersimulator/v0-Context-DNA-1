'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    fetchRecentLearnings,
    fetchLearningsForInjection,
    subscribeToLearnings
} from '@/lib/api';
import type { Learning, InjectionData } from '@/lib/types';
import { LearningCard } from './learning-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Wifi, WifiOff } from 'lucide-react';

interface LearningPanelProps {
    currentInjection: InjectionData | null;
}

// Parse timestamp - handles both with and without 'Z' suffix (treats both as UTC)
function parseTimestamp(timestamp: string): Date {
    // If no timezone info, assume UTC and add 'Z'
    if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
        return new Date(timestamp + 'Z');
    }
    return new Date(timestamp);
}

// Check if a timestamp is from today (in user's local timezone)
function isToday(timestamp: string): boolean {
    const date = parseTimestamp(timestamp);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

// Format today's date nicely with timezone
function formatTodayDate(): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
    // Get timezone abbreviation (e.g., "MST", "EST", "PST")
    const timezone = now.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    return `${dateStr} (${timezone})`;
}

// Animation variants for staggered list - increased timing for dramatic effect
const listVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.3, // 300ms between each card for noticeable stagger
            delayChildren: 0.1,
        }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: -30, scale: 0.9 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
            type: "spring",
            stiffness: 200,
            damping: 20,
            duration: 0.5
        }
    },
    exit: {
        opacity: 0,
        scale: 0.9,
        transition: { duration: 0.2 }
    }
};

// Layout transition for smooth card repositioning
const layoutTransition = {
    type: "spring",
    stiffness: 300,
    damping: 30,
    duration: 0.4
};

export function LearningPanel({ currentInjection }: LearningPanelProps) {
    // Accumulate ALL learnings - never remove, only add
    const [allLearnings, setAllLearnings] = useState<Learning[]>([]);
    const [associatedLearnings, setAssociatedLearnings] = useState<Learning[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [wsConnected, setWsConnected] = useState(false);
    const seenIdsRef = useRef(new Set<string>());
    const initialLoadDone = useRef(false);

    // Add a single learning (for real-time updates) - checks for duplicates
    const addLearning = useCallback((newLearning: Learning) => {
        setAllLearnings(prev => {
            // Skip if already seen
            if (seenIdsRef.current.has(newLearning.id)) return prev;
            seenIdsRef.current.add(newLearning.id);
            // Add to front and sort
            const merged = [newLearning, ...prev];
            return merged.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
        });
    }, []);

    // Initial fetch - get recent learnings (larger batch)
    useEffect(() => {
        // Prevent double-load from React Strict Mode
        if (initialLoadDone.current) return;
        initialLoadDone.current = true;

        async function loadInitial() {
            setIsLoading(true);
            try {
                const data = await fetchRecentLearnings(100);
                if (data?.learnings && data.learnings.length > 0) {
                    // For initial load, set directly and populate seenIds
                    const sorted = [...data.learnings].sort((a, b) =>
                        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    );
                    sorted.forEach(l => seenIdsRef.current.add(l.id));
                    setAllLearnings(sorted);
                }
            } catch (e) {
                console.error("Failed to fetch initial learnings", e);
            } finally {
                setIsLoading(false);
            }
        }
        loadInitial();
    }, []); // Empty deps - runs once on mount

    // Fetch associated learnings when injection changes
    useEffect(() => {
        async function updateAssociated() {
            if (!currentInjection) {
                setAssociatedLearnings([]);
                return;
            }

            try {
                // Fetch learnings specifically for this injection ID
                const direct = await fetchLearningsForInjection(currentInjection.id);
                if (direct.length > 0) {
                    // Add each to main list
                    direct.forEach(l => addLearning(l));
                    setAssociatedLearnings(direct);
                }
            } catch (e) {
                console.error("Failed to fetch associated learnings", e);
            }
        }

        updateAssociated();
    }, [currentInjection?.id, addLearning]);

    // Subscribe to real-time updates - NEW learnings appear at top with animation
    useEffect(() => {
        const unsubscribe = subscribeToLearnings(
            (newLearning) => {
                // Add to accumulated list (will be sorted to top by timestamp)
                addLearning(newLearning);

                // If the new learning matches current injection, mark as associated
                if (currentInjection && (
                    newLearning.injection_id === currentInjection.id ||
                    newLearning.session_id === currentInjection.trigger.session_id
                )) {
                    setAssociatedLearnings(prev => {
                        if (prev.some(l => l.id === newLearning.id)) return prev;
                        return [newLearning, ...prev];
                    });
                }
            },
            // Track WebSocket connection status
            (status) => {
                setWsConnected(status === 'connected');
            }
        );

        return () => unsubscribe();
    }, [currentInjection, addLearning]);

    const associatedIds = new Set(associatedLearnings.map(l => l.id));

    // Filter to today's learnings only
    const todaysLearnings = allLearnings.filter(l => isToday(l.timestamp));

    return (
        <div className="flex flex-col h-full bg-background/50 backdrop-blur-sm">
            {/* Header */}
            <div className="flex flex-col px-4 py-3 border-b border-border/50 shrink-0 gap-1">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🧠</span>
                        <h3 className="font-semibold text-foreground">Today's Learnings</h3>
                        <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                            {todaysLearnings.length}
                        </span>
                        {/* Real-time status indicator */}
                        <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                wsConnected
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                            title={wsConnected ? 'Real-time updates connected' : 'Reconnecting...'}
                        >
                            {wsConnected ? (
                                <Wifi className="w-3 h-3" />
                            ) : (
                                <WifiOff className="w-3 h-3" />
                            )}
                            {wsConnected ? 'Live' : 'Offline'}
                        </div>
                    </div>
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-yellow-400/70">
                    <Calendar className="w-3 h-3" />
                    <span>{formatTodayDate()}</span>
                </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-4">
                    {todaysLearnings.length === 0 && !isLoading ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <p className="text-sm">No learnings captured today yet.</p>
                            <p className="text-xs mt-1">Wins, fixes, and patterns will appear here.</p>
                        </div>
                    ) : (
                        <motion.div
                            className="space-y-3"
                            variants={listVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <AnimatePresence mode="popLayout" initial={true}>
                                {todaysLearnings.map((learning, index) => (
                                    <motion.div
                                        key={learning.id}
                                        variants={itemVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        layout
                                        layoutId={learning.id}
                                        transition={layoutTransition}
                                        style={{ originY: 0 }}
                                    >
                                        <LearningCard
                                            learning={learning}
                                            isAssociated={associatedIds.has(learning.id)}
                                        />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
