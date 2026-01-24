"use client"

import { motion } from "framer-motion"
import { Activity, Server, Database, Box, Cpu, AlertCircle, Play, RefreshCw, FileText, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const SERVICES = [
    { name: "Docker", icon: <Box className="h-4 w-4" />, status: "healthy", port: null },
    { name: "PostgreSQL", icon: <Database className="h-4 w-4" />, status: "healthy", port: 15432 },
    { name: "Redis", icon: <Database className="h-4 w-4" />, status: "healthy", port: 16379 },
    { name: "OpenSearch", icon: <SearchIcon className="h-4 w-4" />, status: "degraded", port: 9200 },
    { name: "Jaeger", icon: <Activity className="h-4 w-4" />, status: "healthy", port: 16686 },
    { name: "Ollama", icon: <Cpu className="h-4 w-4" />, status: "healthy", port: 11434 },
    { name: "API Server", icon: <Server className="h-4 w-4" />, status: "healthy", port: 3456 },
]

const SYSTEM_COMPONENTS = [
    { name: "Brain Core", status: "healthy" },
    { name: "Professor Agent", status: "healthy" },
    { name: "Context Engine", status: "healthy" },
    { name: "Search Query", status: "degraded" },
    { name: "Memory Stream", status: "healthy" },
]

function SearchIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    )
}

function StatusDot({ status }: { status: string }) {
    return (
        <div className="relative flex h-3 w-3">
            {status === "healthy" && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            )}
            <span className={cn(
                "relative inline-flex rounded-full h-3 w-3",
                status === "healthy" ? "bg-green-500" :
                    status === "degraded" ? "bg-yellow-500" : "bg-red-500"
            )}></span>
        </div>
    )
}

export function HealthView() {
    return (
        <div className="p-8 max-w-[1200px] mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">System Health</h2>
                    <p className="text-muted-foreground">Monitoring core services and brain functions</p>
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-2">
                        <RefreshCw className="h-4 w-4" /> Restart Services
                    </button>
                    <button className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors flex items-center gap-2">
                        <Play className="h-4 w-4" /> Start Context DNA
                    </button>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Infrastructure Status */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                >
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Server className="h-4 w-4" /> Infrastructure
                    </h3>
                    <div className="grid gap-4">
                        {SERVICES.map((service, i) => (
                            <div
                                key={service.name}
                                className="p-4 rounded-lg border border-white/5 bg-card/60 flex items-center justify-between group hover:border-white/10 transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "p-2 rounded-md transition-colors",
                                        service.status === "healthy" ? "bg-green-500/10 text-green-500" :
                                            service.status === "degraded" ? "bg-yellow-500/10 text-yellow-500" :
                                                "bg-red-500/10 text-red-500"
                                    )}>
                                        {service.icon}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-foreground">{service.name}</h4>
                                        {service.port && <span className="text-xs text-muted-foreground font-mono">:{service.port}</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                                        service.status === "healthy" ? "bg-green-500/10 text-green-500" :
                                            service.status === "degraded" ? "bg-yellow-500/10 text-yellow-500" :
                                                "bg-red-500/10 text-red-500"
                                    )}>
                                        {service.status}
                                    </span>
                                    <StatusDot status={service.status} />
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Brain Systems Status */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-4"
                >
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <BrainIcon className="h-4 w-4" /> Brain Systems
                    </h3>
                    <div className="bg-card/40 border border-white/5 rounded-xl p-6 space-y-6">
                        {SYSTEM_COMPONENTS.map((comp) => (
                            <div key={comp.name} className="flex items-center justify-between">
                                <span className="font-medium text-foreground/90">{comp.name}</span>
                                {comp.status === "healthy" ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-8">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Activity className="h-4 w-4" /> Recent Logs
                        </h3>
                        <div className="bg-black/40 rounded-lg p-4 font-mono text-xs text-muted-foreground overflow-hidden border border-white/5 space-y-2">
                            <p><span className="text-green-500">[12:45:22]</span> INFO: Context DNA started successfully</p>
                            <p><span className="text-blue-500">[12:45:23]</span> DEBUG: Connecting to Redis at 127.0.0.1:6379...</p>
                            <p><span className="text-green-500">[12:45:23]</span> INFO: Connected to Redis</p>
                            <p><span className="text-yellow-500">[12:45:25]</span> WARN: OpenSearch query took 1200ms (threshold: 1000ms)</p>
                            <p><span className="text-blue-500">[12:46:10]</span> DEBUG: Processing new learning: "Docker restart"</p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    )
}

function BrainIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
            <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
            <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
            <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
            <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
            <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
            <path d="M6 18a4 4 0 0 1-1.97-3.465" />
            <path d="M20 18a4 4 0 0 0-1.97-3.465" />
        </svg>
    )
}
