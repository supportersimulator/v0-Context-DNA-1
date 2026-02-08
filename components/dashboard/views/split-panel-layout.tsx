'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { PanelLeft, PanelRight, Rows, Columns, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

type PanelFullscreenState = 'none' | 'left' | 'rightTop' | 'rightBottom';

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
    const [fullscreen, setFullscreen] = useState<PanelFullscreenState>('none');

    // Resizer state (pixels for absolute positioning)
    const [leftPanelWidth, setLeftPanelWidth] = useState(400);
    const [rightTopPanelHeight, setRightTopPanelHeight] = useState(280);
    const [isDraggingVertical, setIsDraggingVertical] = useState(false);
    const [isDraggingHorizontal, setIsDraggingHorizontal] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    // Vertical (left/right) resizer drag handler
    useEffect(() => {
        if (!isDraggingVertical) return;

        const handleVerticalDrag = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const newWidth = e.clientX - rect.left;
            const minWidth = 350;
            const maxWidth = rect.width - 400; // Reserve 400px for right panel

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                setLeftPanelWidth(newWidth);
            }
        };

        const handleVerticalDragEnd = () => {
            setIsDraggingVertical(false);
        };

        document.addEventListener('mousemove', handleVerticalDrag);
        document.addEventListener('mouseup', handleVerticalDragEnd);
        return () => {
            document.removeEventListener('mousemove', handleVerticalDrag);
            document.removeEventListener('mouseup', handleVerticalDragEnd);
        };
    }, [isDraggingVertical]);

    // Horizontal (top/bottom) resizer drag handler
    useEffect(() => {
        if (!isDraggingHorizontal) return;

        const handleHorizontalDrag = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rightPanel = containerRef.current.querySelector('[data-panel="right"]') as HTMLElement;
            if (!rightPanel) return;

            const rect = rightPanel.getBoundingClientRect();
            const newHeight = e.clientY - rect.top;
            const minHeight = 180;
            const maxHeight = rect.height - 180;

            if (newHeight >= minHeight && newHeight <= maxHeight) {
                setRightTopPanelHeight(newHeight);
            }
        };

        const handleHorizontalDragEnd = () => {
            setIsDraggingHorizontal(false);
        };

        document.addEventListener('mousemove', handleHorizontalDrag);
        document.addEventListener('mouseup', handleHorizontalDragEnd);
        return () => {
            document.removeEventListener('mousemove', handleHorizontalDrag);
            document.removeEventListener('mouseup', handleHorizontalDragEnd);
        };
    }, [isDraggingHorizontal]);

    if (fullscreen !== 'none') {
        // Fullscreen mode - show single panel at full size
        const fullscreenTitle =
            fullscreen === 'left' ? leftTitle :
            fullscreen === 'rightTop' ? topTitle : bottomTitle;

        const fullscreenContent =
            fullscreen === 'left' ? leftPanel :
            fullscreen === 'rightTop' ? topPanel : bottomPanel;

        return (
            <div className="flex flex-col h-full">
                {/* Fullscreen Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/95 backdrop-blur z-10 shrink-0">
                    <h2 className="font-medium text-foreground">{fullscreenTitle} (Fullscreen)</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFullscreen('none')}
                        className="h-8 w-8 p-0"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
                {/* Fullscreen Content */}
                <div className="flex-1 overflow-hidden">
                    {fullscreenContent}
                </div>
            </div>
        );
    }

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

    // Desktop Split Layout with Draggable Resizers
    return (
        <div ref={containerRef} className="flex h-full w-full overflow-hidden group">
            {/* Left Panel - Resizable Width */}
            <div
                style={{ width: `${leftPanelWidth}px` }}
                className={cn(
                    "relative flex flex-col border-r transition-colors",
                    isDraggingVertical
                        ? "border-primary/50 bg-secondary/30"
                        : "border-border/50"
                )}
            >
                {/* Panel Header with Fullscreen Button */}
                <div className="flex items-center justify-between px-4 py-2 mb-2 shrink-0">
                    <span className="text-xs text-muted-foreground font-medium uppercase">{leftTitle}</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFullscreen('left')}
                        className="h-6 w-6 p-0"
                        title="Fullscreen"
                    >
                        <PanelLeft className="w-3 h-3" />
                    </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                    {leftPanel}
                </div>
            </div>

            {/* Vertical Resizer - Draggable between left and right panels */}
            <div
                onMouseDown={() => setIsDraggingVertical(true)}
                className={cn(
                    "w-1 bg-border/50 hover:bg-primary/50 cursor-col-resize transition-colors select-none",
                    isDraggingVertical && "bg-primary w-1.5 shadow-lg"
                )}
                title="Drag to resize panels"
            />

            {/* Right Panel(s) - Fixed Width */}
            <div
                data-panel="right"
                className="flex-1 min-w-[400px] bg-background/50 relative flex flex-col"
            >
                {isThreePanelMode ? (
                    <>
                        {/* Top Right Panel - Resizable Height */}
                        <div
                            style={{ height: `${rightTopPanelHeight}px` }}
                            className={cn(
                                "relative overflow-hidden border-b flex flex-col transition-colors",
                                isDraggingHorizontal
                                    ? "border-primary/50 bg-secondary/30"
                                    : "border-border/50"
                            )}
                        >
                            {/* Panel Header with Fullscreen Button */}
                            <div className="flex items-center justify-between px-4 py-2 shrink-0">
                                <span className="text-xs text-muted-foreground font-medium uppercase">{topTitle}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFullscreen('rightTop')}
                                    className="h-6 w-6 p-0"
                                    title="Fullscreen"
                                >
                                    <PanelRight className="w-3 h-3" />
                                </Button>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                {topPanel}
                            </div>
                        </div>

                        {/* Horizontal Resizer - Draggable between top and bottom panels */}
                        <div
                            onMouseDown={() => setIsDraggingHorizontal(true)}
                            className={cn(
                                "h-1 bg-border/50 hover:bg-primary/50 cursor-row-resize transition-colors select-none",
                                isDraggingHorizontal && "bg-primary h-1.5 shadow-lg"
                            )}
                            title="Drag to resize panels"
                        />

                        {/* Bottom Right Panel - Flex to fill */}
                        <div className={cn(
                            "relative flex-1 overflow-hidden flex flex-col transition-colors",
                            isDraggingHorizontal
                                ? "border-primary/50 bg-secondary/30"
                                : "border-border/50"
                        )}>
                            {/* Panel Header with Fullscreen Button */}
                            <div className="flex items-center justify-between px-4 py-2 shrink-0">
                                <span className="text-xs text-muted-foreground font-medium uppercase">{bottomTitle}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFullscreen('rightBottom')}
                                    className="h-6 w-6 p-0"
                                    title="Fullscreen"
                                >
                                    <PanelRight className="w-3 h-3" />
                                </Button>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                {bottomPanel}
                            </div>
                        </div>
                    </>
                ) : (
                    // Single right panel (backward compatible)
                    <>
                        {/* Panel Header */}
                        <div className="flex items-center justify-between px-4 py-2 shrink-0">
                            <span className="text-xs text-muted-foreground font-medium uppercase">{topTitle}</span>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            {topPanel}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
