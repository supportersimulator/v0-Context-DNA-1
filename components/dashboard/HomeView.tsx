"use client"

import { motion } from "framer-motion"
import { Brain, Trophy, Wrench, Flame, BarChart3, Repeat, ClipboardList } from "lucide-react"
import { StatCard } from "@/components/dashboard/StatCard"

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
}

export function HomeView() {
    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="p-8 space-y-8 max-w-[1600px] mx-auto"
        >
            {/* Primary Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <motion.div variants={item}>
                    <StatCard
                        title="Total Learnings"
                        value="1,247"
                        icon={<Brain className="h-5 w-5" />}
                        glow
                    />
                </motion.div>
                <motion.div variants={item}>
                    <StatCard
                        title="Wins Captured"
                        value="523"
                        icon={<Trophy className="h-5 w-5" />}
                        className="border-green-500/10"
                    />
                </motion.div>
                <motion.div variants={item}>
                    <StatCard
                        title="Fixes Recorded"
                        value="312"
                        icon={<Wrench className="h-5 w-5" />}
                        className="border-orange-500/10"
                    />
                </motion.div>
                <motion.div variants={item}>
                    <StatCard
                        title="Current Streak"
                        value="47"
                        subtext="Personal record!"
                        icon={<Flame className="h-5 w-5 animate-pulse text-orange-500" />}
                        className="border-red-500/10"
                    />
                </motion.div>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div variants={item}>
                    <div className="p-6 rounded-xl border border-white/5 bg-card/30 backdrop-blur-sm flex items-center justify-between group hover:border-white/10 transition-all">
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Today's Activity</p>
                            <h3 className="text-2xl font-bold">12</h3>
                        </div>
                        <BarChart3 className="h-8 w-8 text-white/10 group-hover:text-primary/50 transition-colors" />
                    </div>
                </motion.div>
                <motion.div variants={item}>
                    <div className="p-6 rounded-xl border border-white/5 bg-card/30 backdrop-blur-sm flex items-center justify-between group hover:border-white/10 transition-all">
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Patterns Found</p>
                            <h3 className="text-2xl font-bold">189</h3>
                        </div>
                        <Repeat className="h-8 w-8 text-white/10 group-hover:text-blue-500/50 transition-colors" />
                    </div>
                </motion.div>
                <motion.div variants={item}>
                    <div className="p-6 rounded-xl border border-white/5 bg-card/30 backdrop-blur-sm flex items-center justify-between group hover:border-white/10 transition-all">
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Active SOPs</p>
                            <h3 className="text-2xl font-bold">45</h3>
                        </div>
                        <ClipboardList className="h-8 w-8 text-white/10 group-hover:text-purple-500/50 transition-colors" />
                    </div>
                </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div variants={item} className="flex gap-4">
                <button className="flex-1 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-green-500/30 transition-all flex items-center justify-center gap-2 group">
                    <Trophy className="h-5 w-5 text-green-500 group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Record Win</span>
                </button>
                <button className="flex-1 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-orange-500/30 transition-all flex items-center justify-center gap-2 group">
                    <Wrench className="h-5 w-5 text-orange-500 group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Record Fix</span>
                </button>
                <button className="flex-1 py-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-500/30 transition-all flex items-center justify-center gap-2 group">
                    <Repeat className="h-5 w-5 text-blue-500 group-hover:scale-110 transition-transform" />
                    <span className="font-medium">Record Pattern</span>
                </button>
            </motion.div>

            {/* Recent Activity Section could go here */}
        </motion.div>
    )
}
