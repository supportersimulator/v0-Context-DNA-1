"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Brain, Trophy, Wrench, Flame, BarChart3, Repeat, ClipboardList, HeartPulse, Loader2, ExternalLink } from "lucide-react"
import { StatCard } from "@/components/dashboard/StatCard"
import { useErSimStatus } from "@/lib/hooks/use-er-sim-status"

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
    const [launchState, setLaunchState] = useState<"idle" | "launching" | "ok" | "error">("idle")
    const [launchMessage, setLaunchMessage] = useState<string>("")
    // Live cross-product status — replaces the stale "Launched (PID …)" message
    // once the dev server actually responds on localhost:8081.
    const { data: erSimStatus, refresh: refreshErSimStatus } = useErSimStatus(5000)
    const erSimRunning = !!erSimStatus?.reachable

    async function handleLaunchErSim() {
        setLaunchState("launching")
        setLaunchMessage("")
        try {
            const res = await fetch("/api/er-sim/launch", { method: "POST" })
            const data = await res.json()
            if (data.ok) {
                setLaunchState("ok")
                setLaunchMessage(`Launched (PID ${data.pid}) — ${data.url}`)
                // Kick the status hook so the pill updates as soon as Expo binds.
                refreshErSimStatus()
                // If running inside Electron, open the URL in the user's default browser.
                const electronShell = (typeof window !== "undefined"
                    ? (window as unknown as { electron?: { openExternal?: (u: string) => void } }).electron
                    : undefined)
                if (electronShell?.openExternal && typeof data.url === "string") {
                    electronShell.openExternal(data.url)
                } else if (typeof window !== "undefined" && typeof data.url === "string") {
                    window.open(data.url, "_blank", "noopener")
                }
            } else {
                setLaunchState("error")
                setLaunchMessage(data.error || "Launch failed")
            }
        } catch (e) {
            setLaunchState("error")
            setLaunchMessage(String(e))
        }
    }

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

            {/* Revenue Product Launcher — live cross-product status */}
            <motion.div variants={item}>
                <div className="p-6 rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-red-500/[0.02] backdrop-blur-sm flex items-center justify-between group hover:border-red-500/40 transition-all">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl border border-red-500/20 bg-red-500/10 flex items-center justify-center relative">
                            <HeartPulse className={erSimRunning ? "h-6 w-6 text-red-400 animate-pulse" : "h-6 w-6 text-red-400/60"} />
                            {/* Live status dot in the top-right of the icon */}
                            <span
                                className={
                                    "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0a0a0f] " +
                                    (erSimRunning ? "bg-emerald-500" : "bg-zinc-600")
                                }
                                aria-hidden
                            />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">
                                {erSimRunning ? "ER Simulator running" : "Launch ER Simulator"}
                            </h3>
                            <p className="text-muted-foreground text-sm">
                                {erSimRunning
                                    ? `${erSimStatus?.url ?? "http://localhost:8081"} · ${typeof erSimStatus?.latency_ms === "number" ? `${erSimStatus.latency_ms}ms` : "live"}`
                                    : `Revenue product${launchMessage ? ` — ${launchMessage}` : ""}`}
                            </p>
                        </div>
                    </div>
                    {erSimRunning ? (
                        <a
                            href={erSimStatus?.url ?? "http://localhost:8081"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-5 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all flex items-center gap-2"
                        >
                            <ExternalLink className="h-4 w-4" />
                            <span className="font-medium">Open</span>
                        </a>
                    ) : (
                        <button
                            onClick={handleLaunchErSim}
                            disabled={launchState === "launching"}
                            className="px-5 py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:border-red-500/50 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {launchState === "launching" ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="font-medium">Launching…</span>
                                </>
                            ) : (
                                <>
                                    <HeartPulse className="h-4 w-4" />
                                    <span className="font-medium">Launch</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            </motion.div>

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
