'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Package,
  Download,
  Star,
  Upload,
  Shield,
  Eye,
  Search,
  X,
  Check,
  ChevronDown,
  AlertTriangle,
  Loader2,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Tag,
  User,
  Layers,
  Clock,
  ImageOff,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PackCategory =
  | 'All'
  | 'Panel Layouts'
  | 'Agent Workflows'
  | 'Webhook Presets'
  | 'Model Settings'
  | 'Prompt Templates';

type SortOption = 'popular' | 'newest' | 'downloads';

interface ConfigPackInclude {
  type: 'panel' | 'setting' | 'template' | 'workflow' | 'webhook';
  name: string;
  description?: string;
}

interface ConfigPack {
  id: string;
  title: string;
  version: string;
  author: string;
  anonymous: boolean;
  description: string;
  longDescription: string;
  category: Exclude<PackCategory, 'All'>;
  tags: string[];
  downloads: number;
  stars: number;
  createdAt: string;
  updatedAt: string;
  includes: ConfigPackInclude[];
  requirements: {
    minVersion: string;
    integrations: string[];
  };
  wouldOverride: string[];
  installed: boolean;
  hasUpdate: boolean;
  installedVersion?: string;
}

// ---------------------------------------------------------------------------
// Mock Data — 8 realistic config packs
// ---------------------------------------------------------------------------

const MOCK_PACKS: ConfigPack[] = [
  {
    id: 'pack-001',
    title: 'DevOps Command Center',
    version: '2.1.0',
    author: 'inframax',
    anonymous: false,
    description:
      'Full DevOps panel layout with CI/CD monitoring, container health, and deployment tracking.',
    longDescription:
      'A comprehensive DevOps dashboard configuration that transforms your Context DNA IDE into a deployment nerve center. Includes pre-configured panels for monitoring CI/CD pipelines, Docker container health, Kubernetes pod status, and deployment rollback controls. Designed for teams running microservice architectures with frequent deployments.',
    category: 'Panel Layouts',
    tags: ['devops', 'ci-cd', 'docker', 'kubernetes', 'monitoring'],
    downloads: 3842,
    stars: 4.7,
    createdAt: '2025-11-15',
    updatedAt: '2026-01-28',
    includes: [
      { type: 'panel', name: 'CI/CD Pipeline Monitor', description: 'Real-time build status tracker' },
      { type: 'panel', name: 'Container Health Grid', description: 'Docker + K8s container overview' },
      { type: 'panel', name: 'Deployment Timeline', description: 'Visual deploy history' },
      { type: 'setting', name: 'Refresh intervals', description: '5s polling for critical panels' },
    ],
    requirements: { minVersion: '1.4.0', integrations: ['Docker', 'GitHub Actions'] },
    wouldOverride: ['panel-layout', 'refresh-intervals'],
    installed: false,
    hasUpdate: false,
  },
  {
    id: 'pack-002',
    title: 'Synaptic Deep Reasoning',
    version: '1.3.2',
    author: 'anonymous',
    anonymous: true,
    description:
      'Agent workflow optimized for multi-step causal reasoning with Qwen3 thinking mode.',
    longDescription:
      'Configures your agent pipeline for deep reasoning tasks. Sets up Synaptic with thinking-mode prompts, adjusts temperature profiles for exploration vs precision, and wires the evidence pipeline for automatic hypothesis tracking. Best for complex debugging sessions and architecture decisions.',
    category: 'Agent Workflows',
    tags: ['reasoning', 'qwen3', 'thinking-mode', 'evidence', 'synaptic'],
    downloads: 2156,
    stars: 4.9,
    createdAt: '2026-01-05',
    updatedAt: '2026-02-03',
    includes: [
      { type: 'workflow', name: 'Deep Reasoning Chain', description: 'Multi-step causal analysis pipeline' },
      { type: 'setting', name: 'LLM Temperature Profiles', description: 'Tuned for reasoning (T=0.6)' },
      { type: 'template', name: 'Hypothesis Tracker Prompt', description: 'Structured hypothesis management' },
    ],
    requirements: { minVersion: '1.5.0', integrations: ['Local LLM (Qwen3)'] },
    wouldOverride: ['llm-profiles', 'agent-workflow'],
    installed: true,
    hasUpdate: false,
    installedVersion: '1.3.2',
  },
  {
    id: 'pack-003',
    title: 'Webhook Security Hardened',
    version: '1.0.4',
    author: 'secops_carl',
    anonymous: false,
    description:
      'Pre-configured webhook presets with HMAC validation, rate limiting, and IP allowlisting.',
    longDescription:
      'Production-grade webhook configuration that adds HMAC signature validation, configurable rate limiting (default 100 req/min), IP allowlist management, and automatic secret rotation reminders. Includes presets for GitHub, GitLab, Slack, and custom webhook sources.',
    category: 'Webhook Presets',
    tags: ['security', 'webhooks', 'hmac', 'rate-limiting', 'production'],
    downloads: 1789,
    stars: 4.5,
    createdAt: '2025-12-20',
    updatedAt: '2026-01-15',
    includes: [
      { type: 'webhook', name: 'GitHub HMAC Validator', description: 'SHA-256 signature verification' },
      { type: 'webhook', name: 'Rate Limiter Middleware', description: '100 req/min default' },
      { type: 'setting', name: 'IP Allowlist Config', description: 'Configurable source restrictions' },
      { type: 'webhook', name: 'Secret Rotation Schedule', description: '30-day rotation reminders' },
    ],
    requirements: { minVersion: '1.3.0', integrations: [] },
    wouldOverride: ['webhook-config'],
    installed: false,
    hasUpdate: false,
  },
  {
    id: 'pack-004',
    title: 'Minimalist Focus Mode',
    version: '3.0.1',
    author: 'zen_dev',
    anonymous: false,
    description:
      'Stripped-down panel layout showing only active task, terminal, and code diff. Zero noise.',
    longDescription:
      'For developers who want maximum focus with minimum distraction. Removes all peripheral panels and shows only three things: your current active task, an integrated terminal, and a code diff viewer. Keyboard shortcuts are reconfigured for rapid task cycling. Inspired by the "scalpel not axe" philosophy.',
    category: 'Panel Layouts',
    tags: ['minimalist', 'focus', 'productivity', 'clean', 'keyboard-first'],
    downloads: 5210,
    stars: 4.8,
    createdAt: '2025-09-10',
    updatedAt: '2026-02-01',
    includes: [
      { type: 'panel', name: 'Active Task Panel', description: 'Single-focus task display' },
      { type: 'panel', name: 'Inline Terminal', description: 'Embedded terminal with auto-scroll' },
      { type: 'panel', name: 'Code Diff Viewer', description: 'Side-by-side diff with syntax highlight' },
      { type: 'setting', name: 'Keyboard Shortcuts', description: 'Vim-inspired rapid navigation' },
    ],
    requirements: { minVersion: '1.2.0', integrations: [] },
    wouldOverride: ['panel-layout', 'keyboard-shortcuts'],
    installed: true,
    hasUpdate: true,
    installedVersion: '2.9.0',
  },
  {
    id: 'pack-005',
    title: 'MLX Apple Silicon Optimizer',
    version: '1.1.0',
    author: 'metalhead',
    anonymous: false,
    description:
      'Model settings tuned for Apple Silicon Metal GPU acceleration. M1/M2/M3/M4 optimized.',
    longDescription:
      'Pre-configured model settings that maximize performance on Apple Silicon hardware. Includes optimized batch sizes for different chip tiers (M1 8GB through M4 Max 128GB), Metal-specific quantization preferences, memory pressure thresholds, and automatic model selection based on available unified memory.',
    category: 'Model Settings',
    tags: ['apple-silicon', 'mlx', 'metal', 'gpu', 'performance', 'optimization'],
    downloads: 2934,
    stars: 4.6,
    createdAt: '2025-12-01',
    updatedAt: '2026-01-20',
    includes: [
      { type: 'setting', name: 'Chip-Tier Batch Sizes', description: 'Auto-detected per M-series chip' },
      { type: 'setting', name: 'Quantization Preferences', description: '4-bit default, 8-bit for >64GB' },
      { type: 'setting', name: 'Memory Pressure Thresholds', description: 'Swap prevention rules' },
      { type: 'setting', name: 'Model Auto-Select', description: 'Best model for your RAM tier' },
    ],
    requirements: { minVersion: '1.4.0', integrations: ['MLX Backend'] },
    wouldOverride: ['model-settings', 'memory-thresholds'],
    installed: false,
    hasUpdate: false,
  },
  {
    id: 'pack-006',
    title: 'Code Review Autopilot',
    version: '2.0.0',
    author: 'reviewbot',
    anonymous: false,
    description:
      'Prompt templates for automated code review with severity classification and fix suggestions.',
    longDescription:
      'A collection of battle-tested prompt templates that turn your local LLM into a code review assistant. Includes templates for: security vulnerability scanning, performance anti-pattern detection, style guide enforcement, and architectural consistency checks. Each template outputs structured JSON with severity levels and actionable fix suggestions.',
    category: 'Prompt Templates',
    tags: ['code-review', 'prompts', 'security', 'quality', 'automation'],
    downloads: 4127,
    stars: 4.4,
    createdAt: '2025-10-25',
    updatedAt: '2026-02-05',
    includes: [
      { type: 'template', name: 'Security Scanner Prompt', description: 'CVE pattern matching + fixes' },
      { type: 'template', name: 'Performance Reviewer', description: 'O(n) anti-pattern detection' },
      { type: 'template', name: 'Style Enforcer', description: 'Configurable style guide rules' },
      { type: 'template', name: 'Architecture Guard', description: 'Dependency direction validation' },
    ],
    requirements: { minVersion: '1.3.0', integrations: ['Local LLM'] },
    wouldOverride: ['prompt-templates'],
    installed: false,
    hasUpdate: false,
  },
  {
    id: 'pack-007',
    title: 'Evidence Pipeline Starter',
    version: '1.2.1',
    author: 'anonymous',
    anonymous: true,
    description:
      'Agent workflow that bootstraps the full evidence pipeline: claim, quarantine, promote cycle.',
    longDescription:
      'Get the evidence-based learning pipeline running from scratch. Configures the claim-quarantine-promote cycle with sensible defaults (n>=5 for promotion, effect_size>=0.05). Includes dashboard widgets for pipeline health monitoring and SOP reliability tracking. Perfect for new Context DNA installations.',
    category: 'Agent Workflows',
    tags: ['evidence', 'pipeline', 'sop', 'learning', 'bootstrap'],
    downloads: 1456,
    stars: 4.3,
    createdAt: '2026-01-10',
    updatedAt: '2026-02-08',
    includes: [
      { type: 'workflow', name: 'Evidence Claim Collector', description: 'Auto-capture from sessions' },
      { type: 'workflow', name: 'Quarantine Evaluator', description: 'Hypothesis validation engine' },
      { type: 'panel', name: 'Pipeline Health Widget', description: 'Claims/quarantine/promoted counts' },
      { type: 'setting', name: 'Promotion Thresholds', description: 'n>=5, effect>=0.05, confidence>=0.7' },
    ],
    requirements: { minVersion: '1.5.0', integrations: ['PostgreSQL', 'Redis'] },
    wouldOverride: ['evidence-pipeline', 'promotion-thresholds'],
    installed: false,
    hasUpdate: false,
  },
  {
    id: 'pack-008',
    title: 'Multi-Repo Navigator',
    version: '1.4.0',
    author: 'monorepo_mike',
    anonymous: false,
    description:
      'Panel layout designed for submodule monorepos with cross-project search and dependency mapping.',
    longDescription:
      'Purpose-built for developers working across multiple repositories or submodule monorepos. Adds a unified search panel that spans all sub-projects, a visual dependency graph showing inter-project relationships, and a synchronized git status view. Integrates with the workspace hierarchy profile for automatic project detection.',
    category: 'Panel Layouts',
    tags: ['monorepo', 'submodules', 'search', 'dependencies', 'git'],
    downloads: 1823,
    stars: 4.2,
    createdAt: '2025-11-30',
    updatedAt: '2026-01-25',
    includes: [
      { type: 'panel', name: 'Unified Cross-Project Search', description: 'Search across all sub-repos' },
      { type: 'panel', name: 'Dependency Graph Viewer', description: 'Visual inter-project map' },
      { type: 'panel', name: 'Multi-Repo Git Status', description: 'Synchronized status for all repos' },
      { type: 'setting', name: 'Workspace Profile Integration', description: 'Auto-detects projects' },
    ],
    requirements: { minVersion: '1.4.0', integrations: ['Git'] },
    wouldOverride: ['panel-layout', 'search-config'],
    installed: false,
    hasUpdate: false,
  },
];

const CATEGORIES: PackCategory[] = [
  'All',
  'Panel Layouts',
  'Agent Workflows',
  'Webhook Presets',
  'Model Settings',
  'Prompt Templates',
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'downloads', label: 'Most Downloaded' },
];

const INCLUDE_TYPE_LABELS: Record<ConfigPackInclude['type'], string> = {
  panel: 'Panel',
  setting: 'Setting',
  template: 'Template',
  workflow: 'Workflow',
  webhook: 'Webhook',
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            'w-3 h-3',
            i <= Math.round(rating)
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-zinc-600'
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

function PackCard({
  pack,
  onPreview,
  onInstall,
  onUninstall,
  onUpdate,
  installing,
}: {
  pack: ConfigPack;
  onPreview: (pack: ConfigPack) => void;
  onInstall: (packId: string) => void;
  onUninstall: (packId: string) => void;
  onUpdate: (packId: string) => void;
  installing: boolean;
}) {
  return (
    <div className="glass rounded-lg p-4 border border-zinc-700/50 hover:border-zinc-600 transition-all duration-200 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-5 h-5 text-primary flex-shrink-0" />
          <h3 className="font-medium text-foreground truncate">{pack.title}</h3>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0 font-mono">
          v{pack.version}
        </span>
      </div>

      {/* Author */}
      <div className="flex items-center gap-1.5 mb-2">
        <User className="w-3 h-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {pack.anonymous ? 'Anonymous' : pack.author}
        </span>
      </div>

      {/* Description — 2 lines max */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
        {pack.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {pack.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 border border-zinc-600/50"
          >
            {tag}
          </span>
        ))}
        {pack.tags.length > 3 && (
          <span className="text-[10px] px-1.5 py-0.5 text-zinc-500">
            +{pack.tags.length - 3}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Download className="w-3 h-3" />
            {pack.downloads.toLocaleString()}
          </span>
          <StarRating rating={pack.stars} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-700/50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPreview(pack)}
          className="flex-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
        >
          <Eye className="w-3.5 h-3.5 mr-1.5" />
          Preview
        </Button>

        {pack.installed ? (
          pack.hasUpdate ? (
            <Button
              size="sm"
              onClick={() => onUpdate(pack.id)}
              disabled={installing}
              className="flex-1 bg-amber-600 text-white hover:bg-amber-500"
            >
              {installing ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Update
            </Button>
          ) : (
            <span className="flex-1 flex items-center justify-center gap-1.5 text-sm text-success">
              <Check className="w-4 h-4" />
              Installed
            </span>
          )
        ) : (
          <Button
            size="sm"
            onClick={() => onInstall(pack.id)}
            disabled={installing}
            className="flex-1 bg-green-600 text-white hover:bg-green-500"
          >
            {installing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            Install
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pack Detail Modal
// ---------------------------------------------------------------------------

function PackDetailModal({
  pack,
  onClose,
  onInstall,
  onUninstall,
  installing,
}: {
  pack: ConfigPack;
  onClose: () => void;
  onInstall: (packId: string) => void;
  onUninstall: (packId: string) => void;
  installing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] glass rounded-xl border border-zinc-700 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-700/50">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {pack.title}
                </h2>
                <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                  v{pack.version}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  {pack.anonymous ? 'Anonymous' : pack.author}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Download className="w-3 h-3" />
                  {pack.downloads.toLocaleString()}
                </span>
                <StarRating rating={pack.stars} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-700 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-6 space-y-6">
            {/* Full Description */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {pack.longDescription}
              </p>
            </div>

            {/* Tags */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {pack.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 border border-zinc-600/50 flex items-center gap-1"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Includes */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">
                Includes ({pack.includes.length} items)
              </h3>
              <div className="space-y-2">
                {pack.includes.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30"
                  >
                    <span
                      className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0 mt-0.5',
                        item.type === 'panel' && 'bg-blue-500/15 text-blue-400',
                        item.type === 'setting' && 'bg-purple-500/15 text-purple-400',
                        item.type === 'template' && 'bg-amber-500/15 text-amber-400',
                        item.type === 'workflow' && 'bg-green-500/15 text-green-400',
                        item.type === 'webhook' && 'bg-cyan-500/15 text-cyan-400'
                      )}
                    >
                      {INCLUDE_TYPE_LABELS[item.type]}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Screenshot Preview Placeholder */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Preview</h3>
              <div className="w-full h-48 rounded-lg bg-zinc-800/50 border border-zinc-700/30 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageOff className="w-8 h-8" />
                <span className="text-xs">Screenshot preview not available yet</span>
              </div>
            </div>

            {/* Requirements */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-muted-foreground" />
                Requirements
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 rounded bg-zinc-800/50">
                  <span className="text-muted-foreground">Minimum ContextDNA Version</span>
                  <span className="text-foreground font-mono text-xs">
                    v{pack.requirements.minVersion}
                  </span>
                </div>
                {pack.requirements.integrations.length > 0 && (
                  <div className="p-2 rounded bg-zinc-800/50">
                    <span className="text-muted-foreground">Required Integrations</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {pack.requirements.integrations.map((integ) => (
                        <span
                          key={integ}
                          className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-foreground"
                        >
                          {integ}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Override Warning */}
            {pack.wouldOverride.length > 0 && !pack.installed && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-400">
                    Installing will override existing settings
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {pack.wouldOverride.map((item) => (
                      <span
                        key={item}
                        className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-700/50 flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Updated {pack.updatedAt}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="border-zinc-600">
              Close
            </Button>
            {pack.installed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUninstall(pack.id)}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Uninstall
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onInstall(pack.id)}
                disabled={installing}
                className="bg-green-600 text-white hover:bg-green-500"
              >
                {installing ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                )}
                Install Pack
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publish Flow Modal
// ---------------------------------------------------------------------------

function PublishFlow({
  onClose,
  onPublish,
}: {
  onClose: () => void;
  onPublish: (title: string, description: string, tags: string[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  // Simulated snapshot of current config with secret detection
  const mockCurrentConfig = [
    { name: 'Panel Layout', type: 'panel', safe: true },
    { name: 'LLM Temperature Profiles', type: 'setting', safe: true },
    { name: 'Webhook Endpoints', type: 'webhook', safe: true },
    { name: 'API Key (sk-proj-...)', type: 'setting', safe: false },
    { name: 'Agent Workflow Chain', type: 'workflow', safe: true },
    { name: 'Database Connection String', type: 'setting', safe: false },
  ];

  const hasSecrets = mockCurrentConfig.some((c) => !c.safe);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      setTags((prev) => [...prev, trimmed]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  const removeTag = useCallback(
    (tag: string) => {
      setTags((prev) => prev.filter((t) => t !== tag));
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addTag();
      }
    },
    [addTag]
  );

  const handlePublish = async () => {
    if (!title.trim() || !description.trim()) return;
    setPublishing(true);
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 1500));
    onPublish(title, description, tags);
    setPublishing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl max-h-[85vh] glass rounded-xl border border-zinc-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-700/50">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Publish Config Pack</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-700 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-6 space-y-5">
            {/* Config snapshot preview */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">
                Config Preview (sanitized)
              </h3>
              <div className="space-y-1.5">
                {mockCurrentConfig.map((item, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between p-2 rounded text-sm',
                      item.safe
                        ? 'bg-zinc-800/50'
                        : 'bg-red-500/10 border border-red-500/20'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.safe ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span
                        className={item.safe ? 'text-foreground' : 'text-red-400'}
                      >
                        {item.name}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded uppercase',
                        item.safe
                          ? 'bg-zinc-700 text-zinc-400'
                          : 'bg-red-500/20 text-red-400'
                      )}
                    >
                      {item.safe ? item.type : 'SECRET -- EXCLUDED'}
                    </span>
                  </div>
                ))}
              </div>

              {hasSecrets && (
                <div className="flex items-start gap-2 mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <Shield className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">
                    Secret-like values detected and will be{' '}
                    <strong>automatically excluded</strong> from the published
                    pack. API keys, connection strings, and credentials are never
                    shared.
                  </p>
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Pack Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Awesome Config Pack"
                className="bg-zinc-800/50 border-zinc-700"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this config pack does and who it's for..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-zinc-800/50 rounded-md border border-zinc-700 focus:border-primary focus:outline-none text-foreground resize-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">
                Tags (up to 10)
              </label>
              <div className="flex items-center gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a tag and press Enter..."
                  className="bg-zinc-800/50 border-zinc-700 flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  disabled={!tagInput.trim() || tags.length >= 10}
                  className="border-zinc-600"
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-300 border border-zinc-600/50 flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="hover:text-red-400 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-700/50 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-zinc-600"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={!title.trim() || !description.trim() || publishing}
            className="bg-green-600 text-white hover:bg-green-500"
          >
            {publishing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Publish Pack
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ConfigPackBrowser() {
  const [packs, setPacks] = useState<ConfigPack[]>(MOCK_PACKS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PackCategory>('All');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'community' | 'my-packs'>('community');
  const [previewPack, setPreviewPack] = useState<ConfigPack | null>(null);
  const [showPublishFlow, setShowPublishFlow] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Filtered + sorted pack list
  const filteredPacks = useMemo(() => {
    let result = [...packs];

    // Tab filter
    if (activeTab === 'my-packs') {
      result = result.filter((p) => p.installed);
    }

    // Category filter
    if (selectedCategory !== 'All') {
      result = result.filter((p) => p.category === selectedCategory);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.includes(q))
      );
    }

    // Sort
    switch (sortBy) {
      case 'popular':
        result.sort((a, b) => b.stars - a.stars);
        break;
      case 'newest':
        result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case 'downloads':
        result.sort((a, b) => b.downloads - a.downloads);
        break;
    }

    return result;
  }, [packs, searchQuery, selectedCategory, sortBy, activeTab]);

  // ---------- Handlers ----------

  const handleInstall = useCallback(async (packId: string) => {
    setInstallingId(packId);
    await new Promise((r) => setTimeout(r, 1200));
    setPacks((prev) =>
      prev.map((p) =>
        p.id === packId
          ? {
              ...p,
              installed: true,
              installedVersion: p.version,
              downloads: p.downloads + 1,
            }
          : p
      )
    );
    setInstallingId(null);
  }, []);

  const handleUninstall = useCallback((packId: string) => {
    setPacks((prev) =>
      prev.map((p) =>
        p.id === packId
          ? { ...p, installed: false, hasUpdate: false, installedVersion: undefined }
          : p
      )
    );
    setPreviewPack(null);
  }, []);

  const handleUpdate = useCallback(async (packId: string) => {
    setInstallingId(packId);
    await new Promise((r) => setTimeout(r, 1200));
    setPacks((prev) =>
      prev.map((p) =>
        p.id === packId
          ? { ...p, hasUpdate: false, installedVersion: p.version }
          : p
      )
    );
    setInstallingId(null);
  }, []);

  const handlePublish = useCallback(
    (title: string, description: string, tags: string[]) => {
      const newPack: ConfigPack = {
        id: `pack-${Date.now()}`,
        title,
        version: '1.0.0',
        author: 'you',
        anonymous: false,
        description,
        longDescription: description,
        category: 'Panel Layouts',
        tags,
        downloads: 0,
        stars: 0,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
        includes: [
          { type: 'panel', name: 'Current Panel Layout' },
          { type: 'setting', name: 'Current Settings' },
        ],
        requirements: { minVersion: '1.0.0', integrations: [] },
        wouldOverride: [],
        installed: true,
        hasUpdate: false,
        installedVersion: '1.0.0',
      };
      setPacks((prev) => [newPack, ...prev]);
      setShowPublishFlow(false);
    },
    []
  );

  const currentSortLabel =
    SORT_OPTIONS.find((s) => s.value === sortBy)?.label ?? 'Sort';
  const installedCount = packs.filter((p) => p.installed).length;
  const updatableCount = packs.filter((p) => p.hasUpdate).length;

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Config Packs
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse, install, and share community config packs
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowPublishFlow(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Upload className="w-4 h-4 mr-1.5" />
          Publish Pack
        </Button>
      </div>

      {/* ---------- Tab Toggle: Community / My Packs ---------- */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-800/50 border border-zinc-700/50 w-fit">
        <button
          onClick={() => setActiveTab('community')}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
            activeTab === 'community'
              ? 'bg-zinc-700 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Community
        </button>
        <button
          onClick={() => setActiveTab('my-packs')}
          className={cn(
            'px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5',
            activeTab === 'my-packs'
              ? 'bg-zinc-700 text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          My Packs
          {installedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
              {installedCount}
            </span>
          )}
          {updatableCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
              {updatableCount} update{updatableCount > 1 ? 's' : ''}
            </span>
          )}
        </button>
      </div>

      {/* ---------- Search & Sort ---------- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search packs by title, description, or tags..."
            className="pl-9 bg-zinc-800/50 border-zinc-700"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="border-zinc-700 whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 mr-1.5" />
            {currentSortLabel}
            <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
          </Button>
          {showSortDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSortDropdown(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-44 py-1 rounded-lg bg-zinc-800 border border-zinc-700 shadow-xl z-50">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setSortBy(opt.value);
                      setShowSortDropdown(false);
                    }}
                    className={cn(
                      'w-full px-3 py-1.5 text-sm text-left hover:bg-zinc-700 transition-colors flex items-center justify-between',
                      sortBy === opt.value
                        ? 'text-primary'
                        : 'text-muted-foreground'
                    )}
                  >
                    {opt.label}
                    {sortBy === opt.value && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Category Filter Pills ---------- */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              selectedCategory === cat
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-zinc-800/50 text-muted-foreground border-zinc-700/50 hover:text-foreground hover:border-zinc-600'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ---------- Pack Grid ---------- */}
      {filteredPacks.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center">
          <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {activeTab === 'my-packs'
              ? 'No installed packs yet. Browse the community to get started.'
              : searchQuery
                ? `No packs found matching "${searchQuery}"`
                : 'No packs found in this category.'}
          </p>
          {activeTab === 'my-packs' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('community')}
              className="mt-4 border-zinc-600"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Browse Community
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPacks.map((pack) => (
            <PackCard
              key={pack.id}
              pack={pack}
              onPreview={setPreviewPack}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onUpdate={handleUpdate}
              installing={installingId === pack.id}
            />
          ))}
        </div>
      )}

      {/* ---------- My Packs footer ---------- */}
      {activeTab === 'my-packs' && filteredPacks.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-700/50">
          <span className="text-xs text-muted-foreground">
            {installedCount} pack{installedCount !== 1 ? 's' : ''} installed
            {updatableCount > 0 && (
              <span className="text-amber-400 ml-1">
                ({updatableCount} update
                {updatableCount !== 1 ? 's' : ''} available)
              </span>
            )}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPublishFlow(true)}
            className="border-zinc-600"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Create Pack from Current Config
          </Button>
        </div>
      )}

      {/* ---------- Detail Modal ---------- */}
      {previewPack && (
        <PackDetailModal
          pack={previewPack}
          onClose={() => setPreviewPack(null)}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          installing={installingId === previewPack.id}
        />
      )}

      {/* ---------- Publish Flow ---------- */}
      {showPublishFlow && (
        <PublishFlow
          onClose={() => setShowPublishFlow(false)}
          onPublish={handlePublish}
        />
      )}
    </div>
  );
}
