'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { PanelLeft, PanelRight, Rows, Columns } from 'lucide-react';

interface SplitPanelLayoutProps {
    leftPanel: React.ReactNode;
    rightPanel: React.ReactNode;
    leftTitle?: string;
    rightTitle?: string;
}

export function SplitPanelLayout({
    leftPanel,
    rightPanel,
    leftTitle = "Injections",
    rightTitle = "Learnings"
}: SplitPanelLayoutProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [activeTab, setActiveTab] = useState<'left' | 'right'>('left');

    // Basic responsive check (could use useMediaQuery hook for robustness)
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 1024);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    if (isMobile) {
        return (
            <div className="flex flex-col h-full">
                {/* Mobile Tab Header */}
                <div className="flex border-b border-border bg-background/95 backdrop-blur z-10 shrink-0">
                    <button
                        onClick={() => setActiveTab('left')}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'left'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {leftTitle}
                    </button>
                    <button
                        onClick={() => setActiveTab('right')}
                        className={cn(
                            "flex-1 py-3 text-sm font-medium border-b-2 transition-colors",
                            activeTab === 'right'
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {rightTitle}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative">
                    <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'left' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none')}>
                        {leftPanel}
                    </div>
                    <div className={cn("absolute inset-0 transition-opacity duration-300", activeTab === 'right' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none')}>
                        {rightPanel}
                    </div>
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

            {/* Right Panel (Fixed width for now, or flex) */}
            <div className="w-[400px] xl:w-[450px] shrink-0 bg-background/50 relative">
                {rightPanel}

                {/* Absolute border for resize handle visual (not functional yet) */}
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-border/50 cursor-col-resize hover:bg-primary/50 transition-colors" />
            </div>
        </div>
    );
}
