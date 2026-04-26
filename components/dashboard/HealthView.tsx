"use client"

import { motion } from "framer-motion"
import { Activity, Server, AlertCircle, RefreshCw, CheckCircle2, XCircle, Wifi, WifiOff, Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFleetStatus, type FleetNodeStatus } from "@/lib/hooks/use-fleet-status"

function ConnectionPill({ tone, label }: { tone: "green" | "amber" | "red"; label: string }) {
    const palette = tone === "green"
        ? "bg-green-500/10 text-green-500 border-green-500/20"
        : tone === "amber"
            ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
            : "bg-red-500/10 text-red-500 border-red-500/20"
    const dot = tone === "green" ? "bg-green-500" : tone === "amber" ? "bg-yellow-500" : "bg-red-500"
    return (
        <span className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium", palette)}>
            <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />
            {label}
        </span>
    )
}

function NodeCard({ node }: { node: FleetNodeStatus }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg border border-white/5 bg-card/60 hover:border-white/10 transition-all"
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2 rounded-md",
                        node.healthy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                    )}>
                        {node.healthy ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </div>
                    <div>
                        <h4 className="font-medium text-foreground">{node.id}</h4>
                        <span className="text-xs text-muted-foreground font-mono">score {node.score}</span>
                    </div>
                </div>
                <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    node.healthy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                )}>
                    {node.healthy ? "healthy" : "degraded"}
                </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {node.broken_channels.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">all channels nominal</span>
                ) : (
                    node.broken_channels.map((ch) => (
                        <span
                            key={ch}
                            className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                        >
                            {ch}
                        </span>
                    ))
                )}
            </div>
        </motion.div>
    )
}

function LoadingSkeleton() {
    return (
        <div className="grid md:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-lg border border-white/5 bg-card/40 animate-pulse h-24" />
            ))}
        </div>
    )
}

export function HealthView() {
    const { data, loading, error, refresh } = useFleetStatus(5000)

    const isErrPayload = data !== null && data.ok === false
    const isOkPayload = data !== null && data.ok === true
    const nodes = isOkPayload ? data.nodes : []
    const cascadeMode = isOkPayload ? data.cascade_mode : "unknown"
    const totalActive = isOkPayload ? data.total_active : 0
    const selfId = isOkPayload ? data.self : null

    const tone: "green" | "amber" | "red" = isErrPayload || error
        ? "red"
        : isOkPayload && nodes.length > 0
            ? "green"
            : "amber"
    const label = isErrPayload || error
        ? "Daemon offline"
        : isOkPayload && nodes.length > 0
            ? `${nodes.length} node${nodes.length === 1 ? "" : "s"} reporting`
            : "Awaiting nodes"

    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Fleet Health</h2>
                    <p className="text-muted-foreground">
                        Live status from <span className="font-mono">/api/fleet/status</span>
                        {selfId ? <> — self: <span className="font-mono">{selfId}</span></> : null}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ConnectionPill tone={tone} label={label} />
                    <button
                        onClick={refresh}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-2 text-sm"
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
                    </button>
                </div>
            </div>

            {/* Top-of-page summary pills */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap gap-3"
            >
                <div className="px-4 py-2 rounded-lg border border-white/5 bg-card/60 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Cascade</span>
                    <span className="text-sm font-medium text-foreground capitalize">{cascadeMode}</span>
                </div>
                <div className="px-4 py-2 rounded-lg border border-white/5 bg-card/60 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Active</span>
                    <span className="text-sm font-medium text-foreground">{totalActive}</span>
                </div>
                <div className="px-4 py-2 rounded-lg border border-white/5 bg-card/60 flex items-center gap-2">
                    {tone === "green" ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Daemon</span>
                    <span className="text-sm font-medium text-foreground">{tone === "red" ? "down" : "up"}</span>
                </div>
            </motion.div>

            {/* Error banner — daemon-down per route contract */}
            {isErrPayload && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 flex items-start gap-3"
                >
                    <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-medium text-red-300">Fleet daemon offline</p>
                        <p className="text-muted-foreground mt-1 font-mono text-xs">{data.details}</p>
                    </div>
                </motion.div>
            )}

            {/* Transport error banner — non-200 from our route */}
            {error && !isErrPayload && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-lg border border-red-500/20 bg-red-500/5 flex items-start gap-3"
                >
                    <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-medium text-red-300">Status route unreachable</p>
                        <p className="text-muted-foreground mt-1 font-mono text-xs">{error}</p>
                    </div>
                </motion.div>
            )}

            {/* Node grid */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
            >
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Server className="h-4 w-4" /> Nodes
                </h3>
                {loading && data === null ? (
                    <LoadingSkeleton />
                ) : nodes.length === 0 && !isErrPayload ? (
                    <div className="p-6 rounded-lg border border-white/5 bg-card/40 text-sm text-muted-foreground">
                        No nodes reporting yet. The daemon is reachable but no peers have checked in.
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {nodes.map((node) => (
                            <NodeCard key={node.id} node={node} />
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    )
}
