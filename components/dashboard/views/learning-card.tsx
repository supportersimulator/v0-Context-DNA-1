'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Learning } from '@/lib/types';
import { LEARNING_TYPE_CONFIG } from '@/lib/types';

interface LearningCardProps {
    learning: Learning;
    isAssociated?: boolean; // Highlight if associated with current injection
}

// Parse timestamp - handles both with and without 'Z' suffix (treats both as UTC)
function parseTimestamp(timestamp: string): Date {
    // If no timezone info, assume UTC and add 'Z'
    if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
        return new Date(timestamp + 'Z');
    }
    return new Date(timestamp);
}

export function LearningCard({ learning, isAssociated }: LearningCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const config = LEARNING_TYPE_CONFIG[learning.type] || LEARNING_TYPE_CONFIG.insight;
    const timestamp = parseTimestamp(learning.timestamp);
    const timeAgo = getTimeAgo(timestamp);
    const timeFormatted = formatTime(timestamp);

    return (
        <motion.div
            layout
            className={cn(
                "border rounded-lg overflow-hidden transition-all duration-300",
                isAssociated
                    ? "border-primary/50 bg-primary/5 shadow-[0_0_10px_rgba(34,197,94,0.1)]"
                    : "border-border bg-card/50 hover:bg-card/80"
            )}
        >
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-3 cursor-pointer select-none"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="text-xl flex-shrink-0 mt-0.5" title={config.label}>
                            {config.emoji}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className={cn("text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5", config.color)}>
                                    {config.label}
                                </span>
                                <span className="text-[10px] text-yellow-400/80 font-mono whitespace-nowrap" title={timestamp.toLocaleString()}>
                                    {timeFormatted}
                                </span>
                                <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                                    ({timeAgo})
                                </span>
                                {isAssociated && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                                        CURRENT
                                    </span>
                                )}
                            </div>
                            <h4 className="text-sm font-medium text-foreground leading-snug break-words">
                                {learning.title}
                            </h4>
                        </div>
                    </div>

                    <button className="text-muted-foreground hover:text-foreground transition-colors mt-1">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                    {learning.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded-full">
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-3 pb-3 pt-0 text-sm text-muted-foreground border-t border-border/50 mt-1">
                            <div className="pt-3 whitespace-pre-wrap font-mono text-xs bg-black/20 p-2 rounded">
                                {learning.content}
                            </div>
                            {learning.metadata && (
                                <div className="mt-2 text-[10px] space-y-1 opacity-70">
                                    {Object.entries(learning.metadata).map(([k, v]) => (
                                        <div key={k} className="flex gap-1">
                                            <span className="font-semibold opacity-70">{k}:</span>
                                            <span className="font-mono">{String(v)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    });
}
