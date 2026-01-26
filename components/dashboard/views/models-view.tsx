'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import {
  fetchModelStatus,
  fetchUserPlan,
  fetchCredentialsStatus,
  fetchSystemInfo,
  autoSetupRecommendedModel,
  saveCredential,
  deleteCredential,
  downloadModel,
  switchModel,
  deleteModel,
  unloadModel,
  formatBytes,
  fetchMemoryStats,
  fetchMemoryPurgeInfo,
  purgeMemory,
  configureModel,
} from '@/lib/api';
import type { SystemInfo, CompetingLLM, LoadedModel, MemoryStats, MemoryPurgeInfo, MemoryPurgeResult } from '@/lib/api';
import type {
  ModelStatus,
  UserPlan,
  OllamaModel,
  ModelDownloadProgress,
  AvailableModel,
} from '@/lib/types';
import { AVAILABLE_MODELS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Download,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  HardDrive,
  Cpu,
  RefreshCw,
  Play,
  Lock,
  Crown,
  Sparkles,
  Key,
  Shield,
  ExternalLink,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react';
import type { CredentialInfo } from '@/lib/api';

// Credential Row Component
interface CredentialRowProps {
  service: string;
  info: CredentialInfo;
  tokenInput: string;
  showToken: boolean;
  saving: boolean;
  onTokenChange: (value: string) => void;
  onToggleShow: () => void;
  onSave: () => void;
  onDelete: () => void;
}

function CredentialRow({
  service,
  info,
  tokenInput,
  showToken,
  saving,
  onTokenChange,
  onToggleShow,
  onSave,
  onDelete,
}: CredentialRowProps) {
  return (
    <div className="glass rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{info.display_name}</span>
          {info.configured && (
            <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">
              Configured
            </span>
          )}
        </div>
        <a
          href={info.help_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          Get key <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {info.configured ? (
        // Token is configured - show masked view
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted rounded-md px-3 py-2 font-mono text-sm text-muted-foreground">
            {info.masked_token}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={saving}
            className="border-destructive/20 text-destructive hover:bg-destructive/10"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      ) : (
        // Token not configured - show input
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showToken ? 'text' : 'password'}
              value={tokenInput}
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder={`Enter ${info.display_name} API key...`}
              className="w-full bg-muted rounded-md px-3 py-2 pr-10 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={onToggleShow}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={!tokenInput.trim() || saving}
            className="border-primary/20 text-primary hover:bg-primary/10"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Save'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ModelsView() {
  const [downloadProgress, setDownloadProgress] = useState<Record<string, ModelDownloadProgress>>({});
  const [switchingModel, setSwitchingModel] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

  // Credentials state
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [savingCredential, setSavingCredential] = useState<string | null>(null);
  const [credentialMessage, setCredentialMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-setup state
  const [isAutoSetupRunning, setIsAutoSetupRunning] = useState(false);
  const [autoSetupMessage, setAutoSetupMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Unload state
  const [unloadingModel, setUnloadingModel] = useState<string | null>(null);

  // Configure state
  const [configuringModel, setConfiguringModel] = useState<string | null>(null);

  // Memory management state
  const [memoryCheckOpen, setMemoryCheckOpen] = useState(false);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [purgeInfo, setPurgeInfo] = useState<MemoryPurgeInfo | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<MemoryPurgeResult | null>(null);
  const [memoryStep, setMemoryStep] = useState<'check' | 'info' | 'purging' | 'result'>('check');

  const { data: modelStatus, isLoading: statusLoading, mutate: mutateStatus } = useSWR(
    'model-status',
    fetchModelStatus,
    { refreshInterval: 10000 }
  );

  const { data: userPlan, isLoading: planLoading } = useSWR(
    'user-plan',
    fetchUserPlan,
    { refreshInterval: 60000 }
  );

  const { data: credentialsStatus, mutate: mutateCredentials } = useSWR(
    'credentials-status',
    fetchCredentialsStatus,
    { refreshInterval: 30000 }
  );

  const { data: systemInfo, mutate: mutateSystemInfo } = useSWR<SystemInfo | null>(
    'system-info',
    fetchSystemInfo,
    { refreshInterval: 30000 }
  );

  const isLoading = statusLoading || planLoading;

  // Handle credential save
  const handleSaveCredential = async (service: string) => {
    const token = tokenInputs[service];
    if (!token?.trim()) return;

    setSavingCredential(service);
    setCredentialMessage(null);

    const result = await saveCredential(service, token);

    setSavingCredential(null);
    setCredentialMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });

    if (result.success) {
      setTokenInputs(prev => ({ ...prev, [service]: '' }));
      mutateCredentials();
      // Clear message after 3 seconds
      setTimeout(() => setCredentialMessage(null), 3000);
    }
  };

  // Handle credential delete
  const handleDeleteCredential = async (service: string) => {
    setSavingCredential(service);
    setCredentialMessage(null);

    const result = await deleteCredential(service);

    setSavingCredential(null);
    setCredentialMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });

    if (result.success) {
      mutateCredentials();
      setTimeout(() => setCredentialMessage(null), 3000);
    }
  };
  const installedModelNames = new Set(modelStatus?.installedModels.map(m => m.name) || []);

  // Check if model is available based on user plan
  const canAccessModel = (model: AvailableModel): boolean => {
    if (!userPlan) return false;
    const tierOrder = { free: 0, pro: 1, advanced: 2 };
    return tierOrder[userPlan.tier] >= tierOrder[model.tier];
  };

  // Handle model download
  const handleDownload = async (modelId: string) => {
    setDownloadProgress(prev => ({
      ...prev,
      [modelId]: {
        modelId,
        status: 'queued',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
      },
    }));

    const success = await downloadModel(modelId, (progress) => {
      setDownloadProgress(prev => ({ ...prev, [modelId]: progress }));
    });

    if (success) {
      // Clear progress and refresh status
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newState = { ...prev };
          delete newState[modelId];
          return newState;
        });
        mutateStatus();
      }, 2000);
    }
  };

  // Handle model switch
  const handleSwitch = async (modelName: string) => {
    if (!userPlan?.canSwitchModels) return;

    setSwitchingModel(modelName);
    const success = await switchModel(modelName);
    setSwitchingModel(null);

    if (success) {
      mutateStatus();
    }
  };

  // Handle model delete
  const handleDelete = async (modelName: string) => {
    if (!userPlan?.canDeleteModels) return;

    setDeletingModel(modelName);
    const success = await deleteModel(modelName);
    setDeletingModel(null);

    if (success) {
      mutateStatus();
    }
  };

  // Handle auto-setup
  const handleAutoSetup = async () => {
    setIsAutoSetupRunning(true);
    setAutoSetupMessage({ type: 'info', text: 'Detecting best model for your system...' });

    const result = await autoSetupRecommendedModel((progress) => {
      if (progress.status === 'downloading') {
        setAutoSetupMessage({
          type: 'info',
          text: `Downloading recommended model... ${progress.progress}%`,
        });
      }
    });

    setIsAutoSetupRunning(false);
    setAutoSetupMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });

    if (result.success) {
      mutateStatus();
      mutateSystemInfo();
      // Clear message after 5 seconds
      setTimeout(() => setAutoSetupMessage(null), 5000);
    }
  };

  // Handle unload model (free RAM)
  const handleUnloadModel = async (modelName?: string) => {
    setUnloadingModel(modelName || 'all');
    const result = await unloadModel(modelName);
    setUnloadingModel(null);

    if (result.success) {
      mutateStatus();
      mutateSystemInfo();
      setAutoSetupMessage({
        type: 'success',
        text: result.message,
      });
      setTimeout(() => setAutoSetupMessage(null), 3000);
    }
  };

  // Handle configure model (set as default and preload)
  const handleConfigureModel = async (modelName: string) => {
    setConfiguringModel(modelName);
    setAutoSetupMessage({ type: 'info', text: `Configuring ${modelName}...` });

    const result = await configureModel(modelName, { setAsDefault: true, preload: true });

    setConfiguringModel(null);
    setAutoSetupMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });

    if (result.success) {
      mutateStatus();
      mutateSystemInfo();
      setTimeout(() => setAutoSetupMessage(null), 3000);
    }
  };

  // Handle memory check - start the guided flow
  const handleCheckMemory = async () => {
    setMemoryCheckOpen(true);
    setMemoryStep('check');
    setPurgeResult(null);

    // Fetch memory stats
    const stats = await fetchMemoryStats();
    setMemoryStats(stats);

    // If there's significant reclaimable memory, fetch purge info
    if (stats && stats.reclaimable_gb > 2) {
      const info = await fetchMemoryPurgeInfo();
      setPurgeInfo(info);
      setMemoryStep('info');
    }
  };

  // Handle memory purge
  const handlePurgeMemory = async () => {
    setMemoryStep('purging');
    setIsPurging(true);

    const result = await purgeMemory();
    setPurgeResult(result);
    setIsPurging(false);
    setMemoryStep('result');

    // Refresh system info to show updated memory
    if (result.success) {
      mutateSystemInfo();
    }
  };

  // Reset memory check state
  const resetMemoryCheck = () => {
    setMemoryCheckOpen(false);
    setMemoryStats(null);
    setPurgeInfo(null);
    setPurgeResult(null);
    setMemoryStep('check');
  };

  // Check if model fits in available memory
  const modelFitsMemory = (modelId: string): boolean => {
    if (!systemInfo?.model_compatibility) return true; // Assume yes if no info
    const compat = systemInfo.model_compatibility[modelId];
    return compat?.fits ?? true;
  };

  // Get memory status for a model
  const getModelMemoryStatus = (modelId: string): 'optimal' | 'fits' | 'insufficient_memory' | 'unknown' => {
    if (!systemInfo?.model_compatibility) return 'unknown';
    return systemInfo.model_compatibility[modelId]?.status ?? 'unknown';
  };

  // Get tier badge color
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'bg-success/10 text-success';
      case 'pro': return 'bg-blue-500/10 text-blue-400';
      case 'advanced': return 'bg-purple-500/10 text-purple-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Get tier icon
  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'free': return null;
      case 'pro': return <Crown className="w-3 h-3" />;
      case 'advanced': return <Sparkles className="w-3 h-3" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">LLM Models</h1>
          <p className="text-sm text-muted-foreground">
            Manage local language models for Context DNA
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Ollama Status */}
          <span
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
              modelStatus?.ollamaRunning
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                modelStatus?.ollamaRunning ? 'bg-success' : 'bg-destructive'
              )}
            />
            Ollama {modelStatus?.ollamaRunning ? 'Running' : 'Offline'}
          </span>

          {/* User Plan Badge */}
          {userPlan && (
            <span
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium uppercase',
                getTierColor(userPlan.tier)
              )}
            >
              {getTierIcon(userPlan.tier)}
              {userPlan.tier} Plan
            </span>
          )}
        </div>
      </div>

      {/* Ollama Status - Uses systemInfo.ollama (checked alongside RAM) */}
      {!modelStatus?.ollamaRunning && (
        <div className={cn(
          "glass rounded-lg p-6 space-y-4 border-2",
          systemInfo?.ollama?.installed
            ? "border-warning/30 bg-gradient-to-r from-warning/5 to-orange-500/5"
            : "border-destructive/30 bg-gradient-to-r from-destructive/5 to-orange-500/5"
        )}>
          {/* Case 1: Ollama is INSTALLED but NOT RUNNING */}
          {systemInfo?.ollama?.installed ? (
            <>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
                  <Play className="w-6 h-6 text-warning" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">Start Ollama</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ollama is installed{systemInfo.ollama.install_path ? ` at ${systemInfo.ollama.install_path}` : ''} but not running.
                    {systemInfo.ollama.has_models && " Your previously downloaded models are still available."}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 pt-2">
                {/* Option 1: Open from Spotlight */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-medium flex items-center justify-center">1</span>
                    <span className="font-medium text-foreground">Launch from Spotlight</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Space</kbd>, type "Ollama", press Enter
                  </p>
                </div>

                {/* Option 2: Terminal command */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium flex items-center justify-center">2</span>
                    <span className="font-medium text-foreground">Or run in Terminal</span>
                  </div>
                  <div className="relative">
                    <code className="block w-full bg-background rounded-md px-3 py-2 pr-10 font-mono text-xs text-foreground overflow-x-auto">
                      ollama serve
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText('ollama serve')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                      title="Copy to clipboard"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Refresh button */}
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { mutateStatus(); mutateSystemInfo(); }}
                  className="border-warning/30 text-warning hover:bg-warning/10"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check if Ollama Started
                </Button>
              </div>
            </>
          ) : (
            /* Case 2: Ollama is NOT INSTALLED */
            <>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">Install Ollama</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ollama is the engine that runs AI models on your Mac. Context DNA uses Ollama to execute
                    the qwen models locally - your data never leaves your machine.
                  </p>
                </div>
              </div>

              {/* Installation Options */}
              <div className="grid gap-4 md:grid-cols-2 pt-2">
                {/* Option 1: Download App */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-sm font-medium flex items-center justify-center">1</span>
                    <span className="font-medium text-foreground">Download the App (Recommended)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Download and install Ollama.app - it runs in your menu bar
                  </p>
                  <Button
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => window.open('https://ollama.com/download', '_blank')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Download Ollama
                  </Button>
                </div>

                {/* Option 2: Terminal - show brew if available */}
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium flex items-center justify-center">2</span>
                    <span className="font-medium text-foreground">
                      {systemInfo?.ollama?.install_method === 'brew' ? 'Or via Homebrew' : 'Or via Terminal'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {systemInfo?.ollama?.install_method === 'brew'
                      ? 'Install with Homebrew (recommended for Mac developers)'
                      : 'Run this command in Terminal to install Ollama'}
                  </p>
                  <div className="relative">
                    <code className="block w-full bg-background rounded-md px-3 py-2 pr-10 font-mono text-xs text-foreground overflow-x-auto">
                      {systemInfo?.ollama?.install_method === 'brew'
                        ? 'brew install ollama && ollama serve'
                        : 'curl -fsSL https://ollama.com/install.sh | sh'}
                    </code>
                    <button
                      onClick={() => {
                        const cmd = systemInfo?.ollama?.install_method === 'brew'
                          ? 'brew install ollama && ollama serve'
                          : 'curl -fsSL https://ollama.com/install.sh | sh';
                        navigator.clipboard.writeText(cmd);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                      title="Copy to clipboard"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* After Installation */}
              <div className="p-4 bg-success/5 rounded-lg border border-success/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium text-foreground">After Installing</span>
                </div>
                <ol className="text-xs text-muted-foreground space-y-1 pl-6 list-decimal">
                  <li>Launch Ollama (it will appear in your menu bar)</li>
                  <li>This page will automatically detect Ollama and show "Ollama Running"</li>
                  <li>Then download your preferred model (we recommend the 14B for your 32GB Mac)</li>
                </ol>
              </div>

              {/* Refresh button */}
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { mutateStatus(); mutateSystemInfo(); }}
                  className="border-border"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check if Ollama is Running
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Memory Status & Auto Setup */}
      {!systemInfo && (
        <div className="glass rounded-lg p-4 space-y-3 border border-warning/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">System Info Unavailable</p>
              <p className="text-xs text-muted-foreground">
                Local LLM API server not running. Start it to see memory status and recommendations.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mutateSystemInfo()}
              className="border-warning/20 text-warning hover:bg-warning/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
          <div className="pl-[52px] text-xs text-muted-foreground space-y-1">
            <p className="font-mono bg-muted/50 px-2 py-1 rounded inline-block">
              cd context-dna && python -m local_llm.api_server
            </p>
            <p>Or it will auto-start with Context DNA docker-compose</p>
          </div>
        </div>
      )}
      {systemInfo && (
        <div className="glass rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">System Memory</p>
                <p className="text-lg font-semibold text-foreground">
                  {systemInfo.memory.realistic_available_gb || systemInfo.memory.available_gb} GB available
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    of {systemInfo.memory.total_gb} GB
                  </span>
                </p>
                {systemInfo.memory.cache_reclaimable_gb && systemInfo.memory.cache_reclaimable_gb > 2 && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-success">✓</span> Includes {systemInfo.memory.cache_reclaimable_gb}GB reclaimable cache
                  </p>
                )}
              </div>
            </div>

            {/* Auto Setup Button */}
            {!modelStatus?.activeModel && systemInfo.can_run_local_llm && (
              <Button
                onClick={handleAutoSetup}
                disabled={isAutoSetupRunning}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isAutoSetupRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Auto-Setup Best Model
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Memory Progress Bar */}
          <div className="space-y-2">
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  systemInfo.memory.percent_used > 90 ? 'bg-destructive' :
                  systemInfo.memory.percent_used > 70 ? 'bg-warning' : 'bg-success'
                )}
                style={{ width: `${systemInfo.memory.percent_used}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{systemInfo.memory.used_gb} GB used</span>
              <span>{systemInfo.memory.percent_used}% utilized</span>
            </div>
          </div>

          {/* RAM Management - Check & Free Memory */}
          {systemInfo.memory.cache_reclaimable_gb && systemInfo.memory.cache_reclaimable_gb > 2 && (
            <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-blue-500/20">
              {!memoryCheckOpen ? (
                // Initial state - show check button
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <HardDrive className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {systemInfo.memory.cache_reclaimable_gb.toFixed(1)} GB of memory can be freed
                      </p>
                      <p className="text-xs text-muted-foreground">
                        macOS is holding cached data that could run larger AI models
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckMemory}
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  >
                    <HardDrive className="w-4 h-4 mr-2" />
                    Check RAM
                  </Button>
                </div>
              ) : (
                // Expanded state - guided flow
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-5 h-5 text-blue-400" />
                      <span className="font-medium text-foreground">Free Up Memory for AI Models</span>
                    </div>
                    <button
                      onClick={resetMemoryCheck}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Step: Check - Show memory stats */}
                  {memoryStep === 'check' && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                      <span className="ml-2 text-sm text-muted-foreground">Checking memory...</span>
                    </div>
                  )}

                  {/* Step: Info - Show explanation and confirm */}
                  {memoryStep === 'info' && memoryStats && purgeInfo && (
                    <div className="space-y-4">
                      {/* Memory breakdown */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-muted-foreground">Free Right Now</p>
                          <p className="text-lg font-semibold text-foreground">{memoryStats.free_gb} GB</p>
                        </div>
                        <div className="p-3 bg-success/10 rounded-lg border border-success/20">
                          <p className="text-muted-foreground">Can Be Freed</p>
                          <p className="text-lg font-semibold text-success">{memoryStats.reclaimable_gb} GB</p>
                        </div>
                      </div>

                      {/* Explanation */}
                      <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-foreground">{purgeInfo.title}</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-line">
                          {purgeInfo.explanation}
                        </p>
                      </div>

                      {/* What it does / doesn't do */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1">
                          <p className="font-medium text-success">✓ What it does:</p>
                          {purgeInfo.what_it_does.map((item, i) => (
                            <p key={i} className="text-muted-foreground pl-3">• {item}</p>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-blue-400">✗ What it does NOT do:</p>
                          {purgeInfo.what_it_does_not_do.map((item, i) => (
                            <p key={i} className="text-muted-foreground pl-3">• {item}</p>
                          ))}
                        </div>
                      </div>

                      {/* Admin notice */}
                      <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20">
                        <Shield className="w-4 h-4 text-warning mt-0.5" />
                        <div className="text-xs">
                          <p className="font-medium text-warning">Requires Admin Password</p>
                          <p className="text-muted-foreground">{purgeInfo.reason_for_admin}</p>
                          <p className="text-muted-foreground mt-1">
                            A macOS password dialog will appear - this is normal and safe.
                          </p>
                        </div>
                      </div>

                      {/* Action button */}
                      <Button
                        onClick={handlePurgeMemory}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                      >
                        <HardDrive className="w-4 h-4 mr-2" />
                        Free Up {memoryStats.reclaimable_gb} GB of Memory
                      </Button>
                    </div>
                  )}

                  {/* Step: Purging - Show progress */}
                  {memoryStep === 'purging' && (
                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                      <p className="text-sm text-foreground">Waiting for password confirmation...</p>
                      <p className="text-xs text-muted-foreground">
                        Enter your Mac password in the dialog that appeared
                      </p>
                    </div>
                  )}

                  {/* Step: Result - Show outcome */}
                  {memoryStep === 'result' && purgeResult && (
                    <div className="space-y-4">
                      {purgeResult.success ? (
                        <>
                          <div className="flex items-center gap-3 p-4 bg-success/10 rounded-lg border border-success/20">
                            <Check className="w-8 h-8 text-success" />
                            <div>
                              <p className="font-medium text-success">Memory Freed Successfully!</p>
                              <p className="text-sm text-muted-foreground">
                                {purgeResult.user_message}
                              </p>
                            </div>
                          </div>

                          {/* Before/After comparison */}
                          {purgeResult.before && purgeResult.after && (
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="text-xs text-muted-foreground">Before</p>
                                <p className="font-semibold">{purgeResult.before.free_gb} GB free</p>
                              </div>
                              <div className="p-3 bg-success/10 rounded-lg">
                                <p className="text-xs text-muted-foreground">After</p>
                                <p className="font-semibold text-success">{purgeResult.after.free_gb} GB free</p>
                              </div>
                            </div>
                          )}

                          <Button
                            onClick={resetMemoryCheck}
                            variant="outline"
                            className="w-full"
                          >
                            Done - Close
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                            <AlertCircle className="w-8 h-8 text-destructive" />
                            <div>
                              <p className="font-medium text-destructive">Could not free memory</p>
                              <p className="text-sm text-muted-foreground">
                                {purgeResult.error || 'The operation was cancelled or failed.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              onClick={() => setMemoryStep('info')}
                              variant="outline"
                              className="flex-1"
                            >
                              Try Again
                            </Button>
                            <Button
                              onClick={resetMemoryCheck}
                              variant="outline"
                              className="flex-1"
                            >
                              Close
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Competing LLMs Warning */}
          {systemInfo.competing_llms && systemInfo.competing_llms.length > 0 && (
            <div className="p-3 bg-warning/5 rounded-lg border border-warning/20 space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Other LLM Apps Detected ({systemInfo.competing_memory_gb}GB in use)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    These apps may be using memory that could run larger models
                  </p>
                </div>
              </div>
              <div className="space-y-2 pl-8">
                {systemInfo.competing_llms.map((llm: CompetingLLM, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-foreground">{llm.name}</span>
                      {llm.memory_gb && (
                        <span className="text-muted-foreground ml-2">({llm.memory_gb}GB)</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{llm.stop_hint}</span>
                  </div>
                ))}
              </div>
              {systemInfo.potential_recommended && systemInfo.potential_recommended.model_id !== systemInfo.recommended.model_id && (
                <div className="pl-8 pt-2 border-t border-warning/20">
                  <p className="text-xs text-warning">
                    💡 If closed, you could run: <strong>{systemInfo.potential_recommended.display_name}</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Currently Loaded Models */}
          {systemInfo.loaded_models && systemInfo.loaded_models.length > 0 && (
            <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-foreground">
                    Models in Memory ({systemInfo.loaded_models.length})
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnloadModel()}
                  disabled={unloadingModel !== null}
                  className="border-blue-500/20 text-blue-400 hover:bg-blue-500/10 text-xs"
                >
                  {unloadingModel ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1" />
                  )}
                  Unload All
                </Button>
              </div>
              <div className="space-y-2">
                {systemInfo.loaded_models.map((model: LoadedModel, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm pl-6">
                    <div>
                      <span className="text-foreground font-mono">{model.name}</span>
                      <span className="text-muted-foreground ml-2">
                        ({model.size_gb}GB{model.vram_gb ? ` / ${model.vram_gb}GB VRAM` : ''})
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnloadModel(model.name)}
                      disabled={unloadingModel !== null}
                      className="text-muted-foreground hover:text-destructive h-6 px-2"
                    >
                      {unloadingModel === model.name ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Unload models to free RAM for larger models
              </p>
            </div>
          )}

          {/* Recommendation */}
          {systemInfo.recommended && !modelStatus?.activeModel && (
            <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Cpu className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Recommended: {systemInfo.recommended.display_name}
                  {systemInfo.recommended.ram_while_running_gb && (
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      (uses ~{systemInfo.recommended.ram_while_running_gb}GB RAM)
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {systemInfo.recommended.reason}
                  {!systemInfo.recommended.is_optimal && (
                    <span className="text-warning ml-1">(Close apps for better performance)</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Auto Setup Message */}
          {autoSetupMessage && (
            <div
              className={cn(
                'px-3 py-2 rounded-md text-sm flex items-center gap-2',
                autoSetupMessage.type === 'success' ? 'bg-success/10 text-success' :
                autoSetupMessage.type === 'error' ? 'bg-destructive/10 text-destructive' :
                'bg-primary/10 text-primary'
              )}
            >
              {autoSetupMessage.type === 'success' ? <Check className="w-4 h-4" /> :
               autoSetupMessage.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
               <Loader2 className="w-4 h-4 animate-spin" />}
              {autoSetupMessage.text}
            </div>
          )}

          {/* Suggestions */}
          {systemInfo.suggestions.length > 0 && !modelStatus?.activeModel && (
            <div className="text-xs text-muted-foreground space-y-1">
              {systemInfo.suggestions.map((suggestion, i) => (
                <p key={i} className="flex items-center gap-2">
                  <span className="text-primary">•</span> {suggestion}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Model */}
      {modelStatus?.activeModel && (
        <div className="glass rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Check className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Model</p>
                <p className="text-lg font-semibold text-foreground">{modelStatus.activeModel}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { mutateStatus(); mutateSystemInfo(); }}
              className="border-border"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      )}

      {/* Installed Models */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Installed Models ({modelStatus?.installedModels.length || 0})
          </h2>
        </div>

        {isLoading ? (
          <div className="glass rounded-lg p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : modelStatus?.installedModels.length === 0 ? (
          <div className="glass rounded-lg p-8 text-center">
            <HardDrive className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No models installed yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Download a model below to get started
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {modelStatus?.installedModels.map((model) => (
              <div
                key={model.name}
                className={cn(
                  'glass rounded-lg p-4 transition-all duration-200',
                  modelStatus.activeModel === model.name && 'ring-1 ring-success/50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{model.name}</span>
                        {modelStatus.activeModel === model.name && (
                          <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>{formatBytes(model.size)}</span>
                        {model.details?.parameter_size && (
                          <span>{model.details.parameter_size}</span>
                        )}
                        {model.details?.quantization_level && (
                          <span>{model.details.quantization_level}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {modelStatus.activeModel !== model.name && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSwitch(model.name)}
                        disabled={!userPlan?.canSwitchModels || switchingModel === model.name}
                        className="border-border"
                        title={!userPlan?.canSwitchModels ? 'Upgrade to switch models' : 'Set as active'}
                      >
                        {switchingModel === model.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : !userPlan?.canSwitchModels ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConfigureModel(model.name)}
                      disabled={configuringModel === model.name}
                      className="border-border"
                      title="Configure model (set as default & preload)"
                    >
                      {configuringModel === model.name ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Settings className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(model.name)}
                      disabled={!userPlan?.canDeleteModels || deletingModel === model.name}
                      className="border-destructive/20 text-destructive hover:bg-destructive/10"
                      title={!userPlan?.canDeleteModels ? 'Upgrade to delete models' : 'Delete model'}
                    >
                      {deletingModel === model.name ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : !userPlan?.canDeleteModels ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Models */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Available Models
        </h2>

        <div className="grid gap-3">
          {AVAILABLE_MODELS.map((model) => {
            const isInstalled = installedModelNames.has(model.name);
            const canAccess = canAccessModel(model);
            const progress = downloadProgress[model.id];
            const isDownloading = progress && progress.status !== 'complete' && progress.status !== 'error';
            const memoryStatus = getModelMemoryStatus(model.id);
            const fitsMemory = modelFitsMemory(model.id);
            const isRecommended = systemInfo?.recommended?.model_id === model.id;

            return (
              <div
                key={model.id}
                className={cn(
                  'glass rounded-lg p-4 transition-all duration-200',
                  'hover:bg-[#1e1e28]',
                  !canAccess && 'opacity-60',
                  !fitsMemory && 'opacity-50 border border-destructive/20',
                  isRecommended && !isInstalled && 'ring-1 ring-primary/50'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{model.displayName}</span>
                      {isRecommended && !isInstalled && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Best for your system
                        </span>
                      )}
                      {model.recommended && !isRecommended && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                      {!fitsMemory && (
                        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Needs more RAM
                        </span>
                      )}
                      {fitsMemory && memoryStatus === 'fits' && !isInstalled && (
                        <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                          May be slow
                        </span>
                      )}
                      <span className={cn('text-xs px-2 py-0.5 rounded-full flex items-center gap-1', getTierColor(model.tier))}>
                        {getTierIcon(model.tier)}
                        {model.tier}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {model.size}
                      </span>
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {model.ramRequired} RAM
                      </span>
                      <span className="px-2 py-0.5 bg-muted rounded text-xs">{model.category}</span>
                    </div>

                    {/* Download Progress */}
                    {progress && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">
                            {progress.status === 'downloading' ? 'Downloading...' :
                             progress.status === 'verifying' ? 'Verifying...' :
                             progress.status === 'complete' ? 'Complete!' :
                             progress.status === 'error' ? 'Error' : 'Queued...'}
                          </span>
                          <span className="text-foreground">{progress.progress}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={cn(
                              'h-2 rounded-full transition-all duration-300',
                              progress.status === 'error' ? 'bg-destructive' :
                              progress.status === 'complete' ? 'bg-success' : 'bg-primary'
                            )}
                            style={{ width: `${progress.progress}%` }}
                          />
                        </div>
                        {progress.error && (
                          <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {progress.error}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="ml-4 flex-shrink-0">
                    {isInstalled ? (
                      <span className="flex items-center gap-1.5 text-success text-sm">
                        <Check className="w-4 h-4" />
                        Installed
                      </span>
                    ) : !canAccess ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="border-border"
                        title={`Requires ${model.tier} plan`}
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        {model.tier === 'pro' ? 'Pro' : 'Advanced'}
                      </Button>
                    ) : !fitsMemory ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="border-destructive/20 text-destructive"
                        title={`Needs ${systemInfo?.model_compatibility?.[model.id]?.min_ram_gb || '?'}GB RAM, you have ${systemInfo?.memory?.available_gb || '?'}GB available`}
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        Low RAM
                      </Button>
                    ) : isDownloading ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="border-border"
                      >
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {progress?.progress || 0}%
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(model.id)}
                        className={cn(
                          "border-primary/20 text-primary hover:bg-primary/10",
                          isRecommended && "bg-primary/10 border-primary/40"
                        )}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {isRecommended ? 'Download (Best)' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Storage Info */}
      <div className="glass rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Model Storage</h3>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Storage Location</span>
            <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">~/.ollama/models</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total Installed</span>
            <span className="text-foreground">
              {modelStatus?.installedModels.reduce((acc, m) => acc + m.size, 0)
                ? formatBytes(modelStatus.installedModels.reduce((acc, m) => acc + m.size, 0))
                : '0 B'}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Pro/Advanced models are encrypted and stored in ~/Library/Application Support/ContextDNA/models
        </p>
      </div>

      {/* API Credentials */}
      <div className="glass rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">API Credentials</h3>
          </div>
          {credentialsStatus?.storage && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              {credentialsStatus.storage.description}
            </span>
          )}
        </div>

        {/* Credential Message */}
        {credentialMessage && (
          <div
            className={cn(
              'px-3 py-2 rounded-md text-sm flex items-center gap-2',
              credentialMessage.type === 'success'
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {credentialMessage.type === 'success' ? (
              <Check className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {credentialMessage.text}
          </div>
        )}

        {/* All Credentials - Grouped by Category */}
        {credentialsStatus?.credentials && Object.entries(credentialsStatus.credentials).length > 0 && (
          <div className="space-y-4">
            {/* LLM Providers */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                LLM Providers (Bring Your Own Key)
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Use your own API keys for SOP generation, pattern analysis & context injection
              </p>
              {Object.entries(credentialsStatus.credentials)
                .filter(([_, info]) => (info as any).category === 'llm' || !((info as any).category))
                .filter(([key]) => ['openai', 'anthropic', 'google', 'groq'].includes(key))
                .map(([service, info]) => (
                  <CredentialRow
                    key={service}
                    service={service}
                    info={info}
                    tokenInput={tokenInputs[service] || ''}
                    showToken={showTokens[service] || false}
                    saving={savingCredential === service}
                    onTokenChange={(value) => setTokenInputs(prev => ({ ...prev, [service]: value }))}
                    onToggleShow={() => setShowTokens(prev => ({ ...prev, [service]: !prev[service] }))}
                    onSave={() => handleSaveCredential(service)}
                    onDelete={() => handleDeleteCredential(service)}
                  />
                ))}
            </div>

            {/* Model Hubs */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Model Hubs
              </p>
              {Object.entries(credentialsStatus.credentials)
                .filter(([key]) => ['huggingface'].includes(key))
                .map(([service, info]) => (
                  <CredentialRow
                    key={service}
                    service={service}
                    info={info}
                    tokenInput={tokenInputs[service] || ''}
                    showToken={showTokens[service] || false}
                    saving={savingCredential === service}
                    onTokenChange={(value) => setTokenInputs(prev => ({ ...prev, [service]: value }))}
                    onToggleShow={() => setShowTokens(prev => ({ ...prev, [service]: !prev[service] }))}
                    onSave={() => handleSaveCredential(service)}
                    onDelete={() => handleDeleteCredential(service)}
                  />
                ))}
            </div>

            {/* Embedding Providers */}
            {Object.entries(credentialsStatus.credentials)
              .filter(([key]) => ['voyage', 'cohere'].includes(key))
              .length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Embeddings & Search
                </p>
                {Object.entries(credentialsStatus.credentials)
                  .filter(([key]) => ['voyage', 'cohere'].includes(key))
                  .map(([service, info]) => (
                    <CredentialRow
                      key={service}
                      service={service}
                      info={info}
                      tokenInput={tokenInputs[service] || ''}
                      showToken={showTokens[service] || false}
                      saving={savingCredential === service}
                      onTokenChange={(value) => setTokenInputs(prev => ({ ...prev, [service]: value }))}
                      onToggleShow={() => setShowTokens(prev => ({ ...prev, [service]: !prev[service] }))}
                      onSave={() => handleSaveCredential(service)}
                      onDelete={() => handleDeleteCredential(service)}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          Your tokens are stored securely in your OS keychain and never leave your device.
        </p>
      </div>

      {/* Developer AI Tools */}
      {systemInfo?.dev_tools && (
        <div className="glass rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">Developer AI Tools</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              Detected on your system
            </span>
          </div>

          {/* Primary Dev Stack */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Primary Dev Stack
            </p>
            <div className="grid gap-2">
              {Object.entries(systemInfo.dev_tools)
                .filter(([key, tool]) => key !== 'has_homebrew' && (tool as any).category === 'primary')
                .map(([key, tool]) => {
                  const t = tool as any;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg",
                        t.installed ? "bg-success/5 border border-success/20" : "bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          t.installed ? "bg-success/10" : "bg-muted"
                        )}>
                          {t.installed ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Download className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{t.display_name}</p>
                          <p className="text-xs text-muted-foreground">{t.description}</p>
                        </div>
                      </div>
                      <div>
                        {t.installed ? (
                          <span className="text-xs text-success">Installed</span>
                        ) : t.requires && !systemInfo.dev_tools?.vscode?.installed ? (
                          <span className="text-xs text-muted-foreground">Needs VS Code first</span>
                        ) : t.download_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(t.download_url, '_blank')}
                            className="border-primary/20 text-primary hover:bg-primary/10 text-xs"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Get
                          </Button>
                        ) : t.install_command ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(t.install_command)}
                            className="border-primary/20 text-primary hover:bg-primary/10 text-xs"
                            title={t.install_command}
                          >
                            Copy Install
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Other Considerations */}
          <div className="space-y-2 pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Other Considerations
            </p>
            <div className="grid gap-2">
              {Object.entries(systemInfo.dev_tools)
                .filter(([key, tool]) => key !== 'has_homebrew' && (tool as any).category === 'other')
                .map(([key, tool]) => {
                  const t = tool as any;
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg",
                        t.installed ? "bg-muted/50 border border-border/50" : "bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center bg-muted"
                        )}>
                          {t.installed ? (
                            <Check className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Download className="w-4 h-4 text-muted-foreground/50" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{t.display_name}</p>
                          <p className="text-xs text-muted-foreground">{t.description}</p>
                        </div>
                      </div>
                      <div>
                        {t.installed ? (
                          <span className="text-xs text-muted-foreground">Installed</span>
                        ) : t.download_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(t.download_url, '_blank')}
                            className="text-muted-foreground hover:text-foreground text-xs"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Learn More
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Quick Links */}
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground mb-2">Quick Links</p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://claude.ai/settings/plans"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Crown className="w-3 h-3" />
                Claude Max Plan
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-muted-foreground">|</span>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                OpenAI API Keys
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-muted-foreground">|</span>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Key className="w-3 h-3" />
                Anthropic API Keys
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Plan Upgrade CTA */}
      {userPlan?.tier === 'free' && (
        <div className="glass rounded-lg p-4 bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <Crown className="w-4 h-4 text-primary" />
                Unlock More Models
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Upgrade to Pro or Advanced for larger models, model switching, and encrypted local storage.
              </p>
            </div>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Upgrade Plan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
