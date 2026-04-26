'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Stethoscope,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Send,
  ShieldCheck,
  Loader2,
  Heart,
  Brain,
  Sparkles,
} from 'lucide-react';
import { useSurgeonsConsult } from '@/lib/hooks/use-surgeons-consult';
import { getCommandRegistry } from '@/lib/ide/command-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface SurgeonStatus {
  ok: boolean;
  note?: string;
}

interface ProbeResult {
  neurologist: SurgeonStatus;
  cardiologist: SurgeonStatus;
  atlas: SurgeonStatus;
  error?: string;
  _source?: string;
}

interface CrossExamResult {
  ok: boolean;
  topic?: string;
  error?: string;
  phases?: {
    initial?: any;
    cross_exam?: any;
    exploration?: any;
  };
  total_cost_usd?: number;
  queries?: number;
  timestamp?: string;
}

interface ConsensusResult {
  ok: boolean;
  claim?: string;
  error?: string;
  neurologist?: { ok: boolean; content: string };
  cardiologist?: { ok: boolean; content: string };
  timestamp?: string;
}

interface StatusResult {
  recent_cross_exams?: Array<{ topic: string; timestamp: string; ok: boolean }>;
  surgeons?: Record<string, string>;
  routing?: any;
  error?: string;
}

// ---------------------------------------------------------------------------
// Electron Surgeons bridge
// ---------------------------------------------------------------------------
function getElectronSurgeons() {
  if (typeof window !== 'undefined' && (window as any).electron?.surgeons) {
    return (window as any).electron.surgeons;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------
function SurgeonDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          ok ? 'bg-[#22c55e]' : 'bg-red-500'
        }`}
      />
      <span className="text-xs text-[#e5e5e5]">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#2a2a35]/50">
      <button
        className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 hover:bg-[#1a1a24] transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-[#6b6b75]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#6b6b75]" />
        )}
        <span className="text-xs font-medium text-[#e5e5e5]">{title}</span>
      </button>
      {open && (
        <div className="px-3 py-2 bg-[#111118] text-xs space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SurgeonPanel
// ---------------------------------------------------------------------------
export function SurgeonPanel() {
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [crossExam, setCrossExam] = useState<CrossExamResult | null>(null);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [gainsGate, setGainsGate] = useState<{ ok: boolean; error?: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [claimInput, setClaimInput] = useState('');
  const [consultTopic, setConsultTopic] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  // Lazy-init Electron surgeons bridge once (stable across renders, readable
  // during render). useState's lazy initializer runs only on mount.
  const [surgeons] = useState(() => getElectronSurgeons());
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const consultInputRef = useRef<HTMLInputElement | null>(null);
  const {
    consult: runConsult,
    loading: consultLoading,
    lastResult: consultResult,
    error: consultError,
  } = useSurgeonsConsult();

  // Probe (health check)
  const refreshProbe = useCallback(async () => {
    if (!surgeons) return;
    try {
      const result = await surgeons.probe();
      setProbe(result);
      setError(null);
    } catch {
      setError('Failed to reach agent_service');
    }
  }, []);

  // Status (recent exams)
  const refreshStatus = useCallback(async () => {
    if (!surgeons) return;
    try {
      const result = await surgeons.status();
      setStatus(result);
    } catch { /* ignore */ }
  }, []);

  // Cross-exam
  const runCrossExam = useCallback(async () => {
    if (!surgeons || !topicInput.trim()) return;
    setLoading('cross-exam');
    setCrossExam(null);
    try {
      const result = await surgeons.crossExam(topicInput.trim());
      setCrossExam(result);
    } catch (err: any) {
      setCrossExam({ ok: false, error: err.message });
    }
    setLoading(null);
  }, [topicInput]);

  // Consensus
  const runConsensus = useCallback(async () => {
    if (!surgeons || !claimInput.trim()) return;
    setLoading('consensus');
    setConsensus(null);
    try {
      const result = await surgeons.consensus(claimInput.trim());
      setConsensus(result);
    } catch (err: any) {
      setConsensus({ ok: false, error: err.message });
    }
    setLoading(null);
  }, [claimInput]);

  // Gains gate
  const runGainsGate = useCallback(async () => {
    if (!surgeons) return;
    setLoading('gains-gate');
    setGainsGate(null);
    try {
      const result = await surgeons.gainsGate();
      setGainsGate(result);
    } catch (err: any) {
      setGainsGate({ ok: false, error: err.message });
    }
    setLoading(null);
  }, []);

  // Consult (web/IPC fallback)
  const submitConsult = useCallback(async () => {
    const topic = consultTopic.trim();
    if (topic === '') return;
    await runConsult(topic);
  }, [consultTopic, runConsult]);

  // Auto-refresh probe + status (Electron-only)
  useEffect(() => {
    if (!surgeons) return;
    refreshProbe();
    refreshStatus();
    intervalRef.current = setInterval(() => {
      refreshProbe();
      refreshStatus();
    }, 15000);
    return () => clearInterval(intervalRef.current);
  }, [refreshProbe, refreshStatus]);

  // Register "Ask 3-Surgeons" command in the palette — focuses the topic input.
  useEffect(() => {
    const registry = getCommandRegistry();
    const disposable = registry.register({
      id: 'ai:ask-3-surgeons',
      label: 'Ask 3-Surgeons (Consult)',
      category: 'AI',
      source: 'surgeon-panel',
      handler: () => {
        // Focus on next tick so the panel is mounted/visible first.
        setTimeout(() => {
          consultInputRef.current?.focus();
          consultInputRef.current?.select();
        }, 50);
      },
    });
    return () => disposable.dispose();
  }, []);

  const electronAvailable = !!surgeons;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Stethoscope className="w-3.5 h-3.5 text-[#22c55e]" />
        <span className="text-xs font-medium text-[#e5e5e5]">3-Surgeon Protocol</span>
        <button onClick={() => { refreshProbe(); refreshStatus(); }} className="ml-auto" title="Refresh">
          <RotateCcw className="w-3 h-3 text-[#6b6b75] hover:text-[#e5e5e5]" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Probe status (Electron only — pings agent_service:8080) */}
        {electronAvailable && (
          <Section title="Surgeon Status" defaultOpen>
            {probe ? (
              <div className="flex flex-wrap gap-3">
                <SurgeonDot ok={probe.atlas?.ok ?? false} label="Atlas (Claude)" />
                <SurgeonDot ok={probe.cardiologist?.ok ?? false} label="Cardiologist (GPT)" />
                <SurgeonDot ok={probe.neurologist?.ok ?? false} label="Neurologist (Qwen)" />
              </div>
            ) : (
              <span className="text-[#6b6b75]">Loading...</span>
            )}
            {probe?._source === 'unavailable' && (
              <div className="text-[10px] text-yellow-500 mt-1">
                Agent service unreachable &mdash; showing cached state
              </div>
            )}
          </Section>
        )}

        {/* Consult — multi-model consensus via /api/3s/consult (web + Electron) */}
        <Section title="Consult (Cardio + Neuro + Atlas)" defaultOpen>
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                ref={consultInputRef}
                type="text"
                value={consultTopic}
                onChange={(e) => setConsultTopic(e.target.value)}
                placeholder="Ask the surgeons (e.g. 'Is SQLite the right backend for...')"
                className="flex-1 bg-[#1a1a24] text-[#e5e5e5] text-xs px-2 py-1 rounded border border-[#2a2a35] focus:border-[#22c55e] focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !consultLoading) submitConsult();
                }}
              />
              <button
                onClick={submitConsult}
                disabled={consultLoading || consultTopic.trim() === ''}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#22c55e]/20 text-[#22c55e] text-[10px] hover:bg-[#22c55e]/30 disabled:opacity-40"
              >
                {consultLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                Consult
              </button>
            </div>
            {consultLoading && (
              <div className="text-[10px] text-yellow-500">
                Running 3-surgeon consult (~30-60s)...
              </div>
            )}
            {consultError && !consultLoading && (
              <div className="text-[10px] text-red-400">{consultError}</div>
            )}
            {consultResult && consultResult.summary && (
              <div className="text-[10px] text-[#22c55e] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {consultResult.summary}
              </div>
            )}
            {consultResult && (consultResult.cardiologist || consultResult.neurologist) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                <div className="border border-[#2a2a35] rounded p-2 bg-[#111118]">
                  <div className="flex items-center gap-1 mb-1 text-[10px] uppercase tracking-wider text-[#ef4444]">
                    <Heart className="w-3 h-3" />
                    Cardiologist
                  </div>
                  <pre className="text-[11px] text-[#e5e5e5] whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto">
                    {consultResult.cardiologist || <span className="text-[#6b6b75]">(no response)</span>}
                  </pre>
                </div>
                <div className="border border-[#2a2a35] rounded p-2 bg-[#111118]">
                  <div className="flex items-center gap-1 mb-1 text-[10px] uppercase tracking-wider text-[#3b82f6]">
                    <Brain className="w-3 h-3" />
                    Neurologist
                  </div>
                  <pre className="text-[11px] text-[#e5e5e5] whitespace-pre-wrap break-words max-h-[260px] overflow-y-auto">
                    {consultResult.neurologist || <span className="text-[#6b6b75]">(no response)</span>}
                  </pre>
                </div>
              </div>
            )}
            {consultResult && (consultResult.raw || consultResult.stderr) && (
              <div className="mt-1">
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-[10px] text-[#6b6b75] hover:text-[#e5e5e5] flex items-center gap-1"
                >
                  {showRaw ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Raw output (debug)
                </button>
                {showRaw && (
                  <pre className="mt-1 text-[10px] text-[#a0a0ab] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto bg-[#0a0a0f] border border-[#2a2a35] rounded p-2">
                    {consultResult.raw}
                    {consultResult.stderr ? `\n\n[stderr]\n${consultResult.stderr}` : ''}
                  </pre>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* Electron-only sections (require window.electron.surgeons bridge) */}
        {electronAvailable && (
        <>
        <Section title="Cross-Examination">
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                placeholder="Topic (6+ chars)..."
                className="flex-1 bg-[#1a1a24] text-[#e5e5e5] text-xs px-2 py-1 rounded border border-[#2a2a35] focus:border-[#22c55e] focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && runCrossExam()}
              />
              <button
                onClick={runCrossExam}
                disabled={loading === 'cross-exam' || topicInput.trim().length < 6}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#22c55e]/20 text-[#22c55e] text-[10px] hover:bg-[#22c55e]/30 disabled:opacity-40"
              >
                {loading === 'cross-exam' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                Examine
              </button>
            </div>
            {loading === 'cross-exam' && (
              <div className="text-[10px] text-yellow-500">
                Running 3-phase pipeline (60-300s)...
              </div>
            )}
            {crossExam && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  {crossExam.ok ? (
                    <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span className="text-[#e5e5e5]">
                    {crossExam.ok ? 'Completed' : 'Failed'}
                  </span>
                  {crossExam.total_cost_usd != null && (
                    <span className="text-[#6b6b75] ml-auto">
                      ${crossExam.total_cost_usd.toFixed(4)} | {crossExam.queries} queries
                    </span>
                  )}
                </div>
                {crossExam.error && (
                  <div className="text-red-400">{crossExam.error}</div>
                )}
                {crossExam.phases && (
                  <div className="space-y-1 mt-1">
                    {crossExam.phases.initial && (
                      <div>
                        <span className="text-[#6b6b75]">Initial: </span>
                        <span className="text-[#e5e5e5]">
                          {typeof crossExam.phases.initial === 'string'
                            ? crossExam.phases.initial.slice(0, 200)
                            : JSON.stringify(crossExam.phases.initial).slice(0, 200)}
                          ...
                        </span>
                      </div>
                    )}
                    {crossExam.phases.cross_exam && (
                      <div>
                        <span className="text-[#6b6b75]">Cross-exam: </span>
                        <span className="text-[#e5e5e5]">
                          {typeof crossExam.phases.cross_exam === 'string'
                            ? crossExam.phases.cross_exam.slice(0, 200)
                            : JSON.stringify(crossExam.phases.cross_exam).slice(0, 200)}
                          ...
                        </span>
                      </div>
                    )}
                    {crossExam.phases.exploration && (
                      <div>
                        <span className="text-[#6b6b75]">Exploration: </span>
                        <span className="text-[#e5e5e5]">
                          {typeof crossExam.phases.exploration === 'string'
                            ? crossExam.phases.exploration.slice(0, 200)
                            : JSON.stringify(crossExam.phases.exploration).slice(0, 200)}
                          ...
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* Consensus */}
        <Section title="Consensus Vote">
          <div className="space-y-2">
            <div className="flex gap-1">
              <input
                type="text"
                value={claimInput}
                onChange={(e) => setClaimInput(e.target.value)}
                placeholder="Claim to evaluate (6+ chars)..."
                className="flex-1 bg-[#1a1a24] text-[#e5e5e5] text-xs px-2 py-1 rounded border border-[#2a2a35] focus:border-[#22c55e] focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && runConsensus()}
              />
              <button
                onClick={runConsensus}
                disabled={loading === 'consensus' || claimInput.trim().length < 6}
                className="flex items-center gap-1 px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-[10px] hover:bg-blue-500/30 disabled:opacity-40"
              >
                {loading === 'consensus' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
                Vote
              </button>
            </div>
            {loading === 'consensus' && (
              <div className="text-[10px] text-yellow-500">
                Gathering surgeon votes (~30s)...
              </div>
            )}
            {consensus && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  {consensus.ok ? (
                    <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span className="text-[#e5e5e5]">
                    {consensus.ok ? 'Consensus reached' : 'Failed'}
                  </span>
                </div>
                {consensus.error && (
                  <div className="text-red-400">{consensus.error}</div>
                )}
                {consensus.neurologist && (
                  <div>
                    <span className="text-[#6b6b75]">Neurologist: </span>
                    <span className="text-[#e5e5e5]">
                      {consensus.neurologist.content?.slice(0, 150)}...
                    </span>
                  </div>
                )}
                {consensus.cardiologist && (
                  <div>
                    <span className="text-[#6b6b75]">Cardiologist: </span>
                    <span className="text-[#e5e5e5]">
                      {consensus.cardiologist.content?.slice(0, 150)}...
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        {/* Gains Gate */}
        <Section title="Gains Gate">
          <div className="space-y-2">
            <button
              onClick={runGainsGate}
              disabled={loading === 'gains-gate'}
              className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-[10px] hover:bg-purple-500/30 disabled:opacity-40"
            >
              {loading === 'gains-gate' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ShieldCheck className="w-3 h-3" />
              )}
              Run Gains Gate
            </button>
            {loading === 'gains-gate' && (
              <div className="text-[10px] text-yellow-500">
                Running 10-check verification (~60s)...
              </div>
            )}
            {gainsGate && (
              <div className="flex items-center gap-1">
                {gainsGate.ok ? (
                  <CheckCircle2 className="w-3 h-3 text-[#22c55e]" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-400" />
                )}
                <span className="text-[#e5e5e5]">
                  {gainsGate.ok ? 'All checks passed' : gainsGate.error || 'Gate failed'}
                </span>
              </div>
            )}
          </div>
        </Section>

        {/* Recent Cross-Exams */}
        {status?.recent_cross_exams && status.recent_cross_exams.length > 0 && (
          <Section title={`Recent Exams (${status.recent_cross_exams.length})`}>
            {status.recent_cross_exams.map((exam, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {exam.ok ? (
                  <CheckCircle2 className="w-3 h-3 text-[#22c55e] flex-shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                )}
                <span className="text-[#e5e5e5] truncate flex-1">{exam.topic}</span>
                <span className="text-[#6b6b75] flex-shrink-0 text-[10px]">
                  {new Date(exam.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </Section>
        )}

        {/* Surgeon Models */}
        {status?.surgeons && (
          <Section title="Surgeon Models">
            {Object.entries(status.surgeons).map(([name, model]) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="text-[#6b6b75] capitalize">{name}:</span>
                <span className="text-[#e5e5e5]">{model as string}</span>
              </div>
            ))}
          </Section>
        )}
        </>
        )}

        {!electronAvailable && (
          <div className="px-3 py-2 text-[10px] text-[#6b6b75] border-t border-[#2a2a35]/50">
            Cross-exam, consensus vote, and gains-gate require the Electron desktop app.
            Consult above works in the browser via /api/3s/consult.
          </div>
        )}
      </div>
    </div>
  );
}
