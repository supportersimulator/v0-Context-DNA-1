'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings,
  Shield,
  Search,
  Cpu,
  Terminal,
  Code2,
  BrainCircuit,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanPhase = 'idle' | 'scanning' | 'complete';

interface DetectedIntegration {
  id: string;
  name: string;
  category: IntegrationCategory;
  detected: boolean;
  version?: string;
}

type IntegrationCategory = 'llm_runtimes' | 'ai_services' | 'dev_tools' | 'ides';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  IntegrationCategory,
  { label: string; icon: React.ReactNode; description: string }
> = {
  llm_runtimes: {
    label: 'LLM Runtimes',
    icon: <Cpu className="w-4 h-4" />,
    description: 'Local model inference engines',
  },
  ai_services: {
    label: 'AI Services',
    icon: <BrainCircuit className="w-4 h-4" />,
    description: 'Cloud AI providers',
  },
  dev_tools: {
    label: 'Dev Tools',
    icon: <Terminal className="w-4 h-4" />,
    description: 'Development toolchain',
  },
  ides: {
    label: 'IDEs',
    icon: <Code2 className="w-4 h-4" />,
    description: 'Code editors and environments',
  },
};

const CATEGORY_ORDER: IntegrationCategory[] = [
  'llm_runtimes',
  'ai_services',
  'dev_tools',
  'ides',
];

// ---------------------------------------------------------------------------
// Mock scan — will be replaced by Electron IPC or API route
// ---------------------------------------------------------------------------

async function mockScanIntegrations(): Promise<DetectedIntegration[]> {
  // Simulate a 2-second scan delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return [
    // LLM Runtimes
    { id: 'ollama', name: 'Ollama', category: 'llm_runtimes', detected: true, version: '0.6.2' },
    { id: 'vllm', name: 'vLLM', category: 'llm_runtimes', detected: false },
    { id: 'llama-cpp', name: 'llama.cpp', category: 'llm_runtimes', detected: false },
    { id: 'mlx', name: 'MLX', category: 'llm_runtimes', detected: true, version: '0.24.1' },

    // AI Services
    { id: 'openai', name: 'OpenAI', category: 'ai_services', detected: true, version: 'API key configured' },
    { id: 'anthropic', name: 'Anthropic', category: 'ai_services', detected: true, version: 'API key configured' },
    { id: 'deepseek', name: 'DeepSeek', category: 'ai_services', detected: false },

    // Dev Tools
    { id: 'docker', name: 'Docker', category: 'dev_tools', detected: true, version: '27.5.1' },
    { id: 'git', name: 'Git', category: 'dev_tools', detected: true, version: '2.47.1' },
    { id: 'node', name: 'Node.js', category: 'dev_tools', detected: true, version: '22.13.1' },
    { id: 'python', name: 'Python', category: 'dev_tools', detected: true, version: '3.14.0a4' },

    // IDEs
    { id: 'vscode', name: 'VS Code', category: 'ides', detected: true, version: '1.97.2' },
    { id: 'cursor', name: 'Cursor', category: 'ides', detected: true, version: '0.46.11' },
  ];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IntegrationRow({ integration }: { integration: DetectedIntegration }) {
  const handleConfigure = () => {
    console.log(`[Integrations] Configure clicked for: ${integration.name}`, integration);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
        integration.detected
          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
          : 'bg-slate-800/30 opacity-60'
      )}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {integration.detected ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : (
          <XCircle className="w-4 h-4 text-slate-500" />
        )}
      </div>

      {/* Name + version */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-200">{integration.name}</div>
        {integration.detected && integration.version && (
          <div className="text-xs text-slate-500 truncate">{integration.version}</div>
        )}
      </div>

      {/* Configure button (only for detected) */}
      {integration.detected && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleConfigure}
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
          title={`Configure ${integration.name}`}
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

function CategoryGroup({
  category,
  integrations,
}: {
  category: IntegrationCategory;
  integrations: DetectedIntegration[];
}) {
  const meta = CATEGORY_META[category];
  const detectedCount = integrations.filter((i) => i.detected).length;

  return (
    <div className="space-y-2">
      {/* Category header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="text-slate-400">{meta.icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
        </div>
        <span className="text-xs text-slate-500">
          {detectedCount}/{integrations.length} found
        </span>
      </div>

      {/* Integration rows */}
      <div className="space-y-1">
        {integrations.map((integration) => (
          <IntegrationRow key={integration.id} integration={integration} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal component
// ---------------------------------------------------------------------------

export function IntegrationsModal({ isOpen, onClose }: IntegrationsModalProps) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle');
  const [results, setResults] = useState<DetectedIntegration[]>([]);

  const handleScan = useCallback(async () => {
    setScanPhase('scanning');
    try {
      const detected = await mockScanIntegrations();
      setResults(detected);
      setScanPhase('complete');
    } catch (err) {
      console.error('[Integrations] Scan failed:', err);
      setScanPhase('idle');
    }
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Reset state after close animation
    setTimeout(() => {
      setConsentChecked(false);
      setScanPhase('idle');
      setResults([]);
    }, 200);
  }, [onClose]);

  if (!isOpen) return null;

  // Group results by category
  const grouped = CATEGORY_ORDER.reduce(
    (acc, cat) => {
      acc[cat] = results.filter((r) => r.category === cat);
      return acc;
    },
    {} as Record<IntegrationCategory, DetectedIntegration[]>
  );

  const totalDetected = results.filter((r) => r.detected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl mx-4 bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Search className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Integration Discovery</h2>
              <p className="text-xs text-slate-500">Detect local runtimes, services, and tools</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-6 space-y-6">
            {/* ─── Pre-scan: Explanation + Consent ─── */}
            {scanPhase === 'idle' && (
              <>
                {/* What it does */}
                <div className="space-y-4">
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                      <Search className="w-4 h-4 text-indigo-400" />
                      What does integration scanning do?
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      The scanner checks your local machine for installed LLM runtimes (Ollama, vLLM,
                      llama.cpp, MLX), AI service configurations (OpenAI, Anthropic, DeepSeek),
                      developer tools (Docker, Git, Node.js, Python), and code editors (VS Code, Cursor).
                    </p>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      This helps Context DNA auto-configure itself to work with what you already have
                      installed, so you get the best experience without manual setup.
                    </p>
                  </div>

                  {/* What data is collected */}
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      What data is collected?
                    </h3>
                    <ul className="text-sm text-slate-400 space-y-1.5 ml-1">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Runtime names and version numbers (e.g. &quot;Ollama 0.6.2&quot;)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>Whether an API key is configured (yes/no only)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                        <span>No file paths, directory structures, or system internals</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                        <span>No API keys, tokens, passwords, or secrets</span>
                      </li>
                    </ul>
                  </div>

                  {/* Privacy */}
                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 space-y-2">
                    <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-400" />
                      Privacy guarantee
                    </h3>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      All scanning happens locally on your device. No data leaves your machine unless
                      you explicitly opt in to sharing. Results are stored only in your local Context
                      DNA configuration.
                    </p>
                  </div>
                </div>

                {/* Consent checkbox */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-sm text-slate-300 group-hover:text-slate-200 transition-colors select-none">
                    I agree to scan for local integrations
                  </span>
                </label>

                {/* Scan button */}
                <Button
                  onClick={handleScan}
                  disabled={!consentChecked}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Scan for Integrations
                </Button>
              </>
            )}

            {/* ─── Scanning in progress ─── */}
            {scanPhase === 'scanning' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                  <div className="absolute -inset-3 bg-indigo-500/10 rounded-full blur-xl -z-10 animate-pulse" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-base font-medium text-slate-200">Scanning your system...</p>
                  <p className="text-sm text-slate-500">
                    Checking for runtimes, services, and tools
                  </p>
                </div>
              </div>
            )}

            {/* ─── Scan results ─── */}
            {scanPhase === 'complete' && (
              <>
                {/* Summary bar */}
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      Scan complete &mdash; {totalDetected} integration{totalDetected !== 1 ? 's' : ''} detected
                    </p>
                    <p className="text-xs text-slate-500">
                      {results.length - totalDetected} not found on this system
                    </p>
                  </div>
                </div>

                {/* Grouped results */}
                <div className="space-y-5">
                  {CATEGORY_ORDER.map((cat) => {
                    const items = grouped[cat];
                    if (items.length === 0) return null;
                    return (
                      <CategoryGroup key={cat} category={cat} integrations={items} />
                    );
                  })}
                </div>

                {/* Re-scan */}
                <div className="pt-2 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setScanPhase('idle');
                      setResults([]);
                      setConsentChecked(true);
                    }}
                    className="border-slate-700 hover:bg-slate-800 text-slate-300"
                  >
                    <Search className="w-3.5 h-3.5 mr-2" />
                    Scan Again
                  </Button>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
