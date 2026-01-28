'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import {
  fetchModelStatus,
  fetchUserPlan,
  fetchHardwareInfo,
  fetchMemoryStats,
  fetchMLXStatus,
  purgeMemory,
  downloadModel,
  downloadMLXModel,
  configureMLXModel,
  switchModel,
  deleteModel,
  formatBytes,
  testInference,
  analyzeSystem,
  analyzeWorkspace,
  saveHierarchyProfile,
  fetchHierarchyProfile,
  answerClarifyingQuestion,
} from '@/lib/api';
import type { InferenceResult } from '@/lib/api';
import type {
  ModelDownloadProgress,
  AvailableModel,
  SystemAnalysis,
  DetectedProject,
  HierarchyProfile,
  ClarifyingQuestion,
} from '@/lib/types';
import { AVAILABLE_MODELS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Download,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  HardDrive,
  Cpu,
  RefreshCw,
  Play,
  Lock,
  Crown,
  Sparkles,
  MemoryStick,
  Zap,
  Scan,
  FolderTree,
  GitBranch,
  Server,
  Database,
  Fingerprint,
  Monitor,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Save,
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

  const { data: hardwareInfo } = useSWR(
    'hardware-info',
    fetchHardwareInfo,
    { refreshInterval: 30000 }
  );

  const { data: memoryStats, mutate: mutateMemory } = useSWR(
    'memory-stats',
    fetchMemoryStats,
    { refreshInterval: 10000 }
  );

  const { data: mlxStatus, mutate: mutateMLX } = useSWR(
    'mlx-status',
    fetchMLXStatus,
    { refreshInterval: 30000 }
  );

  const [purging, setPurging] = useState(false);
  const [configuringModel, setConfiguringModel] = useState<string | null>(null);

  // System Analysis state
  const [systemAnalysis, setSystemAnalysis] = useState<SystemAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSystemAnalysis, setShowSystemAnalysis] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [currentQuestion, setCurrentQuestion] = useState<ClarifyingQuestion | null>(null);
  const [isSavingHierarchy, setIsSavingHierarchy] = useState(false);
  const [hierarchySaved, setHierarchySaved] = useState(false);

  // Inference test state
  const [testPrompt, setTestPrompt] = useState('');
  const [testSystem, setTestSystem] = useState('You are a helpful coding assistant.');
  const [testResult, setTestResult] = useState<InferenceResult | null>(null);
  const [isInferring, setIsInferring] = useState(false);
  const [showInferenceTest, setShowInferenceTest] = useState(false);

  const handlePurgeMemory = async () => {
    setPurging(true);
    await purgeMemory();
    await mutateMemory();
    setPurging(false);
  };

  // System Analysis handlers
  const handleAnalyzeSystem = async () => {
    setIsAnalyzing(true);
    setHierarchySaved(false);
    try {
      const result = await analyzeSystem();
      setSystemAnalysis(result);

      // Pre-select all detected projects
      if (result.workspace?.profile?.projects) {
        setSelectedProjects(new Set(
          result.workspace.profile.projects
            .filter(p => p.selected)
            .map(p => p.path)
        ));
      }

      // Check for clarifying questions
      if (result.workspace?.questions && result.workspace.questions.length > 0) {
        setCurrentQuestion(result.workspace.questions[0]);
      }
    } catch (error) {
      console.error('System analysis failed:', error);
    }
    setIsAnalyzing(false);
  };

  const handleAnswerQuestion = async (questionId: string, answer: string) => {
    try {
      const result = await answerClarifyingQuestion(questionId, answer);
      if (result.profile) {
        setSystemAnalysis(prev => prev ? { ...prev, workspace: result } : null);
      }

      // Move to next question or clear
      if (result.questions && result.questions.length > 0) {
        setCurrentQuestion(result.questions[0]);
      } else {
        setCurrentQuestion(null);
      }
    } catch (error) {
      console.error('Failed to answer question:', error);
    }
  };

  const handleToggleProject = (projectPath: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectPath)) {
        next.delete(projectPath);
      } else {
        next.add(projectPath);
      }
      return next;
    });
  };

  const handleSaveHierarchy = async () => {
    if (!systemAnalysis?.workspace?.profile) return;

    setIsSavingHierarchy(true);
    try {
      // Update profile with user selections
      const updatedProfile: HierarchyProfile = {
        ...systemAnalysis.workspace.profile,
        projects: systemAnalysis.workspace.profile.projects.map(p => ({
          ...p,
          selected: selectedProjects.has(p.path),
        })),
      };

      const result = await saveHierarchyProfile(updatedProfile);
      if (result.success) {
        setHierarchySaved(true);
        // Update the analysis state with new version
        setSystemAnalysis(prev => prev ? {
          ...prev,
          workspace: prev.workspace ? {
            ...prev.workspace,
            profile: { ...updatedProfile, version: result.version },
          } : null,
        } : null);
      }
    } catch (error) {
      console.error('Failed to save hierarchy:', error);
    }
    setIsSavingHierarchy(false);
  };

  const getProjectTypeIcon = (type: string) => {
    switch (type) {
      case 'git_repo': return <GitBranch className="w-4 h-4" />;
      case 'submodule': return <GitBranch className="w-4 h-4 text-purple-400" />;
      case 'service': return <Server className="w-4 h-4 text-blue-400" />;
      case 'package': return <FolderTree className="w-4 h-4 text-yellow-400" />;
      default: return <FolderTree className="w-4 h-4" />;
    }
  };

  const isLoading = statusLoading || planLoading;
  const installedModelNames = new Set(modelStatus?.installedModels.map(m => m.name) || []);

  // Check if model is available based on user plan
  const canAccessModel = (model: AvailableModel): boolean => {
    if (!userPlan) return false;
    const tierOrder = { free: 0, pro: 1, advanced: 2 };
    return tierOrder[userPlan.tier] >= tierOrder[model.tier];
  };

  // Handle Ollama model download
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

  // Handle MLX model download and configuration
  const handleMLXDownload = async (modelId: string) => {
    setDownloadProgress(prev => ({
      ...prev,
      [modelId]: {
        modelId,
        status: 'downloading',
        progress: 10,
        downloadedBytes: 0,
        totalBytes: 0,
      },
    }));

    const result = await downloadMLXModel(modelId, false, (progress) => {
      setDownloadProgress(prev => ({ ...prev, [modelId]: progress }));
    });

    if (result.success) {
      // Configure as default
      setConfiguringModel(modelId);
      setDownloadProgress(prev => ({
        ...prev,
        [modelId]: { ...prev[modelId], status: 'verifying', progress: 90 },
      }));

      await configureMLXModel(modelId, { setAsDefault: true });
      setConfiguringModel(null);

      // Clear progress and refresh
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newState = { ...prev };
          delete newState[modelId];
          return newState;
        });
        mutateStatus();
        mutateMLX();
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

  // Handle inference test
  const handleTestInference = async () => {
    if (!testPrompt.trim() || isInferring) return;

    setIsInferring(true);
    setTestResult(null);

    const activeModel = modelStatus?.activeModel || hardwareInfo?.recommended_model || 'qwen2.5-coder:7b';
    const backend = hardwareInfo?.recommended_backend || 'ollama';

    const result = await testInference({
      prompt: testPrompt,
      system: testSystem || undefined,
      model_ref: activeModel,
      backend: backend as 'mlx' | 'ollama',
      max_tokens: 512,
    });

    setTestResult(result);
    setIsInferring(false);
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

      {/* System Analysis Section */}
      <div className="glass rounded-lg p-4 space-y-4">
        <button
          onClick={() => setShowSystemAnalysis(!showSystemAnalysis)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Scan className="w-4 h-4 text-primary" />
            System & Workspace Analysis
          </h3>
          <div className="flex items-center gap-2">
            {systemAnalysis?.device && (
              <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full flex items-center gap-1">
                <Fingerprint className="w-3 h-3" />
                Device Registered
              </span>
            )}
            {hierarchySaved && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                <Database className="w-3 h-3" />
                Saved
              </span>
            )}
            {showSystemAnalysis ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {showSystemAnalysis && (
          <div className="space-y-4 pt-2 border-t border-border/50">
            {/* Analyze Button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Analyze your system hardware, device identity, and workspace structure
              </p>
              <Button
                onClick={handleAnalyzeSystem}
                disabled={isAnalyzing}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Scan className="w-4 h-4 mr-2" />
                    Analyze System
                  </>
                )}
              </Button>
            </div>

            {/* Analysis Results */}
            {systemAnalysis && (
              <div className="space-y-4">
                {/* Device Info */}
                {systemAnalysis.device && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Fingerprint className="w-4 h-4 text-primary" />
                      Device Identity
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">OS</span>
                        <p className="text-foreground">{systemAnalysis.device.os} {systemAnalysis.device.os_version}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Architecture</span>
                        <p className="text-foreground">{systemAnalysis.device.arch}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Device ID</span>
                        <p className="text-foreground font-mono truncate" title={systemAnalysis.device.device_id}>
                          {systemAnalysis.device.device_id.substring(0, 12)}...
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fingerprint</span>
                        <p className="text-foreground font-mono truncate" title={systemAnalysis.device.fingerprint}>
                          {systemAnalysis.device.fingerprint.substring(0, 12)}...
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Workspace Analysis */}
                {systemAnalysis.workspace?.profile && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FolderTree className="w-4 h-4 text-primary" />
                        Workspace Structure
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        systemAnalysis.workspace.profile.repo_type === 'submodule-monorepo'
                          ? 'bg-purple-500/10 text-purple-400'
                          : systemAnalysis.workspace.profile.repo_type === 'monorepo'
                          ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {systemAnalysis.workspace.profile.repo_type}
                      </span>
                    </div>

                    {/* Detected Projects */}
                    {systemAnalysis.workspace.profile.projects.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Detected {systemAnalysis.workspace.profile.projects.length} projects/modules:
                        </p>
                        <div className="grid gap-2 max-h-48 overflow-y-auto">
                          {systemAnalysis.workspace.profile.projects.map((project) => (
                            <label
                              key={project.path}
                              className={cn(
                                'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                                selectedProjects.has(project.path)
                                  ? 'bg-primary/10 border border-primary/30'
                                  : 'bg-background/50 border border-transparent hover:bg-background'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selectedProjects.has(project.path)}
                                onChange={() => handleToggleProject(project.path)}
                                className="sr-only"
                              />
                              <div className={cn(
                                'w-5 h-5 rounded flex items-center justify-center border',
                                selectedProjects.has(project.path)
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground/30'
                              )}>
                                {selectedProjects.has(project.path) && (
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                )}
                              </div>
                              {getProjectTypeIcon(project.type)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground truncate">
                                    {project.name}
                                  </span>
                                  {project.framework && (
                                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                      {project.framework}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {project.path}
                                </p>
                              </div>
                              <span className={cn(
                                'text-xs',
                                project.confidence > 0.8 ? 'text-success' :
                                project.confidence > 0.5 ? 'text-yellow-400' : 'text-muted-foreground'
                              )}>
                                {Math.round(project.confidence * 100)}%
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Infrastructure Detection */}
                    {systemAnalysis.workspace.profile.infrastructure && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">Infrastructure:</span>
                        {systemAnalysis.workspace.profile.infrastructure.docker && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <CheckCircle2 className="w-3 h-3" /> Docker
                          </span>
                        )}
                        {systemAnalysis.workspace.profile.infrastructure.terraform && (
                          <span className="flex items-center gap-1 text-purple-400">
                            <CheckCircle2 className="w-3 h-3" /> Terraform
                          </span>
                        )}
                        {systemAnalysis.workspace.profile.infrastructure.kubernetes && (
                          <span className="flex items-center gap-1 text-cyan-400">
                            <CheckCircle2 className="w-3 h-3" /> Kubernetes
                          </span>
                        )}
                        {!systemAnalysis.workspace.profile.infrastructure.docker &&
                         !systemAnalysis.workspace.profile.infrastructure.terraform &&
                         !systemAnalysis.workspace.profile.infrastructure.kubernetes && (
                          <span className="text-muted-foreground">None detected</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Clarifying Questions */}
                {currentQuestion && (
                  <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-yellow-400">Clarification Needed</p>
                        <p className="text-sm text-foreground mt-1">{currentQuestion.question}</p>
                        {currentQuestion.context && (
                          <p className="text-xs text-muted-foreground mt-1">{currentQuestion.context}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {currentQuestion.options.map((option) => (
                        <Button
                          key={option.value}
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnswerQuestion(currentQuestion.id, option.value)}
                          className={cn(
                            'border-border',
                            option.recommended && 'border-primary/50 bg-primary/5'
                          )}
                        >
                          {option.label}
                          {option.recommended && (
                            <span className="ml-1 text-xs text-primary">(Recommended)</span>
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save Button */}
                {systemAnalysis.workspace?.profile && !currentQuestion && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-muted-foreground">
                      {selectedProjects.size} of {systemAnalysis.workspace.profile.projects.length} projects selected
                    </p>
                    <Button
                      onClick={handleSaveHierarchy}
                      disabled={isSavingHierarchy || hierarchySaved}
                      className={cn(
                        hierarchySaved
                          ? 'bg-success text-success-foreground'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      )}
                      size="sm"
                    >
                      {isSavingHierarchy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : hierarchySaved ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Saved to PostgreSQL
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Hierarchy
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Error State */}
                {systemAnalysis.workspace?.status === 'error' && (
                  <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      {systemAnalysis.workspace.error || 'Workspace analysis failed'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Initial State - No analysis yet */}
            {!systemAnalysis && !isAnalyzing && (
              <div className="text-center py-4">
                <Monitor className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click "Analyze System" to detect your hardware, device identity, and workspace structure
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hardware & Memory Info */}
      {hardwareInfo && (
        <div className="glass rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              System Hardware
            </h3>
            {hardwareInfo.is_apple_silicon && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                Apple Silicon
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Processor</p>
              <p className="text-foreground">{hardwareInfo.chip_name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total RAM</p>
              <p className="text-foreground">{hardwareInfo.ram_gb} GB</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Available RAM</p>
              <p className="text-foreground">
                {memoryStats?.available_gb != null ? `${memoryStats.available_gb.toFixed(1)} GB` : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Recommended</p>
              <p className="text-foreground text-xs">{hardwareInfo.recommended_model_name}</p>
            </div>
          </div>

          {/* Rosetta 2 Warning */}
          {hardwareInfo.is_rosetta && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-400">Rosetta 2 Detected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Python is running under x86_64 emulation. MLX requires native ARM64 Python for Metal GPU acceleration.
                  Run the Context DNA installer to set up a native environment.
                </p>
              </div>
            </div>
          )}

          {/* Memory Purge Option */}
          {memoryStats?.cache_reclaimable_gb != null && memoryStats.cache_reclaimable_gb > 1 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <MemoryStick className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  ~{memoryStats.cache_reclaimable_gb.toFixed(1)} GB reclaimable from cache
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePurgeMemory}
                disabled={purging}
                className="border-border"
              >
                {purging ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-1" />
                )}
                Free RAM
              </Button>
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

      {/* MLX Status (Apple Silicon) */}
      {mlxStatus && hardwareInfo?.is_apple_silicon && (
        <div className="glass rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              MLX Backend (Apple Silicon Native)
            </h3>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                mlxStatus.mlx_installed
                  ? 'bg-success/10 text-success'
                  : 'bg-yellow-500/10 text-yellow-400'
              )}
            >
              {mlxStatus.mlx_installed ? `MLX ${mlxStatus.mlx_version}` : 'Not Installed'}
            </span>
          </div>

          {mlxStatus.loaded_models.length > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Loaded in Metal: </span>
              <span className="text-foreground">{mlxStatus.loaded_models.join(', ')}</span>
            </div>
          )}

          {mlxStatus.warnings.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground">
                {mlxStatus.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            </div>
          )}

          {!mlxStatus.mlx_installed && mlxStatus.install_instructions && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Install: </span>
              <code className="bg-muted px-2 py-0.5 rounded">{mlxStatus.install_instructions}</code>
            </div>
          )}
        </div>
      )}

      {/* Recommended for Your Hardware */}
      {hardwareInfo?.all_models && hardwareInfo.all_models.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Recommended for Your Hardware
            </h2>
            <span className="text-xs text-muted-foreground">
              {hardwareInfo.ram_gb}GB RAM • {hardwareInfo.recommended_backend.toUpperCase()}
            </span>
          </div>

          <div className="grid gap-3">
            {hardwareInfo.all_models.map((model) => {
              const progress = downloadProgress[model.id];
              const isDownloading = progress && progress.status !== 'complete' && progress.status !== 'error';
              const isMLX = model.id.includes('mlx-community') || model.id.includes('Instruct-4bit') || model.id.includes('Instruct-8bit');
              const isLoaded = mlxStatus?.loaded_models.includes(model.id);

              return (
                <div
                  key={model.id}
                  className={cn(
                    'glass rounded-lg p-4 transition-all duration-200',
                    'hover:bg-[#1e1e28]',
                    !model.fits_in_ram && 'opacity-60',
                    model.recommended && 'ring-1 ring-primary/30'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{model.name}</span>
                        {model.recommended && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            Recommended
                          </span>
                        )}
                        {isMLX && (
                          <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            MLX Native
                          </span>
                        )}
                        {isLoaded && (
                          <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">
                            Loaded
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          {model.size}
                        </span>
                        <span className="flex items-center gap-1">
                          <Cpu className="w-3 h-3" />
                          {model.ram_required}GB RAM
                        </span>
                        {!model.fits_in_ram && (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Exceeds RAM
                          </span>
                        )}
                      </div>

                      {/* Download Progress */}
                      {progress && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">
                              {progress.status === 'downloading' ? 'Downloading...' :
                               progress.status === 'verifying' ? 'Configuring...' :
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
                      {isLoaded ? (
                        <span className="flex items-center gap-1.5 text-success text-sm">
                          <Check className="w-4 h-4" />
                          Active
                        </span>
                      ) : !model.fits_in_ram ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="border-border"
                          title="Model exceeds available RAM"
                        >
                          <AlertCircle className="w-4 h-4 mr-2" />
                          Too Large
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
                          onClick={() => isMLX ? handleMLXDownload(model.id) : handleDownload(model.id)}
                          className="border-primary/20 text-primary hover:bg-primary/10"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          {isMLX ? 'Install' : 'Download'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Available Models */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          All Available Models
        </h2>

        <div className="grid gap-3">
          {AVAILABLE_MODELS.map((model) => {
            const isInstalled = installedModelNames.has(model.name);
            const canAccess = canAccessModel(model);
            const progress = downloadProgress[model.id];
            const isDownloading = progress && progress.status !== 'complete' && progress.status !== 'error';
            const isMLX = model.backend === 'mlx';

            // Skip MLX models on non-Apple Silicon
            if (model.appleSiliconOnly && !hardwareInfo?.is_apple_silicon) {
              return null;
            }

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
                    <div className="flex items-center gap-2 flex-wrap">
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
                      {isMLX && (
                        <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          MLX
                        </span>
                      )}
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
                        onClick={() => isMLX ? handleMLXDownload(model.id) : handleDownload(model.id)}
                        className="border-primary/20 text-primary hover:bg-primary/10"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {isMLX ? 'Install' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inference Test */}
      <div className="glass rounded-lg p-4 space-y-4">
        <button
          onClick={() => setShowInferenceTest(!showInferenceTest)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Play className="w-4 h-4" />
            Test Local LLM
          </h3>
          <span className="text-xs text-muted-foreground">
            {showInferenceTest ? '▼' : '▶'}
          </span>
        </button>

        {showInferenceTest && (
          <div className="space-y-4 pt-2 border-t border-border/50">
            {/* System Prompt */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                System Prompt (optional)
              </label>
              <input
                type="text"
                value={testSystem}
                onChange={(e) => setTestSystem(e.target.value)}
                placeholder="You are a helpful assistant..."
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:border-primary focus:outline-none text-foreground"
              />
            </div>

            {/* User Prompt */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Prompt
              </label>
              <textarea
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Write a Python function that..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:border-primary focus:outline-none text-foreground resize-none"
              />
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Model: {modelStatus?.activeModel || hardwareInfo?.recommended_model || 'Not selected'}
              </div>
              <Button
                onClick={handleTestInference}
                disabled={!testPrompt.trim() || isInferring}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                size="sm"
              >
                {isInferring ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Inference
                  </>
                )}
              </Button>
            </div>

            {/* Result */}
            {testResult && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Response</span>
                  <span className="text-xs text-muted-foreground">
                    Backend: {testResult.backend}
                  </span>
                </div>
                {testResult.error ? (
                  <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {testResult.error}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-muted rounded-lg border border-border">
                    <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                      {testResult.result}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
