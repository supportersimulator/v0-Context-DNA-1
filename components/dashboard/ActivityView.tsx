"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, Trophy, Wrench, Repeat, FileText, Lightbulb, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type LearningType = 'win' | 'fix' | 'pattern' | 'sop' | 'insight' | 'gotcha'

interface Learning {
    id: string
    type: LearningType
    title: string
    content: string
    tags: string[]
    timestamp: string
}

const SAMPLE_LEARNINGS: Learning[] = [
    {
        id: '1',
        type: 'win',
        title: 'Deployed Django to production successfully',
        content: 'Finally got the gunicorn worker configuration right for the t2.micro instance. The key was setting the workers to 2*CPU + 1.',
        tags: ['django', 'deployment', 'aws'],
        timestamp: '2 hours ago'
    },
    {
        id: '2',
        type: 'fix',
        title: 'Fixed async boto3 blocking event loop',
        content: 'Boto3 is synchronous by default. Wrapped the calls in `await sync_to_async` to prevent blocking the ASGI loop.',
        tags: ['python', 'async', 'aws'],
        timestamp: '4 hours ago'
    },
    {
        id: '3',
        type: 'pattern',
        title: 'Docker restart doesn\'t reload env vars',
        content: 'Common misconception. You need to recreate the container to pick up new env vars, or use docker compose up -d again.',
        tags: ['docker', 'devops'],
        timestamp: 'Yesterday'
    },
    {
        id: '4',
        type: 'insight',
        title: 'GPU toggle needs Internal NLB for IP changes',
        content: 'When the GPU spot instance restarts, it gets a new private IP. The internal NLB handles the DNS propagation automatically.',
        tags: ['aws', 'networking', 'gpu'],
        timestamp: '2 days ago'
    },
    {
        id: '5',
        type: 'gotcha',
        title: 'WebRTC requires Cloudflare proxy=false',
        content: 'Cloudflare proxying (orange cloud) breaks WebRTC signaling because it only proxies HTTP/HTTPS traffic by default.',
        tags: ['webrtc', 'cloudflare', 'networking'],
        timestamp: '3 days ago'
    }
]

const TypeIcon = ({ type }: { type: LearningType }) => {
    switch (type) {
        case 'win': return <div className="text-green-500"><Trophy className="h-4 w-4" /></div>
        case 'fix': return <div className="text-orange-500"><Wrench className="h-4 w-4" /></div>
        case 'pattern': return <div className="text-blue-500"><Repeat className="h-4 w-4" /></div>
        case 'sop': return <div className="text-purple-500"><FileText className="h-4 w-4" /></div>
        case 'insight': return <div className="text-pink-500"><Lightbulb className="h-4 w-4" /></div>
        case 'gotcha': return <div className="text-red-500"><AlertTriangle className="h-4 w-4" /></div>
    }
}

const TypeBadge = ({ type }: { type: LearningType }) => {
    let colorClass = ""
    switch (type) {
        case 'win': colorClass = "bg-green-500/10 text-green-500 border-green-500/20"; break;
        case 'fix': colorClass = "bg-orange-500/10 text-orange-500 border-orange-500/20"; break;
        case 'pattern': colorClass = "bg-blue-500/10 text-blue-500 border-blue-500/20"; break;
        case 'sop': colorClass = "bg-purple-500/10 text-purple-500 border-purple-500/20"; break;
        case 'insight': colorClass = "bg-pink-500/10 text-pink-500 border-pink-500/20"; break;
        case 'gotcha': colorClass = "bg-red-500/10 text-red-500 border-red-500/20"; break;
    }

    return (
        <span className={cn("px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider border", colorClass)}>
            {type}
        </span>
    )
}

export function ActivityView() {
    const [filter, setFilter] = useState<'all' | LearningType>('all')
    const [search, setSearch] = useState("")

    const filteredLearnings = SAMPLE_LEARNINGS.filter(item => {
        const matchesFilter = filter === 'all' || item.type === filter
        const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase()) ||
            item.content.toLowerCase().includes(search.toLowerCase())
        return matchesFilter && matchesSearch
    })

    return (
        <div className="flex flex-col h-full max-w-[1000px] mx-auto p-6 gap-6">
            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center sticky top-0 bg-background/80 backdrop-blur-xl z-20 py-2 border-b border-white/5">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search feed..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-secondary rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
                    {['all', 'win', 'fix', 'pattern', 'sop', 'insight', 'gotcha'].map((t) => (
                        <button
                            key={t}
                            onClick={() => setFilter(t as any)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                                filter === t
                                    ? "bg-primary/20 text-primary border-primary/20"
                                    : "bg-secondary text-muted-foreground border-transparent hover:bg-secondary/80"
                            )}
                        >
                            {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Feed */}
            <div className="space-y-4 pb-10">
                <AnimatePresence mode="popLayout">
                    {filteredLearnings.map((item, index) => (
                        <motion.div
                            layout
                            key={item.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.05 }}
                            className="group p-5 rounded-xl border border-white/5 bg-card/40 hover:bg-card/60 backdrop-blur-sm transition-all hover:border-white/10 cursor-pointer"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "p-2 rounded-lg bg-secondary group-hover:bg-white/5 transition-colors",
                                    )}>
                                        <TypeIcon type={item.type} />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                            {item.title}
                                        </h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <TypeBadge type={item.type} />
                                            <span className="text-xs text-muted-foreground">in</span>
                                            <div className="flex gap-1">
                                                {item.tags.map(tag => (
                                                    <span key={tag} className="text-xs text-muted-foreground/80 hover:text-foreground transition-colors">#{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{item.timestamp}</span>
                            </div>

                            <p className="mt-4 text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                                {item.content}
                            </p>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredLearnings.length === 0 && (
                    <div className="text-center py-20 text-muted-foreground">
                        <p>No learnings found matching your filters.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
