'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { PanelLeft, PanelRight, Rows, Columns } from 'lucide-react';

interface SplitPanelLayoutProps {
    leftPanel: React.ReactNode;
    /** @deprecated Use rightTopPanel and rightBottomPanel for 3-panel layout */
    rightPanel?: React.ReactNode;
    /** Top panel in the right column (replaces rightPanel in 3-panel mode) */
    rightTopPanel?: React.ReactNode;
    /** Bottom panel in the right column (new in 3-panel mode) */
    rightBottomPanel?: React.ReactNode;
    leftTitle?: string;
    rightTitle?: string;
    /** Title for the top-right panel (used in mobile tabs for 3-panel mode) */
    rightTopTitle?: string;
    /** Title for the bottom-right panel (used in mobile tabs for 3-panel mode) */
    rightBottomTitle?: string;
}

export function SplitPanelLayout({
    leftPanel,
    rightPanel,
    rightTopPanel,
    rightBottomPanel,
    leftTitle = "Injections",
    rightTitle = "Learnings",
    rightTopTitle,
    rightBottomTitle,
}: SplitPanelLayoutProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [activeTab, setActiveTab] = useState<'left' | 'rightTop' | 'rightBottom'>('left');

    // Determine if we're in 3-panel mode
    const isThreePanelMode = rightTopPanel !== undefined && rightBottomPanel !== undefined;

    // For backward compatibility: if rightTopPanel/rightBottomPanel not provided, use rightPanel
    const topPanel = rightTopPanel ?? rightPanel;
    const bottomPanel = rightBottomPanel;

    // Resolve titles
    const topTitle = rightTopTitle ?? rightTitle;
    const bottomTitle = rightBottomTitle ?? "Architecture";

    // Basic responsive check
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (isMobile) {
        // Mobile: tabs for all panels
        const tabs = [
            { key: 'left' as const, title: leftTitle },
            { key: 'rightTop' as const, title: topTitle },
            ...(isThreePanelMode ? [{ key: 'rightBottom' as const, title: bottomTitle }] : []),
        ];

        return (
            <div className="flex flex-col h-full">
                {/* Mobile Tab Header */}
                <div className="flex border-b border-border bg-background/95 backdrop-blur z-10 shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
                                activeTab === tab.key
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.title}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative">
                    <div className={cn(
                        "absolute inset-0 transition-opacity duration-300",
                        activeTab === 'left' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                    )}>
                        {leftPanel}
                    </div>
                    <div className={cn(
                        "absolute inset-0 transition-opacity duration-300",
                        activeTab === 'rightTop' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                    )}>
                        {topPanel}
                    </div>
                    {isThreePanelMode && (
                        <div className={cn(
                            "absolute inset-0 transition-opacity duration-300",
                            activeTab === 'rightBottom' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                        )}>
                            {bottomPanel}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Desktop Split Layout
    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Left Panel (Flexible, min 400px) */}
            <div className="flex-1 min-w-[400px] border-r border-border/50 relative">
                {leftPanel}
            </div>

            {/* Right Panel(s) */}
            <div className="w-[400px] xl:w-[450px] shrink-0 bg-background/50 relative flex flex-col">
                {isThreePanelMode ? (
                    <>
                        {/* Top Right Panel (flex-1 to take available space) */}
                        <div className="flex-1 min-h-[200px] overflow-hidden border-b border-border/50">
                            {topPanel}
                        </div>

                        {/* Bottom Right Panel (fixed height with min/max) */}
                        <div className="h-[280px] min-h-[200px] max-h-[400px] overflow-hidden">
                            {bottomPanel}
                        </div>
                    </>
                ) : (
                    // Single right panel (backward compatible)
                    topPanel
                )}

                {/* Absolute border for resize handle visual */}
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-border/50 cursor-col-resize hover:bg-primary/50 transition-colors" />
            </div>
        </div>
    );
}
