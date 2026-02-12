'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Puzzle,
  Search,
  Download,
  Check,
  Star,
  Power,
  Trash2,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Package,
  GitBranch,
  Loader2,
  Play,
  AlertCircle,
  FolderOpen,
  Heart,
  ExternalLink as LinkIcon,
  Sparkles,
  Send,
  Bot,
} from 'lucide-react';
import {
  createRepoSandbox,
  execInSandbox,
  destroySandbox,
  listSandboxes,
  type RepoSandbox,
  type RepoAnalysis,
} from '@/lib/ide/repo-sandbox';
import {
  searchHFModels,
  searchHFSpaces,
  runHFInference,
  getSpaceEmbedUrl,
  getPipelineLabel,
  formatDownloads,
  type HFModelInfo,
  type HFSpaceInfo,
} from '@/lib/ide/huggingface-api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ExtensionState = 'installed' | 'available' | 'disabled';

interface Extension {
  id: string;
  name: string;
  author: string;
  description: string;
  version: string;
  state: ExtensionState;
  stars: number;
  downloads: number;
  category: 'ai' | 'language' | 'theme' | 'tool' | 'integration';
}

// ---------------------------------------------------------------------------
// Mock data — Context DNA ecosystem extensions
// ---------------------------------------------------------------------------
function getExtensions(): Extension[] {
  return [
    // Installed
    { id: 'ext-synaptic', name: 'Synaptic Voice', author: 'Context DNA', description: 'Voice chat with 8th Intelligence', version: '1.2.0', state: 'installed', stars: 142, downloads: 1240, category: 'ai' },
    { id: 'ext-evidence', name: 'Evidence Pipeline', author: 'Context DNA', description: 'Claim tracking and outcome grounding', version: '2.0.1', state: 'installed', stars: 89, downloads: 890, category: 'tool' },
    { id: 'ext-harmonizer', name: 'Harmonizer Gate', author: 'Context DNA', description: '7-gate code quality checker', version: '1.1.0', state: 'installed', stars: 76, downloads: 760, category: 'tool' },
    { id: 'ext-swarm', name: 'Swarm Controller', author: 'Context DNA', description: 'Multi-agent orchestration panel', version: '1.0.3', state: 'installed', stars: 134, downloads: 1100, category: 'ai' },
    // Disabled
    { id: 'ext-openhands', name: 'OpenHands Agent', author: 'All Hands AI', description: 'Autonomous coding agent', version: '0.9.0', state: 'disabled', stars: 2100, downloads: 15000, category: 'ai' },
    // Available
    { id: 'ext-py-lint', name: 'Python Linter', author: 'Community', description: 'Real-time Python linting with ruff', version: '3.1.0', state: 'available', stars: 3400, downloads: 45000, category: 'language' },
    { id: 'ext-docker-mgr', name: 'Docker Manager', author: 'Container Tools', description: 'Visual Docker container management', version: '2.3.1', state: 'available', stars: 1800, downloads: 22000, category: 'integration' },
    { id: 'ext-git-lens', name: 'Git Lens', author: 'GitToolkit', description: 'Inline git blame and history', version: '14.0.0', state: 'available', stars: 8900, downloads: 120000, category: 'tool' },
    { id: 'ext-theme-dna', name: 'DNA Dark Pro', author: 'Context DNA', description: 'Official Context DNA dark theme', version: '1.0.0', state: 'available', stars: 45, downloads: 380, category: 'theme' },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function stateBadge(state: ExtensionState) {
  switch (state) {
    case 'installed':
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">Installed</span>;
    case 'disabled':
      return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#6b6b75]/15 text-[#6b6b75]">Disabled</span>;
    case 'available':
      return null;
  }
}

const CATEGORY_LABELS: Record<Extension['category'], string> = {
  ai: 'AI & Agents',
  language: 'Languages',
  theme: 'Themes',
  tool: 'Tools',
  integration: 'Integrations',
};

// ---------------------------------------------------------------------------
// ExtensionCard
// ---------------------------------------------------------------------------
function ExtensionCard({
  ext,
  onInstall,
  onToggle,
  onRemove,
}: {
  ext: Extension;
  onInstall: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 hover:bg-[#1a1a24]/50 group transition-colors">
      {/* Icon */}
      <div className="w-9 h-9 rounded-lg bg-[#1a1a24] border border-[#2a2a35] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Puzzle className="w-4 h-4 text-[#6b6b75]" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#e5e5e5] truncate">{ext.name}</span>
          <span className="text-[9px] text-[#6b6b75]">v{ext.version}</span>
          {stateBadge(ext.state)}
        </div>
        <div className="text-[10px] text-[#6b6b75] truncate">{ext.description}</div>
        <div className="flex items-center gap-3 mt-0.5 text-[9px] text-[#6b6b75]">
          <span>{ext.author}</span>
          <span className="flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5" /> {formatNumber(ext.stars)}
          </span>
          <span className="flex items-center gap-0.5">
            <Download className="w-2.5 h-2.5" /> {formatNumber(ext.downloads)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {ext.state === 'available' && (
          <button onClick={onInstall} className="p-1 rounded hover:bg-[#22c55e]/20 text-[#22c55e]" title="Install">
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        {ext.state === 'installed' && (
          <button onClick={onToggle} className="p-1 rounded hover:bg-[#e5c07b]/20 text-[#e5c07b]" title="Disable">
            <Power className="w-3.5 h-3.5" />
          </button>
        )}
        {ext.state === 'disabled' && (
          <button onClick={onToggle} className="p-1 rounded hover:bg-[#22c55e]/20 text-[#22c55e]" title="Enable">
            <Power className="w-3.5 h-3.5" />
          </button>
        )}
        {ext.state !== 'available' && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-[#ef4444]/20 text-[#ef4444]" title="Uninstall">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RepoSandboxCard — shows analysis results for a cloned GitHub repo
// ---------------------------------------------------------------------------
function RepoSandboxCard({
  sandbox,
  onRunTests,
  onDestroy,
}: {
  sandbox: RepoSandbox;
  onRunTests: () => void;
  onDestroy: () => void;
}) {
  const a = sandbox.analysis;
  const isLoading = sandbox.status === 'cloning' || sandbox.status === 'analyzing';

  return (
    <div className="mx-3 my-2 rounded-lg border border-[#2a2a35] bg-[#111118] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a35]/50">
        <GitBranch className="w-3.5 h-3.5 text-[#c678dd] flex-shrink-0" />
        <span className="text-xs font-medium text-[#e5e5e5] truncate">{sandbox.repoUrl.replace(/\.git$/, '').split('/').slice(-2).join('/')}</span>
        {isLoading && <Loader2 className="w-3 h-3 text-[#6b6b75] animate-spin ml-auto" />}
        {sandbox.status === 'ready' && <Check className="w-3 h-3 text-[#22c55e] ml-auto" />}
        {sandbox.status === 'error' && <AlertCircle className="w-3 h-3 text-[#ef4444] ml-auto" />}
      </div>

      {/* Status message while loading */}
      {isLoading && (
        <div className="px-3 py-2 text-[10px] text-[#6b6b75]">
          {sandbox.status === 'cloning' ? 'Cloning repository...' : 'Analyzing project structure...'}
        </div>
      )}

      {/* Error */}
      {sandbox.status === 'error' && (
        <div className="px-3 py-2 text-[10px] text-[#ef4444]">{sandbox.error}</div>
      )}

      {/* Analysis results */}
      {a && (
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c678dd]/15 text-[#c678dd]">{a.language}</span>
            {a.framework && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#61afef]/15 text-[#61afef]">{a.framework}</span>}
            {a.hasDockerfile && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#56b6c2]/15 text-[#56b6c2]">Docker</span>}
            {a.hasTests && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">Tests</span>}
            {a.hasDevcontainer && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#e5c07b]/15 text-[#e5c07b]">DevContainer</span>}
            {a.panelManifest && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/15 text-[#22c55e]">Panel Plugin</span>}
          </div>

          {a.entryPoints.length > 0 && (
            <div className="text-[10px] text-[#6b6b75]">
              Entry: {a.entryPoints.slice(0, 2).join(', ')}
            </div>
          )}

          {a.dependencies.length > 0 && (
            <div className="text-[10px] text-[#6b6b75] truncate">
              Deps: {a.dependencies.slice(0, 6).join(', ')}{a.dependencies.length > 6 ? ` +${a.dependencies.length - 6}` : ''}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            {a.hasTests && (
              <button onClick={onRunTests} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#22c55e]/10 text-[#22c55e] hover:bg-[#22c55e]/20">
                <Play className="w-2.5 h-2.5" /> Run Tests
              </button>
            )}
            {a.panelManifest && (
              <button className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#c678dd]/10 text-[#c678dd] hover:bg-[#c678dd]/20">
                <Puzzle className="w-2.5 h-2.5" /> Load Panel
              </button>
            )}
            <button onClick={onDestroy} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#6b6b75] hover:bg-[#ef4444]/10 hover:text-[#ef4444] ml-auto">
              <Trash2 className="w-2.5 h-2.5" /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHubTab — "From GitHub" tab for cloning and analyzing repos
// ---------------------------------------------------------------------------
function GitHubTab() {
  const [repoUrl, setRepoUrl] = useState('');
  const [cloning, setCloning] = useState(false);
  const [sandboxes, setSandboxes] = useState<RepoSandbox[]>([]);
  const [testOutput, setTestOutput] = useState<string | null>(null);

  const handleClone = useCallback(async () => {
    if (!repoUrl.trim() || cloning) return;
    setCloning(true);
    try {
      const sb = await createRepoSandbox(repoUrl.trim());
      setSandboxes((prev) => [sb, ...prev]);
      setRepoUrl('');
    } catch {
      // Error handled inside createRepoSandbox
    } finally {
      setCloning(false);
    }
  }, [repoUrl, cloning]);

  const handleRunTests = useCallback(async (sbId: string) => {
    try {
      setTestOutput('Running tests...');
      const output = await execInSandbox(sbId, 'npm test 2>&1 || pytest 2>&1 || echo "No test runner found"');
      setTestOutput(output);
    } catch (err) {
      setTestOutput(err instanceof Error ? err.message : 'Test execution failed');
    }
  }, []);

  const handleDestroy = useCallback(async (sbId: string) => {
    await destroySandbox(sbId);
    setSandboxes((prev) => prev.filter((s) => s.id !== sbId));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* URL input */}
      <div className="px-3 py-2 border-b border-[#2a2a35]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded">
            <GitBranch className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleClone()}
              placeholder="owner/repo or https://github.com/..."
              className="flex-1 bg-transparent text-xs text-[#e5e5e5] placeholder-[#6b6b75] outline-none"
              spellCheck={false}
            />
          </div>
          <button
            onClick={handleClone}
            disabled={cloning || !repoUrl.trim()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#22c55e]/15 text-[#22c55e] hover:bg-[#22c55e]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {cloning ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
            Analyze
          </button>
        </div>
      </div>

      {/* Sandboxes */}
      {sandboxes.length === 0 && !testOutput && (
        <div className="flex flex-col items-center justify-center h-48 text-[#6b6b75] gap-2">
          <GitBranch className="w-8 h-8 opacity-50" />
          <span className="text-xs">Enter a GitHub repo URL to analyze</span>
          <span className="text-[10px] opacity-60">Detects language, framework, tests, and dependencies</span>
        </div>
      )}

      {sandboxes.map((sb) => (
        <RepoSandboxCard
          key={sb.id}
          sandbox={sb}
          onRunTests={() => handleRunTests(sb.id)}
          onDestroy={() => handleDestroy(sb.id)}
        />
      ))}

      {/* Test output */}
      {testOutput && (
        <div className="mx-3 my-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75]">Test Output</span>
            <button onClick={() => setTestOutput(null)} className="text-[10px] text-[#6b6b75] hover:text-[#e5e5e5]">Clear</button>
          </div>
          <pre className="text-[10px] text-[#abb2bf] bg-[#1a1a24] rounded p-2 border border-[#2a2a35] max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
            {testOutput}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HFModelCard — compact model card for HuggingFace models
// ---------------------------------------------------------------------------
function HFModelCard({
  model,
  onTest,
}: {
  model: HFModelInfo;
  onTest: () => void;
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 hover:bg-[#1a1a24]/50 group transition-colors">
      <div className="w-8 h-8 rounded-lg bg-[#e5c07b]/10 border border-[#2a2a35] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-[#e5c07b]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[#e5e5e5] truncate">{model.modelId}</span>
          {model.gated && <span className="text-[8px] px-1 py-0 rounded bg-[#ef4444]/15 text-[#ef4444]">gated</span>}
        </div>
        <div className="flex items-center gap-2.5 mt-0.5 text-[9px] text-[#6b6b75]">
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#61afef]/10 text-[#61afef]">{getPipelineLabel(model.pipelineTag)}</span>
          <span className="flex items-center gap-0.5"><Download className="w-2.5 h-2.5" /> {formatDownloads(model.downloads)}</span>
          <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {formatDownloads(model.likes)}</span>
        </div>
      </div>
      <button
        onClick={onTest}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#e5c07b]/10 text-[#e5c07b] hover:bg-[#e5c07b]/20 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        <Sparkles className="w-2.5 h-2.5" /> Test
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HFSpaceCard — compact Space card
// ---------------------------------------------------------------------------
function HFSpaceCard({
  space,
  onOpenPanel,
  onClone,
}: {
  space: HFSpaceInfo;
  onOpenPanel: () => void;
  onClone: () => void;
}) {
  const sdkColor: Record<string, string> = {
    gradio: '#22c55e',
    streamlit: '#ef4444',
    docker: '#56b6c2',
    static: '#6b6b75',
  };
  const color = sdkColor[space.sdk] ?? '#6b6b75';

  return (
    <div className="flex items-start gap-2.5 px-3 py-2 hover:bg-[#1a1a24]/50 group transition-colors">
      <div className="w-8 h-8 rounded-lg border border-[#2a2a35] flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${color}15` }}>
        <Sparkles className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[#e5e5e5] truncate">{space.name}</span>
          <span className="text-[9px] text-[#6b6b75]">by {space.author}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-[#6b6b75]">
          <span className="px-1.5 py-0.5 rounded-full text-[9px]" style={{ backgroundColor: `${color}15`, color }}>{space.sdk}</span>
          <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {formatDownloads(space.likes)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onOpenPanel}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[#c678dd]/10 text-[#c678dd] hover:bg-[#c678dd]/20"
          title="Open in panel (iframe)"
        >
          <LinkIcon className="w-2.5 h-2.5" /> Open
        </button>
        <button
          onClick={onClone}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#6b6b75] hover:bg-[#1a1a24]"
          title="Clone and analyze source"
        >
          <FolderOpen className="w-2.5 h-2.5" /> Clone
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HuggingFaceTab — Spaces + Models search with inference testing
// ---------------------------------------------------------------------------
function HuggingFaceTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<'spaces' | 'models'>('spaces');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<HFModelInfo[]>([]);
  const [spaces, setSpaces] = useState<HFSpaceInfo[]>([]);

  // Inference tester state
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [inferenceInput, setInferenceInput] = useState('');
  const [inferenceOutput, setInferenceOutput] = useState<string | null>(null);
  const [inferenceLoading, setInferenceLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || loading) return;
    setLoading(true);
    try {
      if (subTab === 'models') {
        const results = await searchHFModels(searchQuery.trim(), { limit: 20 });
        setModels(results);
      } else {
        const results = await searchHFSpaces(searchQuery.trim(), { limit: 20 });
        setSpaces(results);
      }
    } catch {
      // Search failed silently
    } finally {
      setLoading(false);
    }
  }, [searchQuery, loading, subTab]);

  const handleInference = useCallback(async () => {
    if (!testingModel || !inferenceInput.trim() || inferenceLoading) return;
    setInferenceLoading(true);
    setInferenceOutput(null);
    try {
      const result = await runHFInference(testingModel, inferenceInput.trim());
      setInferenceOutput(result.error ?? result.output);
    } catch (err) {
      setInferenceOutput(err instanceof Error ? err.message : 'Inference failed');
    } finally {
      setInferenceLoading(false);
    }
  }, [testingModel, inferenceInput, inferenceLoading]);

  const handleOpenSpace = useCallback((space: HFSpaceInfo) => {
    // Open in a new browser tab (full SafePanelPlugin integration is future work)
    window.open(space.embedUrl, '_blank', 'noopener');
  }, []);

  const handleCloneSpace = useCallback(async (space: HFSpaceInfo) => {
    try {
      await createRepoSandbox(space.id, undefined, undefined, 'huggingface');
    } catch {
      // Error handled inside createRepoSandbox
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-[#2a2a35] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded">
            <Search className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={subTab === 'spaces' ? 'Search HF Spaces...' : 'Search HF models...'}
              className="flex-1 bg-transparent text-xs text-[#e5e5e5] placeholder-[#6b6b75] outline-none"
              spellCheck={false}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchQuery.trim()}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#e5c07b]/15 text-[#e5c07b] hover:bg-[#e5c07b]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Search
          </button>
        </div>
      </div>

      {/* Sub-tabs: Spaces | Models */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-[#2a2a35]/50 flex-shrink-0">
        <button
          onClick={() => setSubTab('spaces')}
          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
            subTab === 'spaces' ? 'bg-[#c678dd]/15 text-[#c678dd]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'
          }`}
        >
          Spaces
        </button>
        <button
          onClick={() => setSubTab('models')}
          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
            subTab === 'models' ? 'bg-[#e5c07b]/15 text-[#e5c07b]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'
          }`}
        >
          Models
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {subTab === 'spaces' && spaces.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-48 text-[#6b6b75] gap-2">
            <Sparkles className="w-8 h-8 opacity-50" />
            <span className="text-xs">Search HuggingFace Spaces</span>
            <span className="text-[10px] opacity-60">Gradio & Streamlit apps you can open as panels</span>
          </div>
        )}

        {subTab === 'models' && models.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-48 text-[#6b6b75] gap-2">
            <Bot className="w-8 h-8 opacity-50" />
            <span className="text-xs">Search HuggingFace Models</span>
            <span className="text-[10px] opacity-60">Try: llama, mistral, qwen, whisper, stable-diffusion</span>
          </div>
        )}

        {/* Space results */}
        {subTab === 'spaces' && spaces.map((space) => (
          <HFSpaceCard
            key={space.id}
            space={space}
            onOpenPanel={() => handleOpenSpace(space)}
            onClone={() => handleCloneSpace(space)}
          />
        ))}

        {/* Model results */}
        {subTab === 'models' && models.map((model) => (
          <HFModelCard
            key={model.modelId}
            model={model}
            onTest={() => {
              setTestingModel(model.modelId);
              setInferenceOutput(null);
              setInferenceInput('');
            }}
          />
        ))}
      </div>

      {/* Inference tester panel (slides up when testing a model) */}
      {testingModel && (
        <div className="border-t border-[#2a2a35] bg-[#111118] flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#2a2a35]/50">
            <span className="text-[10px] font-medium text-[#e5c07b] truncate">{testingModel}</span>
            <button
              onClick={() => { setTestingModel(null); setInferenceOutput(null); }}
              className="text-[10px] text-[#6b6b75] hover:text-[#e5e5e5]"
            >
              Close
            </button>
          </div>
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inferenceInput}
                onChange={(e) => setInferenceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInference()}
                placeholder="Enter text to test inference..."
                className="flex-1 px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded text-xs text-[#e5e5e5] placeholder-[#6b6b75] outline-none"
                spellCheck={false}
              />
              <button
                onClick={handleInference}
                disabled={inferenceLoading || !inferenceInput.trim()}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#e5c07b]/15 text-[#e5c07b] hover:bg-[#e5c07b]/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {inferenceLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </div>
            {inferenceOutput && (
              <pre className="mt-2 text-[10px] text-[#abb2bf] bg-[#1a1a24] rounded p-2 border border-[#2a2a35] max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                {inferenceOutput}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExtensionsPanel — main export
// ---------------------------------------------------------------------------
export function ExtensionsPanel() {
  const [extensions, setExtensions] = useState<Extension[]>(getExtensions);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');
  const [tab, setTab] = useState<'marketplace' | 'github' | 'huggingface'>('marketplace');

  const filtered = useMemo(() => {
    let exts = extensions;
    if (filter === 'installed') exts = exts.filter((e) => e.state === 'installed' || e.state === 'disabled');
    if (filter === 'available') exts = exts.filter((e) => e.state === 'available');
    if (query.trim()) {
      const q = query.toLowerCase();
      exts = exts.filter(
        (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.author.toLowerCase().includes(q),
      );
    }
    return exts;
  }, [extensions, query, filter]);

  // Group by category
  const groups = useMemo(() => {
    const map = new Map<Extension['category'], Extension[]>();
    for (const ext of filtered) {
      const existing = map.get(ext.category) ?? [];
      existing.push(ext);
      map.set(ext.category, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const counts = useMemo(() => ({
    installed: extensions.filter((e) => e.state === 'installed').length,
    disabled: extensions.filter((e) => e.state === 'disabled').length,
    available: extensions.filter((e) => e.state === 'available').length,
  }), [extensions]);

  const handleInstall = useCallback((id: string) => {
    setExtensions((prev) => prev.map((e) => (e.id === id ? { ...e, state: 'installed' as const } : e)));
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExtensions((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        return { ...e, state: e.state === 'installed' ? 'disabled' as const : 'installed' as const };
      }),
    );
  }, []);

  const handleRemove = useCallback((id: string) => {
    setExtensions((prev) => prev.map((e) => (e.id === id ? { ...e, state: 'available' as const } : e)));
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#2a2a35] flex-shrink-0">
        <Puzzle className="w-3.5 h-3.5 text-[#c678dd]" />
        <span className="text-xs font-medium text-[#e5e5e5]">Extensions</span>
        <span className="text-[10px] text-[#6b6b75] ml-auto">{counts.installed} active</span>
      </div>

      {/* Main tabs: Marketplace | From GitHub | HuggingFace */}
      <div className="flex items-center gap-0 border-b border-[#2a2a35] flex-shrink-0">
        <button
          onClick={() => setTab('marketplace')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors border-b-2 ${
            tab === 'marketplace' ? 'border-[#22c55e] text-[#e5e5e5]' : 'border-transparent text-[#6b6b75] hover:text-[#e5e5e5]'
          }`}
        >
          Marketplace
        </button>
        <button
          onClick={() => setTab('github')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors border-b-2 flex items-center justify-center gap-1 ${
            tab === 'github' ? 'border-[#c678dd] text-[#e5e5e5]' : 'border-transparent text-[#6b6b75] hover:text-[#e5e5e5]'
          }`}
        >
          <GitBranch className="w-3 h-3" /> GitHub
        </button>
        <button
          onClick={() => setTab('huggingface')}
          className={`flex-1 px-2 py-1.5 text-[10px] font-medium transition-colors border-b-2 flex items-center justify-center gap-1 ${
            tab === 'huggingface' ? 'border-[#e5c07b] text-[#e5e5e5]' : 'border-transparent text-[#6b6b75] hover:text-[#e5e5e5]'
          }`}
        >
          <Sparkles className="w-3 h-3" /> HuggingFace
        </button>
      </div>

      {/* GitHub tab */}
      {tab === 'github' && <GitHubTab />}

      {/* HuggingFace tab */}
      {tab === 'huggingface' && <HuggingFaceTab />}

      {/* Marketplace tab */}
      {tab === 'marketplace' && (
        <>
          {/* Search */}
          <div className="px-3 py-2 border-b border-[#2a2a35] flex-shrink-0">
            <div className="flex items-center gap-2 px-2 py-1 bg-[#1a1a24] border border-[#2a2a35] rounded">
              <Search className="w-3.5 h-3.5 text-[#6b6b75] flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search extensions..."
                className="flex-1 bg-transparent text-xs text-[#e5e5e5] placeholder-[#6b6b75] outline-none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 px-3 py-1 border-b border-[#2a2a35]/50 flex-shrink-0">
            {(['all', 'installed', 'available'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  filter === f ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'text-[#6b6b75] hover:text-[#e5e5e5]'
                }`}
              >
                {f === 'all' ? `All (${extensions.length})` : f === 'installed' ? `Installed (${counts.installed})` : `Available (${counts.available})`}
              </button>
            ))}
          </div>

          {/* Extension list */}
          <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-[#6b6b75] gap-2">
            <Package className="w-8 h-8 opacity-50" />
            <span className="text-sm">No extensions found</span>
          </div>
        )}

        {groups.map(([category, exts]) => (
          <div key={category}>
            <div className="px-3 pt-2 pb-1">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#6b6b75]">
                {CATEGORY_LABELS[category]}
              </span>
            </div>
            {exts.map((ext) => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                onInstall={() => handleInstall(ext.id)}
                onToggle={() => handleToggle(ext.id)}
                onRemove={() => handleRemove(ext.id)}
              />
            ))}
          </div>
        ))}
          </div>
        </>
      )}
    </div>
  );
}
