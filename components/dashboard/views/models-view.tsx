'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import {
  fetchModelStatus,
  fetchUserPlan,
  downloadModel,
  switchModel,
  deleteModel,
  formatBytes,
} from '@/lib/api';
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
} from 'lucide-react';

export function ModelsView() {
  const [downloadProgress, setDownloadProgress] = useState<Record<string, ModelDownloadProgress>>({});
  const [switchingModel, setSwitchingModel] = useState<string | null>(null);
  const [deletingModel, setDeletingModel] = useState<string | null>(null);

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

  const isLoading = statusLoading || planLoading;
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
              onClick={() => mutateStatus()}
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

            return (
              <div
                key={model.id}
                className={cn(
                  'glass rounded-lg p-4 transition-all duration-200',
                  'hover:bg-[#1e1e28]',
                  !canAccess && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{model.displayName}</span>
                      {model.recommended && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Recommended
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
                        className="border-primary/20 text-primary hover:bg-primary/10"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
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
