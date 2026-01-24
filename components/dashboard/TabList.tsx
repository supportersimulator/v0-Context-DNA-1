"use client"

import * as React from "react"
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { motion, AnimatePresence } from "framer-motion"
import { X, Plus, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Tab } from "@/lib/types"

interface TabListProps {
    tabs: Tab[]
    activeTabId: string
    onTabChange: (id: string) => void
    onTabsReorder: (tabs: Tab[]) => void
    onTabClose: (id: string) => void
    onTabAdd: () => void
}

function SortableTab({
    tab,
    isActive,
    onClick,
    onClose
}: {
    tab: Tab
    isActive: boolean
    onClick: () => void
    onClose: (e: React.MouseEvent) => void
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tab.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 1,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative flex items-center h-9 px-3 pr-2 min-w-[120px] max-w-[200px] select-none rounded-t-lg transition-colors border-r border-white/5 last:border-r-0",
                isActive
                    ? "bg-background text-foreground shadow-[0_-1px_0_0_rgba(255,255,255,0.05)_inset]"
                    : "bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
                "cursor-pointer"
            )}
            onClick={onClick}
            {...attributes}
            {...listeners}
        >
            {/* Icon */}
            <span className="mr-2 text-base">{tab.icon}</span>
            <span className="flex-1 text-sm font-medium truncate mr-1">
                {tab.label}
            </span>

            <button
                onClick={onClose}
                className={cn(
                    "opacity-0 group-hover:opacity-100 p-0.5 rounded-sm hover:bg-white/10 transition-all",
                    isActive && "opacity-100"
                )}
            >
                <X className="h-3 w-3" />
            </button>

            {isActive && (
                <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-primary shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                />
            )}
        </div>
    )
}

export function TabList({
    tabs,
    activeTabId,
    onTabChange,
    onTabsReorder,
    onTabClose,
    onTabAdd
}: TabListProps) {
    const [isMounted, setIsMounted] = React.useState(false)

    React.useEffect(() => {
        setIsMounted(true)
    }, [])

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    function handleDragEnd(event: any) {
        const { active, over } = event

        if (active.id !== over.id) {
            const oldIndex = tabs.findIndex((t) => t.id === active.id)
            const newIndex = tabs.findIndex((t) => t.id === over.id)
            onTabsReorder(arrayMove(tabs, oldIndex, newIndex))
        }
    }

    if (!isMounted) {
        return (
            <div className="flex items-center w-full h-10 border-b border-border bg-[#111118] backdrop-blur-xl gap-1 pl-2 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5 px-2">
                    <span className="text-lg mr-2">🧠</span>
                </div>
                <div className="flex items-end h-full">
                    {tabs.map((tab) => (
                        <div
                            key={tab.id}
                            className={cn(
                                "group relative flex items-center h-9 px-3 pr-2 min-w-[120px] max-w-[200px] select-none rounded-t-lg transition-colors border-r border-white/5 last:border-r-0",
                                tab.id === activeTabId
                                    ? "bg-background text-foreground shadow-[0_-1px_0_0_rgba(255,255,255,0.05)_inset]"
                                    : "bg-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
                                "cursor-pointer"
                            )}
                        >
                            <span className="mr-2 text-base">{tab.icon}</span>
                            <span className="flex-1 text-sm font-medium truncate mr-1">{tab.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center w-full h-10 border-b border-border bg-[#111118] backdrop-blur-xl gap-1 pl-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 px-2">
                <span className="text-lg mr-2">🧠</span>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={tabs.map(t => t.id)}
                    strategy={horizontalListSortingStrategy}
                >
                    <div className="flex items-end h-full">
                        {tabs.map((tab) => (
                            <SortableTab
                                key={tab.id}
                                tab={tab}
                                isActive={tab.id === activeTabId}
                                onClick={() => onTabChange(tab.id)}
                                onClose={(e) => {
                                    e.stopPropagation()
                                    onTabClose(tab.id)
                                }}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <button
                onClick={onTabAdd}
                className="ml-1 p-1.5 rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
                <Plus className="h-4 w-4" />
            </button>

            <div className="flex-1" /> {/* Spacer */}

            <div className="flex items-center px-4 gap-2 border-l border-white/5 h-full">
                <div className="w-3 h-3 rounded-full bg-red-500/20 hover:bg-red-500 border border-red-500/30 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/20 hover:bg-yellow-500 border border-yellow-500/30 transition-colors" />
                <div className="w-3 h-3 rounded-full bg-green-500/20 hover:bg-green-500 border border-green-500/30 transition-colors" />
            </div>
        </div>
    )
}
