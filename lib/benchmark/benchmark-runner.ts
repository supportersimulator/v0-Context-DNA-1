'use client';

// =============================================================================
// BenchmarkRunner — Client-side LLM performance measurement service
// =============================================================================
//
// Runs standardized benchmark suites against local LLM endpoints (OpenAI-
// compatible /v1/chat/completions) and produces structured BenchmarkSnapshot
// objects suitable for storage in ConfigCacheStore and community sharing.
//
// Suites:
//   TTFT_SHORT    — 3 prompt lengths (128/512/2048 in), 64 out. Measures TTFT + tok/s.
//   SUSTAINED     — 512 in, 512 out. Measures steady-state decode throughput.
//   LONG_CONTEXT  — 8k in, 128 out. Measures context ingestion cost.
//
// Usage:
//   const runner = new BenchmarkRunner('http://127.0.0.1:5044/v1');
//   const snapshot = await runner.runDynoSuite('TTFT_SHORT');
//
// React:
//   const { run, running, progress, snapshot, error } = useBenchmarkRunner();
// =============================================================================

import { useState, useCallback, useRef } from 'react';
import type { BenchmarkSnapshot } from '@/lib/cache/config-cache';
import { getServiceUrl } from '@/lib/ide/service-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TTFTResult {
  ttft_ms: number;
  total_ms: number;
  tokens_generated: number;
  tok_s: number;
}

export interface ThroughputResult {
  ttft_ms: number;
  total_ms: number;
  tokens_generated: number;
  decode_tok_s: number;
  /** Decode speed excluding TTFT overhead */
  decode_only_tok_s: number;
}

interface TrialResults {
  ttft_ms: number[];
  total_ms: number[];
  tokens: number[];
  tok_s: number[];
  decode_only_tok_s: number[];
}

interface SuiteProbe {
  prompt: string;
  label: string;
  max_tokens: number;
  /** Expected approximate input token count (for reporting) */
  approx_input_tokens: number;
}

interface ModelInfo {
  id: string;
  runtime: string;
  quantization: string;
}

export interface BenchmarkProgress {
  suite: string;
  phase: string;
  current: number;
  total: number;
  /** 0-1 overall progress */
  pct: number;
}

// ---------------------------------------------------------------------------
// Constants — Standard suite prompts
// ---------------------------------------------------------------------------

const PROMPTS = {
  SHORT_128: `Write a Python function that checks if a number is prime. Include type hints and a docstring.`,

  MEDIUM_512: `Implement a complete binary search tree (BST) in Python with the following operations:
1. insert(value) - Insert a new value
2. delete(value) - Delete a value (handle all cases: leaf, one child, two children)
3. search(value) - Return True/False
4. inorder() - Return values in sorted order
5. height() - Return the height of the tree

Use proper type hints, docstrings, and handle edge cases. Include a Node dataclass.`,

  LONG_2048: `You are a senior software architect. Design a complete microservices architecture for a real-time collaborative document editor (similar to Google Docs). Address the following in detail:

1. Service decomposition: What microservices do you need? Define the responsibility of each service, its API surface, and the data it owns.

2. Real-time collaboration protocol: How do you handle concurrent edits? Compare OT (Operational Transformation) vs CRDT approaches. Which would you choose and why? Show the data structures involved.

3. Consistency model: How do you ensure eventual consistency across replicas? What happens when a user goes offline and comes back with local changes? Describe the conflict resolution strategy.

4. Event architecture: Design the event bus / message queue topology. Which events flow between services? Show the event schema for at least 3 critical events (document.edit, cursor.move, presence.update).

5. Storage layer: What databases do you use for each service? Justify your choices. How do you handle document versioning and history (undo/redo across sessions)?

6. Scaling strategy: How does each service scale? What are the bottlenecks? How do you handle a document with 1000 concurrent editors vs 1 million documents with 2-3 editors each?

7. Security: Authentication flow, authorization model (document-level permissions, sharing), rate limiting, and input validation for rich text operations.

8. Deployment: Kubernetes manifests or Docker Compose for local dev. CI/CD pipeline. Blue-green or canary deployment strategy for zero-downtime updates.

Provide code snippets in TypeScript or Python where appropriate. Focus on production-readiness, not toy examples.`,

  SUSTAINED_512: `Write a comprehensive REST API in Python using FastAPI for a task management system. Include:

1. Models: Task (id, title, description, status, priority, due_date, created_at, updated_at, assignee_id), User (id, username, email, role)
2. CRUD endpoints for both models with proper HTTP methods and status codes
3. Query parameters for filtering tasks by status, priority, assignee, and date range
4. Pagination with limit/offset
5. Input validation with Pydantic models (create/update schemas separate from response schemas)
6. Error handling middleware with proper error response format
7. Authentication decorator (JWT-based, mock the verification)
8. Rate limiting middleware
9. Database session management (SQLAlchemy async)
10. Comprehensive docstrings and OpenAPI metadata

Make it production-ready with proper typing, error handling, and following REST conventions.`,

  LONG_CONTEXT_8K: `You are an expert code reviewer. Below is a large Python module that implements a distributed task queue system. Review it thoroughly for bugs, performance issues, security vulnerabilities, and architectural problems. Provide specific, actionable feedback.

\`\`\`python
import asyncio
import json
import time
import hashlib
import hmac
import logging
import os
import signal
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from datetime import datetime, timedelta
import aiohttp
import aioredis
import psycopg2
from psycopg2 import pool as pg_pool

logger = logging.getLogger(__name__)

class TaskStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"

class TaskPriority(Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3

@dataclass
class TaskConfig:
    max_retries: int = 3
    retry_delay_seconds: float = 5.0
    timeout_seconds: float = 300.0
    priority: TaskPriority = TaskPriority.NORMAL
    queue_name: str = "default"
    unique_key: Optional[str] = None
    depends_on: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Task:
    id: str
    name: str
    payload: Dict[str, Any]
    config: TaskConfig
    status: TaskStatus = TaskStatus.PENDING
    attempts: int = 0
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    worker_id: Optional[str] = None
    parent_id: Optional[str] = None
    children_ids: List[str] = field(default_factory=list)

class TaskRegistry:
    def __init__(self):
        self._handlers: Dict[str, Callable] = {}
        self._middleware: List[Callable] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def register(self, name: str, handler: Callable, **kwargs) -> None:
        if name in self._handlers:
            logger.warning(f"Overwriting handler for task: {name}")
        self._handlers[name] = handler

    def get_handler(self, name: str) -> Optional[Callable]:
        return self._handlers.get(name)

    def add_middleware(self, middleware: Callable) -> None:
        self._middleware.append(middleware)

    def add_hook(self, event: str, callback: Callable) -> None:
        self._hooks[event].append(callback)

    async def fire_hooks(self, event: str, task: Task) -> None:
        for hook in self._hooks.get(event, []):
            try:
                await hook(task)
            except Exception as e:
                logger.error(f"Hook error for {event}: {e}")

class RedisBackend:
    def __init__(self, url: str = "redis://localhost:6379"):
        self.url = url
        self.redis = None
        self._lock_scripts = {}

    async def connect(self):
        self.redis = await aioredis.from_url(self.url, decode_responses=True)
        self._register_scripts()

    def _register_scripts(self):
        self._lock_scripts['acquire'] = self.redis.register_script(
            "if redis.call('setnx', KEYS[1], ARGV[1]) == 1 then "
            "redis.call('expire', KEYS[1], ARGV[2]) return 1 end return 0"
        )
        self._lock_scripts['release'] = self.redis.register_script(
            "if redis.call('get', KEYS[1]) == ARGV[1] then "
            "return redis.call('del', KEYS[1]) end return 0"
        )

    async def enqueue(self, task: Task) -> None:
        pipe = self.redis.pipeline()
        task_key = f"task:{task.id}"
        queue_key = f"queue:{task.config.queue_name}"
        pipe.hset(task_key, mapping={
            "id": task.id,
            "name": task.name,
            "payload": json.dumps(task.payload),
            "config": json.dumps({
                "max_retries": task.config.max_retries,
                "retry_delay_seconds": task.config.retry_delay_seconds,
                "timeout_seconds": task.config.timeout_seconds,
                "priority": task.config.priority.value,
                "queue_name": task.config.queue_name,
            }),
            "status": task.status.value,
            "attempts": task.attempts,
            "created_at": task.created_at,
        })
        pipe.zadd(queue_key, {task.id: task.config.priority.value})
        if task.config.unique_key:
            pipe.set(f"unique:{task.config.unique_key}", task.id, ex=86400)
        await pipe.execute()

    async def dequeue(self, queue_name: str, worker_id: str) -> Optional[Task]:
        queue_key = f"queue:{queue_name}"
        result = await self.redis.zpopmax(queue_key)
        if not result:
            return None
        task_id = result[0][0] if isinstance(result[0], tuple) else result[0]
        task_data = await self.redis.hgetall(f"task:{task_id}")
        if not task_data:
            return None
        config_data = json.loads(task_data.get("config", "{}"))
        task = Task(
            id=task_data["id"],
            name=task_data["name"],
            payload=json.loads(task_data.get("payload", "{}")),
            config=TaskConfig(
                max_retries=config_data.get("max_retries", 3),
                retry_delay_seconds=config_data.get("retry_delay_seconds", 5.0),
                timeout_seconds=config_data.get("timeout_seconds", 300.0),
                priority=TaskPriority(config_data.get("priority", 1)),
                queue_name=config_data.get("queue_name", "default"),
            ),
            status=TaskStatus.RUNNING,
            attempts=int(task_data.get("attempts", 0)) + 1,
            created_at=float(task_data.get("created_at", time.time())),
            started_at=time.time(),
            worker_id=worker_id,
        )
        await self.redis.hset(f"task:{task_id}", mapping={
            "status": TaskStatus.RUNNING.value,
            "attempts": task.attempts,
            "started_at": task.started_at,
            "worker_id": worker_id,
        })
        return task

    async def complete(self, task: Task, result: Any = None) -> None:
        task.status = TaskStatus.COMPLETED
        task.completed_at = time.time()
        task.result = result
        await self.redis.hset(f"task:{task.id}", mapping={
            "status": TaskStatus.COMPLETED.value,
            "completed_at": task.completed_at,
            "result": json.dumps(result) if result else "",
        })
        await self.redis.expire(f"task:{task.id}", 604800)

    async def fail(self, task: Task, error: str) -> None:
        if task.attempts < task.config.max_retries:
            task.status = TaskStatus.RETRYING
            delay = task.config.retry_delay_seconds * (2 ** (task.attempts - 1))
            await asyncio.sleep(delay)
            task.status = TaskStatus.QUEUED
            await self.enqueue(task)
        else:
            task.status = TaskStatus.FAILED
            task.error = error
            task.completed_at = time.time()
            await self.redis.hset(f"task:{task.id}", mapping={
                "status": TaskStatus.FAILED.value,
                "error": error,
                "completed_at": task.completed_at,
            })

    async def acquire_lock(self, name: str, owner: str, ttl: int = 30) -> bool:
        return await self._lock_scripts['acquire'](
            keys=[f"lock:{name}"], args=[owner, ttl]
        )

    async def release_lock(self, name: str, owner: str) -> bool:
        return await self._lock_scripts['release'](
            keys=[f"lock:{name}"], args=[owner]
        )

    async def get_queue_depth(self, queue_name: str) -> int:
        return await self.redis.zcard(f"queue:{queue_name}")

class PostgresStorage:
    def __init__(self, dsn: str):
        self.pool = pg_pool.ThreadedConnectionPool(1, 10, dsn)

    def store_task(self, task: Task) -> None:
        conn = self.pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO tasks (id, name, payload, status, priority, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET status = %s, attempts = %s",
                (task.id, task.name, json.dumps(task.payload),
                 task.status.value, task.config.priority.value,
                 datetime.fromtimestamp(task.created_at),
                 task.status.value, task.attempts)
            )
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise
        finally:
            self.pool.putconn(conn)

    def get_task_history(self, task_id: str) -> List[Dict]:
        conn = self.pool.getconn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT * FROM task_history WHERE task_id = %s ORDER BY created_at DESC",
                (task_id,)
            )
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in cur.fetchall()]
        finally:
            self.pool.putconn(conn)

    def get_metrics(self, queue_name: str, hours: int = 24) -> Dict:
        conn = self.pool.getconn()
        try:
            cur = conn.cursor()
            since = datetime.now() - timedelta(hours=hours)
            cur.execute(
                "SELECT status, COUNT(*) as count, AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration "
                "FROM tasks WHERE queue_name = %s AND created_at > %s GROUP BY status",
                (queue_name, since)
            )
            rows = cur.fetchall()
            return {
                "total": sum(r[1] for r in rows),
                "by_status": {r[0]: {"count": r[1], "avg_duration": r[2]} for r in rows}
            }
        finally:
            self.pool.putconn(conn)

class Worker:
    def __init__(self, worker_id: str, registry: TaskRegistry,
                 backend: RedisBackend, storage: Optional[PostgresStorage] = None,
                 queues: Optional[List[str]] = None, concurrency: int = 10):
        self.worker_id = worker_id
        self.registry = registry
        self.backend = backend
        self.storage = storage
        self.queues = queues or ["default"]
        self.concurrency = concurrency
        self._running = False
        self._semaphore = asyncio.Semaphore(concurrency)
        self._active_tasks: Set[str] = set()
        self._shutdown_event = asyncio.Event()

    async def start(self):
        self._running = True
        logger.info(f"Worker {self.worker_id} starting (queues={self.queues}, concurrency={self.concurrency})")

        tasks = []
        for queue in self.queues:
            for _ in range(self.concurrency):
                tasks.append(asyncio.create_task(self._poll_loop(queue)))

        signal.signal(signal.SIGTERM, lambda *_: self._shutdown())
        signal.signal(signal.SIGINT, lambda *_: self._shutdown())

        await self._shutdown_event.wait()
        self._running = False
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"Worker {self.worker_id} stopped")

    def _shutdown(self):
        logger.info(f"Worker {self.worker_id} shutting down gracefully...")
        self._shutdown_event.set()

    async def _poll_loop(self, queue_name: str):
        while self._running:
            try:
                async with self._semaphore:
                    task = await self.backend.dequeue(queue_name, self.worker_id)
                    if task:
                        self._active_tasks.add(task.id)
                        try:
                            await self._execute(task)
                        finally:
                            self._active_tasks.discard(task.id)
                    else:
                        await asyncio.sleep(1)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Poll loop error: {e}")
                await asyncio.sleep(5)

    async def _execute(self, task: Task) -> None:
        handler = self.registry.get_handler(task.name)
        if not handler:
            await self.backend.fail(task, f"No handler registered for: {task.name}")
            return

        await self.registry.fire_hooks("task.started", task)

        try:
            result = await asyncio.wait_for(
                handler(task.payload, task),
                timeout=task.config.timeout_seconds
            )
            await self.backend.complete(task, result)
            await self.registry.fire_hooks("task.completed", task)

            if self.storage:
                self.storage.store_task(task)

        except asyncio.TimeoutError:
            task.status = TaskStatus.TIMEOUT
            await self.backend.fail(task, "Task execution timed out")
            await self.registry.fire_hooks("task.timeout", task)

        except Exception as e:
            logger.error(f"Task {task.id} ({task.name}) failed: {e}")
            await self.backend.fail(task, str(e))
            await self.registry.fire_hooks("task.failed", task)

            if self.storage:
                self.storage.store_task(task)

class TaskQueue:
    def __init__(self, backend: RedisBackend, registry: TaskRegistry,
                 storage: Optional[PostgresStorage] = None,
                 webhook_url: Optional[str] = None,
                 webhook_secret: Optional[str] = None):
        self.backend = backend
        self.registry = registry
        self.storage = storage
        self.webhook_url = webhook_url
        self.webhook_secret = webhook_secret

    async def submit(self, name: str, payload: Dict[str, Any],
                     config: Optional[TaskConfig] = None) -> Task:
        config = config or TaskConfig()

        if config.unique_key:
            existing = await self.backend.redis.get(f"unique:{config.unique_key}")
            if existing:
                raise ValueError(f"Duplicate task with unique key: {config.unique_key}")

        task = Task(
            id=hashlib.sha256(f"{name}:{time.time()}:{os.urandom(16).hex()}".encode()).hexdigest()[:32],
            name=name,
            payload=payload,
            config=config,
        )

        if config.depends_on:
            for dep_id in config.depends_on:
                dep_data = await self.backend.redis.hgetall(f"task:{dep_id}")
                if dep_data and dep_data.get("status") != TaskStatus.COMPLETED.value:
                    task.status = TaskStatus.PENDING
                    await self.backend.redis.hset(f"task:{task.id}", mapping={
                        "id": task.id, "status": TaskStatus.PENDING.value,
                        "depends_on": json.dumps(config.depends_on),
                    })
                    return task

        await self.backend.enqueue(task)

        if self.storage:
            self.storage.store_task(task)

        if self.webhook_url:
            await self._send_webhook("task.created", task)

        return task

    async def _send_webhook(self, event: str, task: Task) -> None:
        payload = json.dumps({"event": event, "task_id": task.id, "name": task.name, "status": task.status.value})
        headers = {"Content-Type": "application/json"}
        if self.webhook_secret:
            sig = hmac.new(self.webhook_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
            headers["X-Signature"] = sig
        try:
            async with aiohttp.ClientSession() as session:
                await session.post(self.webhook_url, data=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=10))
        except Exception as e:
            logger.error(f"Webhook failed: {e}")
\`\`\`

Provide your review organized by severity: Critical (must fix before production), High (significant impact), Medium (code quality / maintainability), Low (style / minor improvements). For each issue, cite the specific line or function, explain the problem, and provide a corrected code snippet.`,
} as const;

// ---------------------------------------------------------------------------
// Suite definitions
// ---------------------------------------------------------------------------

const SUITES: Record<string, { label: string; probes: SuiteProbe[]; runs_per_probe: number }> = {
  TTFT_SHORT: {
    label: 'TTFT + Short Generation',
    probes: [
      { prompt: PROMPTS.SHORT_128, label: '128-tok input', max_tokens: 64, approx_input_tokens: 128 },
      { prompt: PROMPTS.MEDIUM_512, label: '512-tok input', max_tokens: 64, approx_input_tokens: 512 },
      { prompt: PROMPTS.LONG_2048, label: '2048-tok input', max_tokens: 64, approx_input_tokens: 2048 },
    ],
    runs_per_probe: 3,
  },
  SUSTAINED: {
    label: 'Sustained Throughput',
    probes: [
      { prompt: PROMPTS.SUSTAINED_512, label: '512-tok sustained', max_tokens: 512, approx_input_tokens: 512 },
    ],
    runs_per_probe: 3,
  },
  LONG_CONTEXT: {
    label: 'Long Context Ingestion',
    probes: [
      { prompt: PROMPTS.LONG_CONTEXT_8K, label: '8k-tok context', max_tokens: 128, approx_input_tokens: 8192 },
    ],
    runs_per_probe: 3,
  },
};

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function sortedCopy(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ---------------------------------------------------------------------------
// SHA-256 hashing via crypto.subtle
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Environment detection (client-side, non-identifying)
// ---------------------------------------------------------------------------

interface MachineProfile {
  os: string;
  chip_family: string;
  ram_total_gb: number;
  power_mode: string;
}

function detectMachineProfile(): MachineProfile {
  if (typeof navigator === 'undefined') {
    return { os: 'unknown', chip_family: 'unknown', ram_total_gb: 0, power_mode: 'unknown' };
  }

  // OS detection
  const ua = navigator.userAgent || '';
  let os = 'unknown';
  if (/Mac/i.test(ua)) os = 'macOS';
  else if (/Win/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';

  // Chip family — navigator.userAgent on macOS contains arch hints.
  // navigator.hardwareConcurrency gives core count (useful for hash, not identifying).
  let chip_family = 'unknown';
  if (/Mac/i.test(ua)) {
    // Apple Silicon detection via platform or GPU heuristics
    const platform: string = navigator.platform || '';
    if (/arm/i.test(platform) || /aarch64/i.test(ua)) {
      chip_family = 'Apple Silicon';
    } else {
      // Likely Intel Mac or undetermined
      chip_family = 'Apple x86';
    }
  } else if (/Win/i.test(ua)) {
    if (/ARM/i.test(ua)) chip_family = 'ARM';
    else chip_family = 'x86_64';
  } else if (/Linux/i.test(ua)) {
    if (/aarch64|arm/i.test(ua)) chip_family = 'ARM';
    else chip_family = 'x86_64';
  }

  // RAM — navigator.deviceMemory (Chrome/Edge only, privacy-capped at 8)
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const ram_total_gb = deviceMemory ?? 0;

  // Power mode — not reliably detectable client-side; default to 'unknown'
  // The battery API is deprecated/limited. We report what we can.
  const power_mode = 'unknown';

  return { os, chip_family, ram_total_gb, power_mode };
}

// ---------------------------------------------------------------------------
// BenchmarkRunner
// ---------------------------------------------------------------------------

export class BenchmarkRunner {
  private readonly baseUrl: string;
  private abortController: AbortController | null = null;

  /**
   * @param endpoint - OpenAI-compatible base URL, e.g. "http://127.0.0.1:5044/v1"
   *                   Must include the /v1 path segment.
   */
  constructor(endpoint: string) {
    this.baseUrl = endpoint.replace(/\/+$/, '');
  }

  /** Cancel any in-flight benchmark run. */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  // -------------------------------------------------------------------------
  // Model detection
  // -------------------------------------------------------------------------

  /** Detect the first available model from /v1/models. */
  async detectModel(signal?: AbortSignal): Promise<ModelInfo> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { signal });
      if (!res.ok) return { id: 'unknown', runtime: 'unknown', quantization: 'unknown' };

      const json = (await res.json()) as {
        data?: Array<{ id: string; owned_by?: string }>;
      };

      const first = json.data?.[0];
      if (!first) return { id: 'unknown', runtime: 'unknown', quantization: 'unknown' };

      // Heuristic: extract runtime and quantization from model id
      const id = first.id;
      const runtime = this.inferRuntime(id, first.owned_by);
      const quantization = this.inferQuantization(id);

      return { id, runtime, quantization };
    } catch {
      return { id: 'unknown', runtime: 'unknown', quantization: 'unknown' };
    }
  }

  private inferRuntime(modelId: string, ownedBy?: string): string {
    const lower = (modelId + ' ' + (ownedBy ?? '')).toLowerCase();
    if (lower.includes('mlx')) return 'mlx';
    if (lower.includes('vllm')) return 'vllm-mlx';
    if (lower.includes('ollama')) return 'ollama';
    if (lower.includes('llama.cpp') || lower.includes('gguf')) return 'llama.cpp';
    // vLLM-MLX reports as owned_by vllm typically
    if (ownedBy?.toLowerCase().includes('vllm')) return 'vllm-mlx';
    return 'unknown';
  }

  private inferQuantization(modelId: string): string {
    const lower = modelId.toLowerCase();
    // Common quantization patterns
    const patterns = [
      /(\d+bit)/i,
      /(q[2-8]_[kms]_?[sml]?)/i,
      /(q[2-8]_\d)/i,
      /(fp16|fp32|bf16)/i,
      /(int[48])/i,
      /(awq|gptq|gguf|ggml)/i,
    ];
    for (const pat of patterns) {
      const match = lower.match(pat);
      if (match) return match[1].toUpperCase();
    }
    // Check for "Xbit" in the model name
    const bitMatch = lower.match(/(\d+)-?bit/);
    if (bitMatch) return `${bitMatch[1]}bit`;
    return 'unknown';
  }

  // -------------------------------------------------------------------------
  // Core measurement: TTFT
  // -------------------------------------------------------------------------

  /**
   * Send a single streaming completion and measure time-to-first-token.
   * Returns both TTFT and total generation metrics.
   */
  async measureTTFT(
    prompt: string,
    maxTokens: number,
    model?: string,
    signal?: AbortSignal,
  ): Promise<TTFTResult> {
    const startMs = performance.now();
    let firstTokenMs = 0;
    let tokenCount = 0;

    const body = JSON.stringify({
      model: model ?? 'default',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.0, // deterministic for benchmarking
      stream: true,
    });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`LLM request failed: ${res.status} ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6)) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              if (tokenCount === 0) {
                firstTokenMs = performance.now();
              }
              tokenCount++;
            }
          } catch {
            // Malformed SSE chunk
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const endMs = performance.now();
    const total_ms = endMs - startMs;
    const ttft_ms = firstTokenMs > 0 ? firstTokenMs - startMs : total_ms;
    const decode_duration_s = (endMs - firstTokenMs) / 1000;
    const tok_s = decode_duration_s > 0 ? tokenCount / decode_duration_s : 0;

    return {
      ttft_ms,
      total_ms,
      tokens_generated: tokenCount,
      tok_s,
    };
  }

  // -------------------------------------------------------------------------
  // Core measurement: Throughput
  // -------------------------------------------------------------------------

  /**
   * Measure sustained decode throughput. Identical to measureTTFT but returns
   * additional decode-only speed (excluding TTFT).
   */
  async measureThroughput(
    prompt: string,
    maxTokens: number,
    model?: string,
    signal?: AbortSignal,
  ): Promise<ThroughputResult> {
    const result = await this.measureTTFT(prompt, maxTokens, model, signal);

    // Decode-only throughput: tokens / time after first token
    const decodeTimeS = (result.total_ms - result.ttft_ms) / 1000;
    const decodeTokens = Math.max(0, result.tokens_generated - 1);
    const decode_only_tok_s = decodeTimeS > 0 ? decodeTokens / decodeTimeS : 0;

    return {
      ttft_ms: result.ttft_ms,
      total_ms: result.total_ms,
      tokens_generated: result.tokens_generated,
      decode_tok_s: result.tok_s,
      decode_only_tok_s,
    };
  }

  // -------------------------------------------------------------------------
  // Machine hash (non-identifying)
  // -------------------------------------------------------------------------

  /** Generate a non-identifying hash of OS + chip family + RAM. */
  async generateMachineHash(): Promise<string> {
    const profile = detectMachineProfile();
    const cores =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 0 : 0;
    const raw = `${profile.os}|${profile.chip_family}|${profile.ram_total_gb}|${cores}`;
    return sha256Hex(raw);
  }

  // -------------------------------------------------------------------------
  // Run hash (deterministic reproducibility proof)
  // -------------------------------------------------------------------------

  /** Generate a deterministic hash over suite + settings + model. */
  async generateRunHash(
    suiteName: string,
    settings: { temperature: number; max_tokens: number[] },
    model: string,
  ): Promise<string> {
    const raw = JSON.stringify({ suite: suiteName, settings, model }, Object.keys({
      suite: '', settings: '', model: '',
    }).sort());
    return sha256Hex(raw);
  }

  // -------------------------------------------------------------------------
  // Run a full suite
  // -------------------------------------------------------------------------

  /**
   * Run a complete benchmark suite and return a BenchmarkSnapshot.
   *
   * @param suiteName - One of 'TTFT_SHORT', 'SUSTAINED', 'LONG_CONTEXT'
   * @param onProgress - Optional callback for progress updates
   */
  async runDynoSuite(
    suiteName: string,
    onProgress?: (progress: BenchmarkProgress) => void,
  ): Promise<BenchmarkSnapshot> {
    const suite = SUITES[suiteName];
    if (!suite) {
      throw new Error(`Unknown suite: ${suiteName}. Available: ${Object.keys(SUITES).join(', ')}`);
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Detect model
    onProgress?.({
      suite: suiteName,
      phase: 'Detecting model...',
      current: 0,
      total: 1,
      pct: 0,
    });

    const modelInfo = await this.detectModel(signal);
    const profile = detectMachineProfile();

    // Collect all trial data
    const allTTFT: number[] = [];
    const allTokS: number[] = [];
    const allDecodeOnlyTokS: number[] = [];
    const allTotalMs: number[] = [];
    const probeResults: Record<string, TrialResults> = {};

    const totalTrials = suite.probes.length * suite.runs_per_probe;
    let completedTrials = 0;

    for (const probe of suite.probes) {
      const trials: TrialResults = {
        ttft_ms: [],
        total_ms: [],
        tokens: [],
        tok_s: [],
        decode_only_tok_s: [],
      };

      for (let run = 0; run < suite.runs_per_probe; run++) {
        if (signal.aborted) throw new DOMException('Benchmark cancelled', 'AbortError');

        onProgress?.({
          suite: suiteName,
          phase: `${probe.label} (run ${run + 1}/${suite.runs_per_probe})`,
          current: completedTrials,
          total: totalTrials,
          pct: completedTrials / totalTrials,
        });

        const result = await this.measureThroughput(
          probe.prompt,
          probe.max_tokens,
          modelInfo.id !== 'unknown' ? modelInfo.id : undefined,
          signal,
        );

        trials.ttft_ms.push(result.ttft_ms);
        trials.total_ms.push(result.total_ms);
        trials.tokens.push(result.tokens_generated);
        trials.tok_s.push(result.decode_tok_s);
        trials.decode_only_tok_s.push(result.decode_only_tok_s);

        allTTFT.push(result.ttft_ms);
        allTokS.push(result.decode_tok_s);
        allDecodeOnlyTokS.push(result.decode_only_tok_s);
        allTotalMs.push(result.total_ms);

        completedTrials++;
      }

      probeResults[probe.label] = trials;
    }

    onProgress?.({
      suite: suiteName,
      phase: 'Computing results...',
      current: totalTrials,
      total: totalTrials,
      pct: 1,
    });

    // Compute aggregate statistics
    const sortedTTFT = sortedCopy(allTTFT);
    const sortedTokS = sortedCopy(allDecodeOnlyTokS);
    const sortedTotalMs = sortedCopy(allTotalMs);

    const machineHash = await this.generateMachineHash();
    const maxTokensArray = suite.probes.map((p) => p.max_tokens);
    const runHash = await this.generateRunHash(
      suiteName,
      { temperature: 0.0, max_tokens: maxTokensArray },
      modelInfo.id,
    );

    // Build per-probe detail for results_json
    const probeDetails: Record<string, unknown> = {};
    for (const probe of suite.probes) {
      const t = probeResults[probe.label];
      probeDetails[probe.label] = {
        approx_input_tokens: probe.approx_input_tokens,
        max_output_tokens: probe.max_tokens,
        runs: suite.runs_per_probe,
        ttft_p50_ms: percentile(sortedCopy(t.ttft_ms), 50),
        ttft_p95_ms: percentile(sortedCopy(t.ttft_ms), 95),
        decode_tok_s_avg: mean(t.decode_only_tok_s),
        decode_tok_s_p95: percentile(sortedCopy(t.decode_only_tok_s), 95),
        total_ms_p50: percentile(sortedCopy(t.total_ms), 50),
        total_ms_p95: percentile(sortedCopy(t.total_ms), 95),
        tokens_generated: t.tokens,
      };
    }

    const snapshot: BenchmarkSnapshot = {
      id: crypto.randomUUID(),
      suite_name: suiteName,
      model: modelInfo.id,
      runtime: modelInfo.runtime,
      quantization: modelInfo.quantization,

      ttft_p50_ms: Math.round(percentile(sortedTTFT, 50) * 100) / 100,
      ttft_p95_ms: Math.round(percentile(sortedTTFT, 95) * 100) / 100,
      decode_tok_s_avg: Math.round(mean(allDecodeOnlyTokS) * 100) / 100,
      decode_tok_s_p95: Math.round(percentile(sortedTokS, 95) * 100) / 100,
      end_to_end_p50_ms: Math.round(percentile(sortedTotalMs, 50) * 100) / 100,
      end_to_end_p95_ms: Math.round(percentile(sortedTotalMs, 95) * 100) / 100,

      machine_profile_hash: machineHash,
      run_hash: runHash,

      power_mode: profile.power_mode,
      os: profile.os,
      chip_family: profile.chip_family,
      ram_total_gb: profile.ram_total_gb,

      results_json: {
        suite_label: suite.label,
        probes: probeDetails,
        total_trials: totalTrials,
        endpoint: this.baseUrl,
      },

      created_at: Date.now(),
      shared: false,
    };

    this.abortController = null;
    return snapshot;
  }
}

// ---------------------------------------------------------------------------
// Available suite metadata (for UI dropdowns)
// ---------------------------------------------------------------------------

export const AVAILABLE_SUITES = Object.entries(SUITES).map(([key, val]) => ({
  id: key,
  label: val.label,
  probes: val.probes.length,
  runsPerProbe: val.runs_per_probe,
  totalTrials: val.probes.length * val.runs_per_probe,
  estimatedTimeMinutes: Math.ceil((val.probes.length * val.runs_per_probe * 15) / 60),
}));

// ---------------------------------------------------------------------------
// React hook: useBenchmarkRunner
// ---------------------------------------------------------------------------

export interface UseBenchmarkRunnerReturn {
  /** Run a benchmark suite. Rejects if already running. */
  run: (suiteName: string, endpoint?: string) => Promise<BenchmarkSnapshot>;
  /** Cancel the current run. */
  cancel: () => void;
  /** Whether a benchmark is currently running. */
  running: boolean;
  /** Progress updates during a run. */
  progress: BenchmarkProgress | null;
  /** Latest completed snapshot (null until first run completes). */
  snapshot: BenchmarkSnapshot | null;
  /** Error from the last run (null if last run succeeded). */
  error: string | null;
}

const DEFAULT_ENDPOINT = (getServiceUrl('local_llm') || 'http://127.0.0.1:5044') + '/v1';

export function useBenchmarkRunner(): UseBenchmarkRunnerReturn {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null);
  const [snapshot, setSnapshot] = useState<BenchmarkSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runnerRef = useRef<BenchmarkRunner | null>(null);

  const cancel = useCallback(() => {
    runnerRef.current?.cancel();
    runnerRef.current = null;
    setRunning(false);
    setProgress(null);
  }, []);

  const run = useCallback(
    async (suiteName: string, endpoint?: string): Promise<BenchmarkSnapshot> => {
      if (running) {
        throw new Error('Benchmark already running. Cancel before starting a new one.');
      }

      const ep = endpoint ?? DEFAULT_ENDPOINT;
      const runner = new BenchmarkRunner(ep);
      runnerRef.current = runner;

      setRunning(true);
      setError(null);
      setProgress(null);

      try {
        const result = await runner.runDynoSuite(suiteName, (p) => {
          setProgress({ ...p });
        });
        setSnapshot(result);
        setRunning(false);
        setProgress(null);
        runnerRef.current = null;
        return result;
      } catch (err) {
        const message =
          err instanceof DOMException && err.name === 'AbortError'
            ? 'Benchmark cancelled'
            : err instanceof Error
              ? err.message
              : 'Unknown benchmark error';
        setError(message);
        setRunning(false);
        setProgress(null);
        runnerRef.current = null;
        throw err;
      }
    },
    [running],
  );

  return { run, cancel, running, progress, snapshot, error };
}
