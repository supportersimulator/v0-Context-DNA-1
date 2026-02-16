# Anti-Miswiring: Session Historian → Local LLM 16-Pass Gold Mining

> **Current State: 2026-02-16**
> **Invariance Document** — Any AI working on this system MUST read this before modifying session extraction, gold mining, or local LLM pass logic.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Session Historian Pipeline](#session-historian-pipeline)
3. [Gold Segments Architecture](#gold-segments-architecture)
4. [The 16 Passes — Complete Reference](#the-16-passes--complete-reference)
5. [Multi-Pass (Mini-Pass) Decomposition](#multi-pass-mini-pass-decomposition)
6. [LLM Profiles and Token Budgets](#llm-profiles-and-token-budgets)
7. [Critical Findings Pipeline](#critical-findings-pipeline)
8. [Scheduler Integration](#scheduler-integration)
9. [Data Flow Diagram](#data-flow-diagram)
10. [Anti-Miswiring Rules](#anti-miswiring-rules)
11. [Database Schema Reference](#database-schema-reference)
12. [Evolution History](#evolution-history)

---

## System Overview

The session gold mining system extracts lasting value from Claude Code (Atlas) conversations. Raw JSONL session logs are compressed into gold text, segmented into ~20K char conversation-boundary chunks, and processed through 16 specialized LLM passes on a local Qwen3-4B-4bit model. Each pass does ONE narrow thing well. Outputs feed SOPs, evidence pipeline, strategic planning, and the webhook injection system.

### Key Files

| File | Role |
|------|------|
| `memory/session_historian.py` | Extraction, LLM analysis, segmentation, cleanup |
| `memory/session_gold_passes.py` | 16 pass definitions, data fetchers, multi-pass engine, merge functions, downstream routing |
| `memory/lite_scheduler.py` | Scheduler that orchestrates all timed jobs |
| `memory/llm_priority_queue.py` | LLM request queue with profiles (classify, extract, deep, etc.) |
| `memory/sqlite_storage.py` | SOP/learning storage backend |

### Key Databases

| Database | Location | Purpose |
|----------|----------|---------|
| `session_archive.db` | `~/.context-dna/` | Gold text, segments, insights, pass logs, critical findings |
| `.observability.db` | `memory/` | Outcome events, claims, SOP quality scores |
| `.strategic_plans.db` | `memory/` | Big picture tracking, major plans |

---

## Session Historian Pipeline

The Session Historian (`memory/session_historian.py`) runs as two scheduled jobs:

### Fast Cycle (every 2 minutes)
**Job**: `session_historian_fast` → `run_active_only()`
**Purpose**: Near-real-time gold capture from active Claude Code sessions.

1. **Find active sessions** — check for `.jsonl` files still being written
2. **Incremental extract** — read from `last_line_read` forward (never re-extracts)
3. **Append to gold_text** — `gold_text += "\n\n--- [incremental extract] ---\n\n" + new_gold`
4. **Segment new content** — creates ~20K char `gold_segments` immediately (as of 2026-02-16)
5. **Re-analysis trigger** — resets `llm_analyzed_at = NULL` if:
   - Batch has 3+ new messages, OR
   - `gold_text` grew by >30% since last analysis (growth-based trigger, added 2026-02-16)
6. **Clean dead sessions** — if a session was active last cycle but now inactive, clean raw JSONL

### Full Cycle (every 15 minutes)
**Job**: `session_historian` → `run()`
**Purpose**: Complete pipeline including LLM analysis and evidence feeding.

1. **Phase 1: Extract** — incremental extract from ALL sessions (active + stale)
2. **Phase 2: LLM Analyze** — sessions where `llm_analyzed_at IS NULL` get sent to Qwen3-4B with `deep` profile (2048 tokens). Produces: summary, insights, score (0.0-1.0), topics
3. **Phase 2.5: Segment** — create ~20K char `gold_segments` for any session with new content
4. **Phase 3: Feed Pipeline** — insert `session_insights` into evidence pipeline
5. **Phase 4: Cleanup** — delete raw `.jsonl` files for archived, inactive sessions

### Phase 2 LLM Analysis Details

- **Model**: Qwen3-4B-4bit via `butler_query(profile="deep")` (2048 max_tokens)
- **Input cap**: 80K chars (~20K tokens). Larger sessions get head+tail truncation
- **Batch size**: 3 sessions per run (avoid hogging LLM queue)
- **Output**: Summary, usefulness score (0.0-1.0), topic tags, categorized insights
- **Parser**: Tries JSON first → falls back to natural language extraction with regex

### The 85% Unanalyzed Gap (Fixed 2026-02-16)

**Problem**: Phase 2 originally ran once (when `llm_analyzed_at IS NULL`), at the ~15 minute mark. For a 2-hour session, 85%+ of content accumulated AFTER analysis and was never turned into `session_insights`.

**Fix**: Growth-based re-analysis trigger. When `gold_text` grows >30% since last analysis, `llm_analyzed_at` is reset to NULL, causing Phase 2 to re-analyze on the next full cycle.

---

## Gold Segments Architecture

Gold segments are ~20K char conversation-boundary chunks of the raw gold text. They are the PRIMARY input for 7 of 16 passes.

### Segmentation Constants

```
TARGET_SEGMENT_CHARS = 20000   # ~5K tokens — optimal for Qwen3-4B narrow extract
MIN_SEGMENT_CHARS    = 8000    # Don't create tiny trailing segments
MAX_SEGMENT_CHARS    = 28000   # Allow flexibility at conversation boundaries
```

### Why 20K?

Benchmarked on 2026-02-15 against Qwen3-4B-4bit:

| Input Size | Classify Latency | Classify Quality | Extract Quality |
|-----------|-----------------|-----------------|----------------|
| 2K chars (~600 tok) | ~1.5s | Good but sparse | Insufficient context |
| 5K chars (~1.4K tok) | ~1.6s | Good | Decent |
| 8-12K chars (~2-3K tok) | ~1.5-2.1s | Excellent | Good |
| **16-24K chars (~4-6K tok)** | **~3-5s** | **Good** | **Best: full structured output** |
| 24K+ chars (6K+ tok) | 5-10s+ | Degrades (analysis tags) | Formatting loss |

**Sweet spot: 16K-24K chars.** The model handles narrow classification well up to ~5K tokens of input. Extract quality peaks at 16-24K where there's enough context for the model to find specific bug fixes, error messages, file paths, and architectural decisions.

### Segmentation Algorithm

1. Find `USER:` boundaries in new content (conversation turn markers)
2. Group boundaries into ~20K char chunks
3. Final segment: extend last or create new if ≥8K chars
4. Incremental: only segments content beyond `MAX(char_offset_end)` for that session
5. `INSERT OR IGNORE` with `UNIQUE(session_id, segment_index)` prevents duplicates

### When Segments Are Created

| Trigger | Cycle | Latency to Gold Mining |
|---------|-------|----------------------|
| Fast historian extracts new content | 2 min | ~5 min (2 min extract + 3 min pass cycle) |
| Full historian Phase 2.5 | 15 min | ~18 min |

---

## The 16 Passes — Complete Reference

### Tier 1: SOP Extraction (Passes 1-4)

Mining raw gold from session conversation segments. Each produces structured SOPs stored in SQLite learnings.

| # | Key | Name | Data Source | LLM Pipeline | Downstream |
|---|-----|------|-------------|-------------|------------|
| 1 | `sop_bugfix` | Bug Fix Mining | `gold_segments` | classify(64) → extract(768) | `store_learning` (type: fix) |
| 2 | `sop_pattern` | Pattern/Process Mining | `gold_segments` | classify(64) → extract(768) | `store_learning` (type: pattern) |
| 3 | `sop_antipattern` | Anti-Pattern Mining | `gold_segments` | classify(64) → extract(768) | `store_learning` (type: gotcha) |
| 4 | `sop_architecture` | Architecture Decision Mining | `gold_segments` | classify(64) → extract(768) | `store_learning` (type: decision) |

**Pass 1 (sop_bugfix)**: Extracts `TITLE / SYMPTOM / ROOT_CAUSE / FIX / VERIFY` from segments containing specific bug fixes with resolutions.

**Pass 2 (sop_pattern)**: Extracts `TITLE / WHEN / PROCESS / WHY / VERIFY` from segments containing repeatable workflows.

**Pass 3 (sop_antipattern)**: Extracts `TITLE / NEVER_DO / BECAUSE / INSTEAD / VERIFY` from segments containing gotchas and mistakes.

**Pass 4 (sop_architecture)**: Extracts `TITLE / DECISION / ALTERNATIVES / RATIONALE / CONSEQUENCES` from segments containing design choices.

### Tier 2: Quality Evaluation (Passes 5-8)

Measuring quality of what we have and recording outcomes.

| # | Key | Name | Data Source | LLM Pipeline | Downstream |
|---|-----|------|-------------|-------------|------------|
| 5 | `eval_sop_quality` | SOP Specificity Audit | `existing_sops` | extract_deep(1024) | `sop_quality_score` |
| 6 | `eval_webhook_quality` | Webhook Injection Quality | `injection_outcomes` | **4-dim multi-pass** + infra audit | `injection_quality_log` |
| 7 | `eval_success` | Success Measurement | `gold_segments` | **3-step multi-pass** | `outcome_event` (success) |
| 8 | `eval_failure` | Failure Measurement | `gold_segments` | **3-step multi-pass** | `outcome_event` (failure) |

**Pass 5 (eval_sop_quality)**: Scores existing SOPs 1-5 for actionability. Output: `SCORE / WEAKNESS / SUGGESTION`.

**Pass 6 (eval_webhook_quality)**: Multi-pass scoring of webhook injection quality across 4 dimensions (relevance, completeness, freshness, actionability). Each scored 0-3. Python merge computes total/12 and identifies weakest dimension. Also runs live infrastructure probes (`infra_audit: True`).

**Pass 7 (eval_success)**: Multi-pass extraction from gold segments. Gate → What Succeeded → Metric Extract → Python Merge. Produces `SUCCESS / EVIDENCE / METRIC / CONFIDENCE`. Upgraded from `session_insights` to `gold_segments` on 2026-02-16.

**Pass 8 (eval_failure)**: Multi-pass extraction from gold segments. Gate → What Failed → Impact Extract → Root Cause → Python Merge. Produces `FAILURE / EVIDENCE / IMPACT / ROOT_CAUSE`. Upgraded from `session_insights` to `gold_segments` on 2026-02-16.

### Tier 3: System Intelligence (Passes 9-13)

Cross-session wisdom and structural analysis.

| # | Key | Name | Data Source | LLM Pipeline | Downstream |
|---|-----|------|-------------|-------------|------------|
| 9 | `intel_bigpicture` | Big Picture Tracker | `gold_segments` | **5-step multi-pass** | `big_picture` |
| 10 | `intel_crosssession` | Cross-Session Patterns | `insight_clusters` | extract_deep(1024) | `meta_analysis` |
| 11 | `intel_feedback_loops` | Feedback Loop Wiring | `injection_outcomes` | extract_deep(1024) | `feedback_loop_registry` |
| 12 | `intel_code_artifacts` | Code Artifact Analysis | `code_artifacts` | **4-step multi-pass** | `code_intelligence` |
| 13 | `intel_evidence_quality` | Evidence Quality Audit | `claims` | extract_deep(1024) | `evidence_health` |

**Pass 9 (intel_bigpicture)**: Multi-pass strategic tracking. Gate(goal) → Planned → Actual → Drift → Python Merge. Outputs `GOAL / PLANNED / ACTUAL / DRIFT / RECOMMENDATION`. Drift levels: ALIGNED, MINOR, MAJOR, CRITICAL.

**Pass 10 (intel_crosssession)**: Clusters similar insights across sessions. Extracts `PATTERN / FREQUENCY / SIGNIFICANCE / ACTION`.

**Pass 11 (intel_feedback_loops)**: Detects disconnected cause-effect chains in injection outcomes. Extracts `CAUSE / EFFECT / GAP / WIRING`.

**Pass 12 (intel_code_artifacts)**: Multi-pass code analysis. Gate(change) → Pattern → Scope → Fragility → Python Merge. Scope: CORE/MODULE/UTILITY/TRIVIAL. Fragility: HIGH/MEDIUM/LOW. Auto-generates recommendations. **CORE+HIGH = architectural critical → holding tank.**

**Pass 13 (intel_evidence_quality)**: Audits claim evidence grades and confidence calibration. Output: `GRADE_CORRECT / CONFIDENCE_CALIBRATED / SHOULD_BE / ISSUE`.

### Tier 4: Operations (Passes 14-16)

Keeping the mansion running.

| # | Key | Name | Data Source | LLM Pipeline | Downstream |
|---|-----|------|-------------|-------------|------------|
| 14 | `ops_butler_perf` | Butler Performance | `task_run_events` | extract(768) | `butler_scorecard` |
| 15 | `ops_capture_quality` | Learnings Capture Quality | `session_capture_pairs` | extract(768) | `historian_quality` |
| 16 | `ops_constitutional` | Constitutional Compliance | `session_summaries` | extract(768) | `constitutional_audit` |

**Pass 14 (ops_butler_perf)**: Evaluates butler task execution. Output: `GOAL_MET / EFFICIENCY / OUTPUT_QUALITY / IMPROVEMENT`.

**Pass 15 (ops_capture_quality)**: Compares captured insights vs raw gold summary. Measures historian precision and recall. Output: `PRECISION / RECALL / MISSED / NOISE`.

**Pass 16 (ops_constitutional)**: Checks session compliance against 6 constitutional physics principles (Preserve Determinism, No Discovery at Injection, Respect SOP Integrity, Evidence Over Confidence, Prefer Reversible Actions, Minimalism). Output: `COMPLIANT / PRINCIPLE / EVIDENCE / SEVERITY / RECOMMENDATION`.

---

## Multi-Pass (Mini-Pass) Decomposition

The 4B model excels at narrow, focused tasks but struggles with multi-dimensional evaluation. Multi-pass decomposes complex tasks into N narrow LLM calls + deterministic Python merge.

### Why Multi-Pass?

```
OLD (single-pass, extract_deep 1024 tokens):
  "Score relevance, completeness, freshness, actionability" → ~0% usable output

NEW (multi-pass, 4 × classify 64 tokens + Python merge):
  "Score relevance (0-3)" → "2 mostly relevant"
  "Score completeness (0-3)" → "3 complete"
  "Score freshness (0-3)" → "1 dated"
  "Score actionability (0-3)" → "2 useful"
  Python merge → "TOTAL: 8/12, ISSUE: Weak freshness: dated"
```

### Multi-Pass Architecture

```
Item data → [Sub-pass 1 (LLM)] → result₁
                                    ↓
          → [Sub-pass 2 (LLM)] → result₂  (can reference result₁ in template)
                                    ↓
          → [Sub-pass N (LLM)] → resultₙ
                                    ↓
          → [Python Merge]     → final structured output
```

### Sub-Pass Types

| Type | Description | LLM Call? | Token Budget |
|------|-------------|-----------|-------------|
| **LLM sub-pass** | Narrow query, one question | Yes | classify (64 tokens) |
| **Gate sub-pass** | LLM + early rejection if SKIP/NO | Yes | classify (64 tokens) |
| **Python merge** | Deterministic merge function | No | N/A |

### Gate Sub-Passes

Gate sub-passes have `"is_gate": True`. If the LLM output starts with NO, SKIP, or N/A, the entire item is rejected early — saving all subsequent LLM calls.

### All Multi-Pass Configurations

#### Pass 6: eval_webhook_quality (4 LLM + 1 merge)
```
relevance(classify)  → "2 mostly relevant"
completeness(classify) → "3 complete"
freshness(classify)  → "1 dated"
actionability(classify) → "2 useful"
final(python_merge)  → _merge_webhook_quality → "TOTAL: 8/12\nISSUE: Weak freshness"
```
Merge: Parses 0-3 scores, computes total/12, identifies weakest dimension. Checks `infra_status` for DOWN conditions.

#### Pass 7: eval_success (2 LLM + 1 merge)
```
what_succeeded(classify, GATE) → "Port 5043→5044 migration completed across 7 files"
metric_extract(classify) → "7 files updated"
final(python_merge) → _merge_success_measurement → "SUCCESS: ...\nMETRIC: ...\nCONFIDENCE: 0.8"
```
Merge: Confidence = 0.8 if metric found, 0.5 if qualitative only.

#### Pass 8: eval_failure (3 LLM + 1 merge)
```
what_failed(classify, GATE) → "LLM crashed with SIGABRT from Metal GPU assertion"
impact_extract(classify) → "service down 15 minutes"
root_cause(classify) → "KV cache bloat from concurrent inference"
final(python_merge) → _merge_failure_measurement → "FAILURE: ...\nIMPACT: ...\nROOT_CAUSE: ..."
```

#### Pass 9: intel_bigpicture (4 LLM + 1 merge)
```
goal(classify, GATE) → "Fix webhook injection quality degradation"
planned(classify) → "Audit all 9 sections and fix S2/S8 placeholders"
actual(classify) → "Fixed S2 professor cache, S8 voice restored, ports updated"
drift(classify) → "MINOR got sidetracked into port cleanup"
final(python_merge) → _merge_bigpicture → "GOAL: ...\nDRIFT: MINOR\nRECOMMENDATION: ..."
```
Merge: Drift classification (ALIGNED/MINOR/MAJOR/CRITICAL) drives recommendation.

#### Pass 12: intel_code_artifacts (4 LLM + 1 merge)
```
change_desc(classify, GATE) → "Event bus module for IDE cross-panel communication"
pattern(classify) → "event-driven"
scope(classify) → "CORE"
fragility(classify) → "MEDIUM"
final(python_merge) → _merge_code_artifacts → "SCOPE: CORE\nFRAGILITY: MEDIUM\nREC: Consider..."
```
Merge: CORE+HIGH = auto-generates recommendation. Architectural findings route to holding tank.

---

## LLM Profiles and Token Budgets

All passes use the local Qwen3-4B-4bit via `memory/llm_priority_queue.py`. Profiles control generation parameters:

| Profile | max_tokens | temperature | top_p | Thinking | Use Case |
|---------|-----------|-------------|-------|----------|----------|
| `classify` | 64 | 0.2 | 0.9 | OFF (/no_think enforced) | Yes/no classification, one-word answers, single scores |
| `extract` | 768 | 0.3 | 0.9 | OFF | Structured SOP extraction |
| `extract_deep` | 1024 | 0.4 | 0.9 | OFF | Complex evaluation, quality audits |
| `voice` | 256 | 0.6 | 0.85 | OFF | Synaptic voice generation |
| `deep` | 2048 | 0.5 | 0.95 | ON | Full session analysis (Phase 2) |

### Thinking Mode Control

- `classify` profile: Thinking is **always OFF** (`/no_think` prefix enforced). Prevents wasted KV cache on trivial decisions.
- `deep` profile: Thinking is **always ON**. Used for complex reasoning like full session analysis.
- All other profiles: Thinking OFF by default.

### Content Truncation Guards

| Data Source | Max Content | Rationale |
|-------------|-------------|-----------|
| `gold_segments` | 20,000 chars | Benchmarked optimal for 4B narrow tasks |
| All other sources | 3,000 chars | ~750 tokens, safe for standard templates |

Applied to fields: `content`, `gold_text`, `code`, `statement`.

---

## Critical Findings Pipeline

Two-stage pipeline prevents false positive criticals from flooding the system.

### Stage 1: Holding Tank

Any pass can append a `CRITICAL:` line to its output. If detected (after false-positive filtering), the finding goes to `critical_holding_tank` — NOT directly promoted.

**False-positive filters**: "no critical", "none", "n/a", "not critical", "no issues", "only critical", "would be", "most", "no system", "not applicable", "no data loss", "non-critical".

### Stage 2: LLM Evaluation

Separate scheduled job (`evaluate_critical_holding_tank`) runs LLM verification:

- **Infrastructure criticals**: "Could this cause DATA LOSS, SYSTEM CRASH, or SILENT CORRUPTION?"
- **Architectural criticals**: "Is this STRUCTURALLY SIGNIFICANT — core pattern, cascading dependency?"

Only LLM-confirmed findings get **promoted** to:
1. `critical_findings` table (SQLite)
2. Redis list `contextdna:critical:recent` (fast webhook access, 24h TTL)
3. Big picture tracker (`strategic_plans.db`)
4. Anticipation engine (wired_to_anticipation flag)

### Webhook Infrastructure Audit (No LLM)

Programmatic probes that bypass the LLM entirely. Infrastructure-down is objectively verifiable.

**10 probes**:
1. `scheduler_alive` — pgrep for scheduler process
2. `llm_alive` — pgrep for mlx_lm
3. `agent_service_reachable` — HTTP health check port 8080
4. `contextdna_reachable` — HTTP health check port 8029
5. `redis_reachable` — Redis ping port 6379
6. `anticipation_keys_exist` — Redis keys `contextdna:anticipation:*`
7. `s1_cache_not_empty_hash` — Check for MD5-of-empty-string
8. `postgres_context_dna` — TCP check port 5432
9. `docker_running` — `docker info` command
10. (Internal: cascade dependency chain validation)

Critical infrastructure failures auto-promote directly (skip holding tank). Passed probes auto-clear their stale critical findings.

---

## Scheduler Integration

### Job Timing

| Job | Interval | Budget | What It Does |
|-----|----------|--------|-------------|
| `session_historian_fast` | 120s (2 min) | 15s | Extract active sessions + segment + growth-based re-analysis trigger |
| `session_historian` | 900s (15 min) | 120s | Full pipeline: extract + LLM analyze + segment + evidence feed + cleanup |
| `session_gold_mining` | 180s (3 min) | 300s | Rotate 4 of 16 passes + evaluate holding tank + infra audit |

### Gold Mining Rotation

Each cycle runs 4 passes in round-robin order (sorted by pass ID 1-16):

```
Cycle 0: passes 1-4   (sop_bugfix, sop_pattern, sop_antipattern, sop_architecture)
Cycle 1: passes 5-8   (eval_sop_quality, eval_webhook_quality, eval_success, eval_failure)
Cycle 2: passes 9-12  (intel_bigpicture, intel_crosssession, intel_feedback_loops, intel_code_artifacts)
Cycle 3: passes 13-16 (intel_evidence_quality, ops_butler_perf, ops_capture_quality, ops_constitutional)
→ Full rotation: ~12 minutes (4 cycles × 3 min)
```

Each pass processes up to **20 items per cycle**. At ~2-5 seconds per LLM call, a pass processing 20 segments takes ~40-100s.

### Redis Lock

Gold mining acquires `contextdna:pass_runner:active` Redis lock. Anticipation engine defers while lock is held (prevents LLM contention on single-threaded mlx_lm.server).

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  Claude Code Session (VS Code)               │
│                     .jsonl (11MB+)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   Fast (2min)     Full (15min)    On Close
   extract only    extract+LLM     cleanup
          │              │
          ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  session_archive.db                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ archived_     │  │ gold_        │  │ session_     │      │
│  │ sessions      │  │ segments     │  │ insights     │      │
│  │               │  │              │  │              │      │
│  │ gold_text     │  │ ~20K chars   │  │ typed rows   │      │
│  │ (up to 80K)   │  │ per segment  │  │ from LLM     │      │
│  │ summary       │  │ USER: bound- │  │ analysis     │      │
│  │ score         │  │ ary split    │  │              │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         │    ┌────────────┼──────────────────┘               │
│         │    │            │                                   │
└─────────┼────┼────────────┼─────────────────────────────────┘
          │    │            │
          ▼    ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│  16-Pass Gold Mining (Qwen3-4B-4bit, every 3 min)           │
│                                                              │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ T1: SOP │ │ T2: Eval │ │ T3:Intel │ │ T4: Ops  │       │
│  │ 1-4     │ │ 5-8      │ │ 9-13     │ │ 14-16    │       │
│  │         │ │          │ │          │ │          │       │
│  │ gold_   │ │ gold_seg │ │ gold_seg │ │ task_run │       │
│  │ segments│ │ +inj_out │ │ +code_   │ │ +session │       │
│  │         │ │ +sops    │ │  artif.  │ │  _summ.  │       │
│  │ classify│ │ multi-   │ │ +claims  │ │ extract  │       │
│  │ →extract│ │ pass     │ │ multi-   │ │          │       │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │           │            │             │              │
└───────┼───────────┼────────────┼─────────────┼──────────────┘
        │           │            │             │
        ▼           ▼            ▼             ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ SQLite   │ │ Outcome  │ │ Big      │ │ Butler   │
  │ Learnings│ │ Events   │ │ Picture  │ │ Scorecard│
  │ (SOPs)   │ │ (+Redis) │ │ Plans    │ │ Quality  │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
        │                         │
        ▼                         ▼
  ┌────────────────────────────────────┐
  │ Webhook S1 Foundation (SOPs)       │
  │ Webhook S0 (Architectural alerts)  │
  │ Anticipation Engine (Redis cache)  │
  └────────────────────────────────────┘
```

---

## Anti-Miswiring Rules

### NEVER DO

1. **NEVER change a pass's `data_source` without verifying the fetcher exists and template variables match.** The fetcher (`_fetch_{data_source}`) returns specific dict keys. The pass templates reference `{content}`, `{insight_type}`, `{file_path}`, etc. A mismatch causes silent `KeyError` → empty results.

2. **NEVER run multi-pass sub-passes in parallel.** Later sub-passes reference earlier results via `{what_succeeded}`, `{goal}`, etc. The pipeline is strictly sequential within each item.

3. **NEVER skip the classify gate for gold_segment passes.** Segments are ~20K chars. Without classification, every segment goes to extract (768+ tokens) — 10x more expensive and produces garbage for non-matching segments.

4. **NEVER increase `MAX_CONTENT_CHARS` for non-segment sources above 3000.** The 4B model degrades rapidly with large inputs when using non-segment data sources (code artifacts, claims, task events). These have smaller, focused content by design.

5. **NEVER set gold_segment `MAX_CONTENT_CHARS` below 16000 or above 28000.** Below 16K loses context quality. Above 28K causes formatting degradation and hallucination.

6. **NEVER modify merge functions to make LLM calls.** Merge functions MUST be deterministic Python-only. They parse sub-pass results and produce structured output. LLM in merge = unpredictable, unauditable output.

7. **NEVER bypass the critical findings holding tank** (except for programmatic infrastructure probes). All LLM-generated `CRITICAL:` findings MUST go through Stage 1 (hold) → Stage 2 (LLM verify) → promotion.

8. **NEVER run `session_gold_mining` and `anticipation_engine` simultaneously.** The Redis lock `contextdna:pass_runner:active` exists to prevent LLM contention. The mlx_lm.server serializes inference on a single generation thread — concurrent requests cause queue backup and timeout.

9. **NEVER delete `gold_segments` rows.** Once created, segments are the permanent rich input for all Tier 1 and select Tier 2/3 passes. Deleting them means passes have no data to process.

10. **NEVER allow `gold_text` to exceed 80K chars without truncation.** The Phase 2 LLM analysis has a hard cap (`MAX_LLM_INPUT_CHARS = 80000`). Segmentation handles overflow gracefully, but raw `gold_text` must not cause OOM.

### Data Source → Pass Mapping (Invariant as of 2026-02-16)

```
gold_segments (7 passes):
  sop_bugfix, sop_pattern, sop_antipattern, sop_architecture,
  eval_success, eval_failure, intel_bigpicture

existing_sops (1):           eval_sop_quality
injection_outcomes (2):      eval_webhook_quality, intel_feedback_loops
code_artifacts (1):          intel_code_artifacts
insight_clusters (1):        intel_crosssession
claims (1):                  intel_evidence_quality
task_run_events (1):         ops_butler_perf
session_capture_pairs (1):   ops_capture_quality
session_summaries (1):       ops_constitutional
```

### Why These 9 Passes Don't Use Gold Segments

| Pass | Data Source | Reason |
|------|-----------|--------|
| eval_sop_quality | existing_sops | Audits already-extracted SOPs for quality scoring |
| eval_webhook_quality | injection_outcomes | Needs actual injection→outcome pairs |
| intel_crosssession | insight_clusters | Cross-session clustering requires aggregated data from multiple sessions |
| intel_feedback_loops | injection_outcomes | Needs injection+outcome pairs to detect feedback gaps |
| intel_code_artifacts | code_artifacts | Needs actual code snippets with file paths |
| intel_evidence_quality | claims | Audits claim objects with evidence grades |
| ops_butler_perf | task_run_events | Audits task execution records |
| ops_capture_quality | session_capture_pairs | Deliberately compares gold_text vs insights (comparison) |
| ops_constitutional | session_summaries | Needs session-level overview for constitutional audit |

---

## Database Schema Reference

### `archived_sessions`
```sql
session_id TEXT PRIMARY KEY, project TEXT, extracted_at TEXT, session_date TEXT,
raw_size_mb REAL, gold_size_kb REAL, user_messages INTEGER, assistant_messages INTEGER,
subagent_count INTEGER, gold_text TEXT, llm_summary TEXT, llm_insights TEXT,
llm_analyzed_at TEXT,  -- NULL = needs (re-)analysis
usefulness_score REAL, key_topics TEXT, raw_deleted INTEGER DEFAULT 0,
code_artifact_count INTEGER, embedding_vector BLOB, project_tag TEXT
```

### `gold_segments`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
session_id TEXT NOT NULL, segment_index INTEGER NOT NULL,
segment_text TEXT NOT NULL,
char_offset_start INTEGER NOT NULL, char_offset_end INTEGER NOT NULL,
user_turns INTEGER DEFAULT 0, atlas_turns INTEGER DEFAULT 0,
created_at TEXT NOT NULL, gold_text_size_at_creation INTEGER NOT NULL,
UNIQUE(session_id, segment_index)
```

### `session_insights`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
session_id TEXT, insight_type TEXT, content TEXT,
confidence REAL, created_at TEXT, fed_to_pipeline INTEGER
```

### `pass_processing_log`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
pass_id TEXT NOT NULL, item_id TEXT NOT NULL, item_type TEXT NOT NULL,
processed_at TEXT NOT NULL, verdict TEXT,
extracted_content TEXT, critical_finding TEXT, downstream_action TEXT
```

### `critical_holding_tank`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
pass_id TEXT NOT NULL, finding TEXT NOT NULL,
session_id TEXT, item_id TEXT, source_content TEXT, found_at TEXT,
evaluated INTEGER DEFAULT 0, is_real_critical INTEGER,
evaluation_reason TEXT, evaluated_at TEXT
```

### `critical_findings`
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
pass_id TEXT, finding TEXT, severity TEXT, session_id TEXT,
item_id TEXT, found_at TEXT,
acknowledged INTEGER DEFAULT 0, acknowledged_at TEXT, action_taken TEXT,
wired_to_anticipation INTEGER DEFAULT 0, wired_to_bigpicture INTEGER DEFAULT 0,
promoted_from_tank INTEGER DEFAULT 0
```

---

## Evolution History

### 2026-02-16: Gold Segments + Multi-Pass Maturity
- **7 passes on gold_segments** (was 0): sop_*, eval_success, eval_failure, intel_bigpicture
- Near-real-time segmentation in fast historian (2-min cycle)
- Growth-based re-analysis trigger (30% growth OR 3+ messages)
- Quality proof: "Work completed successfully" → actual metrics with file paths

### 2026-02-15: Multi-Pass Decomposition + 4B Benchmarking
- 5 passes decomposed into multi-pass: eval_webhook(4), eval_success(3), eval_failure(3), intel_bigpicture(5), intel_code_artifacts(4)
- Benchmarked 4B at different input sizes → 16K-24K sweet spot identified
- Gold segment table created, TARGET_SEGMENT_CHARS = 20000

### 2026-02-14: Session Historian Fast Cycle
- Added `run_active_only()` for 2-minute near-real-time extraction
- Incremental gold_text append with `--- [incremental extract] ---` markers
- Event-driven cleanup of dead sessions

### 2026-02-13: 16-Pass Architecture
- Initial 16-pass registry with Tier 1-4 organization
- Single-pass extraction for all passes
- Critical findings holding tank with LLM verification
- Webhook infrastructure probes (programmatic, no LLM)

### Earlier: Foundation
- Session historian with Phase 1 (extract) + Phase 2 (LLM analyze) + Phase 4 (cleanup)
- Evidence pipeline integration
- Priority queue with profiles (classify/extract/deep)
- LLM priority queue with butler_query interface
