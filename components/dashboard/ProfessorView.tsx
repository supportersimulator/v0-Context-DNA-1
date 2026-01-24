"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Send, Sparkles, Copy, Check, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProfessorView() {
    const [query, setQuery] = useState("")
    const [isConsulting, setIsConsulting] = useState(false)
    const [response, setResponse] = useState<any>(null)

    const handleConsult = () => {
        if (!query.trim()) return

        setIsConsulting(true)
        // Simulate API delay
        setTimeout(() => {
            setResponse({
                oneThing: "Focus on the Event Loop bottleneck in the websocket handler.",
                landmines: [
                    "Don't block the main thread with synchronous file I/O",
                    "Ensure redis connection pool is sized correctly for peak load"
                ],
                pattern: "Use the `aiohttp` library for async HTTP requests instead of `requests`.",
                context: "Based on your recent fixes in `backend/api/socket.py` and the learnings from the `Redis` outage last week."
            })
            setIsConsulting(false)
        }, 1500)
    }

    return (
        <div className="flex flex-col h-full max-w-[1200px] mx-auto p-6 md:p-8 gap-8">
            {/* Input Area */}
            <div className="flex flex-col gap-4">
                <div className="relative">
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="What are you working on? Ask the Professor..."
                        className="w-full h-32 bg-input/50 border border-input rounded-xl p-4 text-lg resize-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all placeholder:text-muted-foreground/50"
                    />
                    <button
                        onClick={handleConsult}
                        disabled={!query.trim() || isConsulting}
                        className={cn(
                            "absolute bottom-4 right-4 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all",
                            query.trim()
                                ? "bg-primary text-primary-foreground hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                    >
                        {isConsulting ? (
                            <Sparkles className="h-4 w-4 animate-spin" />
                        ) : (
                            <Sparkles className="h-4 w-4" />
                        )}
                        {isConsulting ? "Consulting..." : "Get Wisdom"}
                    </button>
                </div>

                <div className="flex flex-wrap gap-2">
                    {["Django", "React", "Docker", "AWS", "Postgres"].map((tag) => (
                        <button
                            key={tag}
                            onClick={() => setQuery(prev => prev + (prev ? " " : "") + tag)}
                            className="px-3 py-1 rounded-full text-xs font-medium bg-secondary hover:bg-secondary/80 border border-border transition-colors"
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>

            {/* Response Area */}
            {response && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex-1 overflow-y-auto space-y-6 pb-8"
                >
                    {/* One Thing */}
                    <div className="p-6 rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-sm">
                        <h3 className="text-primary font-bold tracking-wider text-sm uppercase mb-2 flex items-center gap-2">
                            <span className="p-1 rounded bg-primary/20"><Sparkles className="h-3 w-3" /></span>
                            The One Thing
                        </h3>
                        <p className="text-xl md:text-2xl font-medium text-foreground">
                            {response.oneThing}
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Landmines */}
                        <div className="p-6 rounded-xl border border-destructive/20 bg-destructive/5 backdrop-blur-sm">
                            <h3 className="text-destructive font-bold tracking-wider text-sm uppercase mb-4 flex items-center gap-2">
                                <span className="p-1 rounded bg-destructive/20">💣</span>
                                Landmines
                            </h3>
                            <ul className="space-y-3">
                                {response.landmines.map((mine: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-foreground/90">
                                        <ChevronRight className="h-5 w-5 text-destructive shrink-0" />
                                        {mine}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Pattern */}
                        <div className="p-6 rounded-xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
                            <h3 className="text-blue-500 font-bold tracking-wider text-sm uppercase mb-4 flex items-center gap-2">
                                <span className="p-1 rounded bg-blue-500/20">🔄</span>
                                The Pattern
                            </h3>
                            <div className="bg-black/40 rounded-lg p-4 font-mono text-sm text-blue-100 overflow-x-auto">
                                {response.pattern}
                            </div>
                        </div>
                    </div>

                    {/* Context Footer */}
                    <div className="p-4 rounded-lg border border-border bg-card/50 text-sm text-muted-foreground flex items-center gap-2">
                        <span className="font-semibold text-foreground">📍 Context:</span>
                        {response.context}
                    </div>
                </motion.div>
            )}
        </div>
    )
}
