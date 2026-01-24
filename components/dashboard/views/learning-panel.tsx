'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
    fetchRecentLearnings,
    fetchLearningsSince,
    fetchLearningsForInjection,
    subscribeToLearnings
} from '@/lib/api';
import type { Learning, InjectionData } from '@/lib/types';
import { LearningCard } from './learning-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils'; // Keep check on imports

interface LearningPanelProps {
    currentInjection: InjectionData | null;
}

export function LearningPanel({ currentInjection }: LearningPanelProps) {
    const [realtimeLearnings, setRealtimeLearnings] = useState<Learning[]>([]);
    const [associatedLearnings, setAssociatedLearnings] = useState<Learning[]>([]);
    const [isLoadingAssociated, setIsLoadingAssociated] = useState(false);

    // Initial fetch of recent learnings
    const { data: recentData, mutate, isLoading } = useSWR(
        'recent-learnings',
        () => fetchRecentLearnings(20),
        { refreshInterval: 0 } // Don't auto-poll, we use WS
    );

    // Fetch associated learnings when injection changes
    useEffect(() => {
        async function updateAssociated() {
            if (!currentInjection) {
                setAssociatedLearnings([]);
                return;
            }

            setIsLoadingAssociated(true);
            try {
                // Fetch learnings specifically for this injection ID
                const direct = await fetchLearningsForInjection(currentInjection.id);

                // Also fetch learnings that happened since the injection timestamp (heuristic)
                // This catches learnings that streamed in during processing
                const since = await fetchLearningsSince(currentInjection.timestamp, 10);

                // Merge and dedupe
                const combined = [...direct, ...since];
                const unique = Array.from(new Map(combined.map(l => [l.id, l])).values());

                setAssociatedLearnings(unique);
            } catch (e) {
                console.error("Failed to fetch associated learnings", e);
            } finally {
                setIsLoadingAssociated(false);
            }
        }

        updateAssociated();
    }, [currentInjection?.id, currentInjection?.timestamp]);

    // Subscribe to real-time updates
    useEffect(() => {
        const unsubscribe = subscribeToLearnings((newLearning) => {
            setRealtimeLearnings(prev => [newLearning, ...prev]);

            // If the new learning matches current injection, add to associated
            if (currentInjection && (
                newLearning.injection_id === currentInjection.id ||
                newLearning.session_id === currentInjection.trigger.session_id
            )) {
                setAssociatedLearnings(prev => {
                    if (prev.some(l => l.id === newLearning.id)) return prev;
                    return [newLearning, ...prev];
                });
            }
        });

        return () => unsubscribe();
    }, [currentInjection]);

    // Merge sources: Realtime -> Associated -> Recent
    // Priority: Realtime (newest) -> Associated (focused) -> Recent (history)
    const allLearnings = [
        ...realtimeLearnings,
        ...(recentData?.learnings || [])
    ];

    // Dedupe by ID
    const uniqueLearnings = Array.from(new Map(allLearnings.map(l => [l.id, l])).values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const associatedIds = new Set(associatedLearnings.map(l => l.id));

    return (
        <div className="flex flex-col h-full bg-background/50 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🧠</span>
                    <h3 className="font-semibold text-foreground">Context Learnings</h3>
                    <span className="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full">
                        {uniqueLearnings.length}
                    </span>
                </div>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                    {uniqueLearnings.length === 0 && !isLoading ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <p className="text-sm">No recent learnings captured.</p>
                            <p className="text-xs mt-1">Wins, fixes, and patterns will appear here.</p>
                        </div>
                    ) : (
                        uniqueLearnings.map(learning => (
                            <LearningCard
                                key={learning.id}
                                learning={learning}
                                isAssociated={associatedIds.has(learning.id)}
                            />
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
