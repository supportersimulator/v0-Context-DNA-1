"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface StatCardProps {
    title: string
    value: string | number
    icon?: React.ReactNode
    subtext?: string
    trend?: "up" | "down" | "neutral"
    className?: string
    accentColor?: string
    glow?: boolean
}

export function StatCard({
    title,
    value,
    icon,
    subtext,
    className,
    glow = false
}: StatCardProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.02, y: -2 }}
            className={cn(
                "relative overflow-hidden rounded-xl border border-white/5 bg-card/50 p-6 backdrop-blur-md transition-all",
                glow && "after:absolute after:inset-0 after:-z-10 after:bg-primary/5 after:blur-xl after:content-[''] border-primary/20",
                "hover:border-white/10 hover:bg-card/80",
                className
            )}
        >
            <div className="flex items-start justify-between">
                <div className="space-y-1">
                    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                        {title}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className={cn(
                            "text-3xl font-bold tracking-tight text-foreground",
                            glow && "text-primary drop-shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                        )}>
                            {value}
                        </h3>
                    </div>
                    {subtext && (
                        <p className="text-sm text-muted-foreground/80 mt-1">{subtext}</p>
                    )}
                </div>

                {icon && (
                    <div className={cn(
                        "rounded-lg p-2.5 bg-white/5 text-muted-foreground transition-colors",
                        glow ? "text-primary bg-primary/10" : "group-hover:text-foreground group-hover:bg-white/10"
                    )}>
                        {icon}
                    </div>
                )}
            </div>
        </motion.div>
    )
}
