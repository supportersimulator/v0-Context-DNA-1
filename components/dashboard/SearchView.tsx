"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Search, ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function SearchView() {
    const [query, setQuery] = useState("")
    const [isSearching, setIsSearching] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return

        setIsSearching(true)
        setTimeout(() => {
            setIsSearching(false)
            setHasSearched(true)
        }, 1200)
    }

    return (
        <div className="flex flex-col h-full items-center justify-start pt-20 px-6 gap-8">
            {/* Search Bar */}
            <motion.div
                layout
                className={cn(
                    "w-full max-w-2xl transition-all duration-500",
                    hasSearched ? "pt-0" : "pt-20"
                )}
            >
                <div className="text-center mb-8 space-y-2">
                    {!hasSearched && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Context DNA</h1>
                            <p className="text-muted-foreground text-lg">Search your second brain semantically.</p>
                        </motion.div>
                    )}
                </div>

                <form onSubmit={handleSearch} className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-2xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
                    <div className="relative flex items-center bg-card border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-primary/50 transition-colors">
                        <Search className="h-6 w-6 ml-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="How do I fix the async boto3 issue?"
                            className="flex-1 bg-transparent border-none text-lg px-4 py-3 focus:ring-0 placeholder:text-muted-foreground/40"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!query.trim() || isSearching}
                            className="p-3 bg-primary/10 hover:bg-primary/20 rounded-xl text-primary transition-colors disabled:opacity-50"
                        >
                            {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                        </button>
                    </div>
                </form>

                {!hasSearched && (
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        <span className="text-xs text-muted-foreground w-full text-center mb-1">Try searching for:</span>
                        {["Docker networking", "Django async views", "React suspense", "AWS Spot Instances"].map(s => (
                            <button
                                key={s}
                                onClick={() => setQuery(s)}
                                className="text-xs px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}
            </motion.div>

            {/* Results Placeholder */}
            {hasSearched && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full max-w-3xl space-y-4"
                >
                    <div className="flex items-center justify-between text-sm text-muted-foreground px-2">
                        <span>Found 12 relevant learnings</span>
                        <span>0.4s</span>
                    </div>

                    {[1, 2, 3].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="p-6 rounded-xl border border-white/5 bg-card/60 hover:border-primary/20 transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                                    Fixing Async Boto3 Blocking Calls
                                </h3>
                                <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-xs font-bold rounded">98% Match</span>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">
                                Boto3 is synchronous by default which causes the <span className="text-primary bg-primary/10 px-1 rounded">event loop to block</span> when making AWS calls. The solution is to wrap the calls using <span className="text-foreground font-mono text-xs bg-secondary px-1 rounded">sync_to_async</span> from asgiref.sync...
                            </p>
                            <div className="mt-4 flex gap-2">
                                <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">#python</span>
                                <span className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">#aws</span>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </div>
    )
}
