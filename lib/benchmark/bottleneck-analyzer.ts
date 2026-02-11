// =============================================================================
// BOTTLENECK ANALYZER — Context DNA IDE Benchmark System
// =============================================================================
// Accepts benchmark results + system metrics, classifies the primary bottleneck,
// generates human-readable evidence, and suggests ranked fixes.
// Supports both "Dyno" (LLM-only) and "Pipeline" (full system) modes.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Canonical phase names across the pipeline */
export type PhaseName =
  | 'context_build'
  | 'retrieval'
  | 'llm_local'
  | 'llm_remote'
  | 'tool_exec'
  | 'post_process';

export interface PhaseMetrics {
  name: PhaseName;
  /** Wall-clock duration in milliseconds */
  duration_ms: number;
  /** Share of the total pipeline duration, 0-100 */
  pct_of_total: number;
}

export type BottleneckClassification =
  | 'gpu'
  | 'cpu'
  | 'memory'
  | 'io'
  | 'thermal'
  | 'network'
  | 'tool_exec';

export interface BottleneckReport {
  primary_bottleneck: string;
  secondary_bottleneck: string;
  evidence: string;
  suggested_fixes: string[];
  phases: PhaseMetrics[];
  classification: BottleneckClassification;
}

/** System-level metrics sampled during the benchmark run */
export interface SystemMetrics {
  /** GPU utilisation 0-100 (null if no GPU / not measured) */
  gpu_util_pct: number | null;
  /** CPU utilisation 0-100 (average across cores) */
  cpu_util_pct: number | null;
  /** Percentage of physical RAM in use, 0-100 */
  ram_used_pct: number | null;
  /** True if swap was detected during the run */
  swap_active: boolean;
  /** CPU / die temperature in Celsius (null if unavailable) */
  temperature_c: number | null;
}

/** Latency distribution for time-to-first-token */
export interface TTFTDistribution {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

/** Decode throughput at various context lengths */
export interface DecodeThroughput {
  /** Context window size in tokens for this measurement */
  context_tokens: number;
  /** Tokens decoded per second */
  tok_per_sec: number;
}

export type BenchmarkMode = 'dyno' | 'pipeline';

/** Full benchmark result fed into the analyzer */
export interface BenchmarkInput {
  mode: BenchmarkMode;
  /** Per-phase timing. In 'dyno' mode only llm_local/llm_remote are populated. */
  phase_timings: Record<string, number>;
  /** Total wall-clock duration in ms */
  total_duration_ms: number;
  /** System metrics snapshot during the run */
  system: SystemMetrics;
  /** TTFT distribution (required for dyno, optional for pipeline) */
  ttft?: TTFTDistribution;
  /** Decode throughput at multiple context lengths */
  decode_throughput?: DecodeThroughput[];
  /** Community median tok/s for the same model (if available) */
  community_median_tok_s?: number | null;
  /** Community median TTFT p50 (if available) */
  community_median_ttft_p50_ms?: number | null;
}

/** Community comparison data surfaced in the "What Should I Upgrade?" section */
export interface CommunityComparison {
  metric: string;
  yours: number;
  median: number;
  delta_pct: number;
  verdict: 'above' | 'below' | 'at';
}

// ---------------------------------------------------------------------------
// Constants — Thresholds
// ---------------------------------------------------------------------------

const THRESHOLDS = {
  /** Decode throughput drop % to flag KV-cache / memory bottleneck */
  DECODE_DROP_PCT: 30,
  /** TTFT p95/p50 ratio above which we flag variance */
  TTFT_VARIANCE_RATIO: 3,
  /** GPU utilisation above which the workload is GPU-bound */
  GPU_BOUND_PCT: 90,
  /** CPU utilisation above which the workload is CPU-bound */
  CPU_BOUND_PCT: 80,
  /** GPU utilisation below which (when CPU is high) we flag CPU-bound */
  GPU_LOW_PCT: 50,
  /** RAM utilisation above which we flag memory pressure */
  RAM_PRESSURE_PCT: 95,
  /** Temperature above which we flag thermal throttling */
  THERMAL_THROTTLE_C: 95,
  /** Phase % of total above which remote API is the bottleneck */
  REMOTE_API_DOMINANT_PCT: 50,
  /** Phase % of total above which tool execution is the bottleneck */
  TOOL_EXEC_DOMINANT_PCT: 40,
} as const;

// ---------------------------------------------------------------------------
// Phase colour mapping (for UI consumption)
// ---------------------------------------------------------------------------

export const PHASE_COLORS: Record<PhaseName, string> = {
  context_build: '#3b82f6',  // blue-500
  retrieval: '#6366f1',      // indigo-500
  llm_local: '#22c55e',      // green-500
  llm_remote: '#14b8a6',     // teal-500
  tool_exec: '#f97316',      // orange-500
  post_process: '#a855f7',   // purple-500
};

export const PHASE_LABELS: Record<PhaseName, string> = {
  context_build: 'Context Build',
  retrieval: 'Retrieval',
  llm_local: 'LLM (Local)',
  llm_remote: 'LLM (Remote)',
  tool_exec: 'Tool Exec',
  post_process: 'Post-Process',
};

// ---------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------

/**
 * Analyse a benchmark run and produce a bottleneck report.
 *
 * The function is pure — no side effects, no network calls.
 */
export function analyzeBottleneck(input: BenchmarkInput): BottleneckReport {
  const phases = buildPhaseMetrics(input);
  const signals = collectSignals(input, phases);
  const classification = classifyBottleneck(signals);
  const evidence = buildEvidence(classification, signals, input);
  const fixes = suggestFixes(classification, signals, input);
  const [primary, secondary] = rankBottlenecks(classification, signals);

  return {
    primary_bottleneck: primary,
    secondary_bottleneck: secondary,
    evidence,
    suggested_fixes: fixes,
    phases,
    classification,
  };
}

/**
 * Compare user metrics against community medians.
 */
export function compareToCommunity(input: BenchmarkInput): CommunityComparison[] {
  const comparisons: CommunityComparison[] = [];

  if (input.community_median_tok_s != null && input.decode_throughput?.length) {
    const userTokS = input.decode_throughput[0].tok_per_sec;
    const median = input.community_median_tok_s;
    const delta = ((userTokS - median) / median) * 100;
    comparisons.push({
      metric: 'Decode tok/s',
      yours: round2(userTokS),
      median: round2(median),
      delta_pct: round2(delta),
      verdict: delta > 5 ? 'above' : delta < -5 ? 'below' : 'at',
    });
  }

  if (input.community_median_ttft_p50_ms != null && input.ttft) {
    const userTTFT = input.ttft.p50_ms;
    const median = input.community_median_ttft_p50_ms;
    // Lower is better for TTFT — invert the delta semantics
    const delta = ((median - userTTFT) / median) * 100;
    comparisons.push({
      metric: 'TTFT p50',
      yours: round2(userTTFT),
      median: round2(median),
      delta_pct: round2(delta),
      verdict: delta > 5 ? 'above' : delta < -5 ? 'below' : 'at',
    });
  }

  return comparisons;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Canonical phase order */
const PHASE_ORDER: PhaseName[] = [
  'context_build',
  'retrieval',
  'llm_local',
  'llm_remote',
  'tool_exec',
  'post_process',
];

function buildPhaseMetrics(input: BenchmarkInput): PhaseMetrics[] {
  const total = Math.max(input.total_duration_ms, 1); // avoid div-by-zero
  const phases: PhaseMetrics[] = [];

  for (const name of PHASE_ORDER) {
    const duration = input.phase_timings[name] ?? 0;
    if (duration > 0 || input.mode === 'pipeline') {
      phases.push({
        name,
        duration_ms: round2(duration),
        pct_of_total: round2((duration / total) * 100),
      });
    }
  }

  // In dyno mode, only include phases that have data
  if (input.mode === 'dyno') {
    return phases.filter((p) => p.duration_ms > 0);
  }

  return phases;
}

/** Intermediate signal bag used for classification */
interface Signals {
  decodeDropDetected: boolean;
  decodeDropPct: number;
  ttftVarianceDetected: boolean;
  ttftVarianceRatio: number;
  gpuBound: boolean;
  cpuBound: boolean;
  memoryPressure: boolean;
  swapActive: boolean;
  thermalThrottle: boolean;
  remoteApiDominant: boolean;
  remoteApiPct: number;
  toolExecDominant: boolean;
  toolExecPct: number;
  dominantPhase: PhaseName;
  dominantPhasePct: number;
}

function collectSignals(input: BenchmarkInput, phases: PhaseMetrics[]): Signals {
  const sys = input.system;

  // Decode throughput drop across context lengths
  let decodeDropDetected = false;
  let decodeDropPct = 0;
  if (input.decode_throughput && input.decode_throughput.length >= 2) {
    const sorted = [...input.decode_throughput].sort(
      (a, b) => a.context_tokens - b.context_tokens,
    );
    const first = sorted[0].tok_per_sec;
    const last = sorted[sorted.length - 1].tok_per_sec;
    if (first > 0) {
      decodeDropPct = round2(((first - last) / first) * 100);
      decodeDropDetected = decodeDropPct >= THRESHOLDS.DECODE_DROP_PCT;
    }
  }

  // TTFT variance
  let ttftVarianceDetected = false;
  let ttftVarianceRatio = 0;
  if (input.ttft && input.ttft.p50_ms > 0) {
    ttftVarianceRatio = round2(input.ttft.p95_ms / input.ttft.p50_ms);
    ttftVarianceDetected = ttftVarianceRatio >= THRESHOLDS.TTFT_VARIANCE_RATIO;
  }

  // Hardware signals
  const gpuBound = (sys.gpu_util_pct ?? 0) >= THRESHOLDS.GPU_BOUND_PCT;
  const cpuBound =
    (sys.cpu_util_pct ?? 0) >= THRESHOLDS.CPU_BOUND_PCT &&
    (sys.gpu_util_pct ?? 100) < THRESHOLDS.GPU_LOW_PCT;
  const memoryPressure =
    (sys.ram_used_pct ?? 0) >= THRESHOLDS.RAM_PRESSURE_PCT || sys.swap_active;
  const thermalThrottle =
    sys.temperature_c != null && sys.temperature_c >= THRESHOLDS.THERMAL_THROTTLE_C;

  // Phase dominance
  const remotePhase = phases.find((p) => p.name === 'llm_remote');
  const remoteApiPct = remotePhase?.pct_of_total ?? 0;
  const remoteApiDominant = remoteApiPct >= THRESHOLDS.REMOTE_API_DOMINANT_PCT;

  const toolPhase = phases.find((p) => p.name === 'tool_exec');
  const toolExecPct = toolPhase?.pct_of_total ?? 0;
  const toolExecDominant = toolExecPct >= THRESHOLDS.TOOL_EXEC_DOMINANT_PCT;

  // Overall dominant phase
  const dominant = phases.reduce(
    (best, p) => (p.pct_of_total > best.pct_of_total ? p : best),
    phases[0] ?? { name: 'llm_local' as PhaseName, pct_of_total: 0, duration_ms: 0 },
  );

  return {
    decodeDropDetected,
    decodeDropPct,
    ttftVarianceDetected,
    ttftVarianceRatio,
    gpuBound,
    cpuBound,
    memoryPressure,
    swapActive: sys.swap_active,
    thermalThrottle,
    remoteApiDominant,
    remoteApiPct,
    toolExecDominant,
    toolExecPct,
    dominantPhase: dominant.name,
    dominantPhasePct: dominant.pct_of_total,
  };
}

/**
 * Classification priority (highest → lowest):
 * 1. Memory pressure / swap → memory
 * 2. Thermal throttling → thermal
 * 3. Decode throughput drop (KV-cache) → memory
 * 4. Network / remote API dominant → network
 * 5. Tool exec dominant → tool_exec
 * 6. GPU >90% → gpu
 * 7. CPU >80% + GPU <50% → cpu
 * 8. Fallback: dominant phase heuristic
 */
function classifyBottleneck(signals: Signals): BottleneckClassification {
  if (signals.memoryPressure) return 'memory';
  if (signals.thermalThrottle) return 'thermal';
  if (signals.decodeDropDetected) return 'memory';
  if (signals.remoteApiDominant) return 'network';
  if (signals.toolExecDominant) return 'tool_exec';
  if (signals.gpuBound) return 'gpu';
  if (signals.cpuBound) return 'cpu';

  // Heuristic fallback based on dominant phase
  switch (signals.dominantPhase) {
    case 'llm_local':
      return 'gpu';
    case 'llm_remote':
      return 'network';
    case 'tool_exec':
      return 'tool_exec';
    case 'context_build':
    case 'retrieval':
      return 'io';
    case 'post_process':
      return 'cpu';
    default:
      return 'cpu';
  }
}

function buildEvidence(
  classification: BottleneckClassification,
  signals: Signals,
  input: BenchmarkInput,
): string {
  const parts: string[] = [];

  switch (classification) {
    case 'memory':
      if (signals.swapActive) {
        parts.push('Swap was active during the benchmark, indicating RAM exhaustion.');
      }
      if (input.system.ram_used_pct != null && input.system.ram_used_pct >= THRESHOLDS.RAM_PRESSURE_PCT) {
        parts.push(`RAM usage hit ${input.system.ram_used_pct.toFixed(0)}% during the run.`);
      }
      if (signals.decodeDropDetected) {
        parts.push(
          `Decode throughput dropped ${signals.decodeDropPct.toFixed(0)}% between shortest and longest context, suggesting KV-cache pressure.`,
        );
      }
      break;

    case 'thermal':
      parts.push(
        `Die temperature reached ${input.system.temperature_c?.toFixed(0)}°C, exceeding the ${THRESHOLDS.THERMAL_THROTTLE_C}°C throttle threshold.`,
      );
      if (signals.ttftVarianceDetected) {
        parts.push(
          `TTFT p95/p50 ratio is ${signals.ttftVarianceRatio.toFixed(1)}x, consistent with thermal-induced variance.`,
        );
      }
      break;

    case 'gpu':
      parts.push(
        `GPU utilisation averaged ${input.system.gpu_util_pct?.toFixed(0)}% — the model is compute-bound on the accelerator.`,
      );
      if (signals.ttftVarianceDetected) {
        parts.push(
          `High TTFT variance (p95/p50 = ${signals.ttftVarianceRatio.toFixed(1)}x) may indicate contention with other GPU workloads.`,
        );
      }
      break;

    case 'cpu':
      parts.push(
        `CPU usage averaged ${input.system.cpu_util_pct?.toFixed(0)}% while GPU sat at ${input.system.gpu_util_pct?.toFixed(0) ?? 'N/A'}%.`,
      );
      if (input.system.gpu_util_pct == null) {
        parts.push('No GPU detected — inference is running entirely on CPU.');
      } else {
        parts.push('CPU is the bottleneck; the GPU is underutilised.');
      }
      break;

    case 'network':
      parts.push(
        `Remote API phase consumed ${signals.remoteApiPct.toFixed(0)}% of total pipeline time (${input.phase_timings['llm_remote']?.toFixed(0) ?? 0}ms).`,
      );
      break;

    case 'tool_exec':
      parts.push(
        `Tool execution phase consumed ${signals.toolExecPct.toFixed(0)}% of total pipeline time (${input.phase_timings['tool_exec']?.toFixed(0) ?? 0}ms).`,
      );
      break;

    case 'io':
      parts.push(
        `The ${PHASE_LABELS[signals.dominantPhase]} phase dominated at ${signals.dominantPhasePct.toFixed(0)}% of total time, suggesting an I/O bottleneck in context assembly or retrieval.`,
      );
      break;
  }

  // Append TTFT insight if relevant and not already mentioned
  if (
    signals.ttftVarianceDetected &&
    classification !== 'thermal' &&
    classification !== 'gpu'
  ) {
    parts.push(
      `Note: TTFT p95 is ${signals.ttftVarianceRatio.toFixed(1)}x the p50, indicating high latency variance.`,
    );
  }

  return parts.join(' ');
}

function suggestFixes(
  classification: BottleneckClassification,
  signals: Signals,
  input: BenchmarkInput,
): string[] {
  const fixes: string[] = [];

  switch (classification) {
    case 'memory':
      fixes.push('Reduce model quantisation level (e.g. 8-bit to 4-bit) to lower KV-cache memory.');
      if (signals.swapActive) {
        fixes.push('Add more RAM or close background applications to eliminate swap usage.');
      }
      fixes.push('Reduce max context length to decrease KV-cache allocation.');
      fixes.push('Enable sliding-window attention if supported by the model.');
      fixes.push('Use a smaller model variant that fits entirely in RAM.');
      break;

    case 'thermal':
      fixes.push('Improve cooling (external fan, elevate laptop, check thermal paste).');
      fixes.push('Reduce sustained load by adding cooldown pauses between benchmark iterations.');
      fixes.push('Lower power limits or switch to an efficiency quantisation (4-bit).');
      fixes.push('Move inference to an always-on server with adequate cooling.');
      break;

    case 'gpu':
      fixes.push('Use a smaller or more quantised model to reduce GPU compute per token.');
      fixes.push('Enable speculative decoding to improve throughput with the same GPU.');
      fixes.push('Upgrade to a higher-end GPU or Apple Silicon chip with more GPU cores.');
      fixes.push('Batch requests to improve GPU utilisation efficiency.');
      break;

    case 'cpu':
      if (input.system.gpu_util_pct == null) {
        fixes.push('Install and configure a GPU-accelerated runtime (MLX for Apple Silicon, CUDA for NVIDIA).');
        fixes.push('If no GPU is available, switch to a smaller model (7B or under).');
      } else {
        fixes.push('Verify the inference runtime is using the GPU (check MLX/CUDA configuration).');
        fixes.push('Profile CPU-heavy preprocessing — it may be stealing cycles from inference.');
      }
      fixes.push('Reduce concurrent background processes competing for CPU.');
      fixes.push('Enable hardware-specific optimisations (e.g. AMX on Apple Silicon).');
      break;

    case 'network':
      fixes.push('Switch to a local LLM to eliminate network latency entirely.');
      fixes.push('Use a faster API provider or a closer region.');
      fixes.push('Enable response streaming to overlap network I/O with processing.');
      fixes.push('Cache frequent completions to reduce redundant API calls.');
      break;

    case 'tool_exec':
      fixes.push('Profile individual tool calls to identify the slowest tools.');
      fixes.push('Run independent tool calls in parallel instead of sequentially.');
      fixes.push('Cache tool results for deterministic inputs.');
      fixes.push('Set per-tool timeouts to prevent a single slow tool from blocking the pipeline.');
      break;

    case 'io':
      fixes.push('Move retrieval indices (embeddings, FTS) to an SSD if currently on HDD.');
      fixes.push('Increase in-memory cache size for frequently accessed context chunks.');
      fixes.push('Pre-build and cache the context payload between requests.');
      fixes.push('Profile disk I/O during the retrieval phase to find slow queries.');
      break;
  }

  // Cap at 5 most impactful fixes
  return fixes.slice(0, 5);
}

function rankBottlenecks(
  primary: BottleneckClassification,
  signals: Signals,
): [string, string] {
  const LABELS: Record<BottleneckClassification, string> = {
    gpu: 'GPU Compute',
    cpu: 'CPU Compute',
    memory: 'Memory / KV-Cache',
    io: 'Disk I/O',
    thermal: 'Thermal Throttling',
    network: 'Network / API Latency',
    tool_exec: 'Tool Execution',
  };

  const primaryLabel = LABELS[primary];

  // Determine secondary bottleneck
  const candidates: { label: string; score: number }[] = [];

  if (primary !== 'memory' && signals.decodeDropDetected)
    candidates.push({ label: LABELS.memory, score: signals.decodeDropPct });
  if (primary !== 'thermal' && signals.thermalThrottle)
    candidates.push({ label: LABELS.thermal, score: 80 });
  if (primary !== 'gpu' && signals.gpuBound)
    candidates.push({ label: LABELS.gpu, score: 70 });
  if (primary !== 'cpu' && signals.cpuBound)
    candidates.push({ label: LABELS.cpu, score: 60 });
  if (primary !== 'network' && signals.remoteApiDominant)
    candidates.push({ label: LABELS.network, score: signals.remoteApiPct });
  if (primary !== 'tool_exec' && signals.toolExecDominant)
    candidates.push({ label: LABELS.tool_exec, score: signals.toolExecPct });
  if (primary !== 'memory' && signals.swapActive)
    candidates.push({ label: LABELS.memory, score: 90 });

  // If TTFT variance is high but not the primary, call it out
  if (
    primary !== 'thermal' &&
    primary !== 'gpu' &&
    signals.ttftVarianceDetected
  ) {
    candidates.push({ label: 'TTFT Variance', score: signals.ttftVarianceRatio * 15 });
  }

  candidates.sort((a, b) => b.score - a.score);
  const secondaryLabel = candidates.length > 0 ? candidates[0].label : 'None detected';

  return [primaryLabel, secondaryLabel];
}

/**
 * Export a BottleneckReport as a Markdown string suitable for clipboard or docs.
 */
export function reportToMarkdown(report: BottleneckReport): string {
  const lines: string[] = [];

  lines.push('## Bottleneck Analysis Report');
  lines.push('');
  lines.push(`**Primary Bottleneck:** ${report.primary_bottleneck}`);
  lines.push(`**Secondary Bottleneck:** ${report.secondary_bottleneck}`);
  lines.push(`**Classification:** ${report.classification}`);
  lines.push('');
  lines.push('### Evidence');
  lines.push('');
  lines.push(report.evidence);
  lines.push('');
  lines.push('### Suggested Fixes');
  lines.push('');
  report.suggested_fixes.forEach((fix, i) => {
    lines.push(`${i + 1}. ${fix}`);
  });
  lines.push('');
  lines.push('### Phase Breakdown');
  lines.push('');
  lines.push('| Phase | Duration | Share |');
  lines.push('|-------|----------|-------|');
  for (const p of report.phases) {
    lines.push(
      `| ${PHASE_LABELS[p.name] ?? p.name} | ${p.duration_ms.toFixed(0)}ms | ${p.pct_of_total.toFixed(1)}% |`,
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
