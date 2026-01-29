'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  installWizardAnalyze,
  installWizardPlan,
  installWizardExecute,
  installWizardStatus,
  installWizardReset,
} from '@/lib/api';
import type {
  InstallWizardAnalysis,
  InstallComponent,
  InstallationPlan,
  InstallationStatus,
  InstallExecutionResult,
} from '@/lib/types';

type WizardStep = 'analyze' | 'select' | 'plan' | 'install' | 'complete';

const PRIORITY_STYLES = {
  required: {
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Required',
  },
  recommended: {
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    label: 'Recommended',
  },
  optional: {
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    label: 'Optional',
  },
};

const CATEGORY_ICONS: Record<string, string> = {
  runtime: '⚙️',
  version_control: '📚',
  ide: '💻',
  extension: '🧩',
  ai_backend: '🤖',
  container: '📦',
};

function ComponentCard({
  component,
  selected,
  onToggle,
  disabled,
}: {
  component: InstallComponent;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const priorityStyle = PRIORITY_STYLES[component.priority];
  const categoryIcon = CATEGORY_ICONS[component.category] || '📦';
  const isRequired = component.priority === 'required';

  return (
    <div
      className={`glass rounded-lg p-4 transition-all ${
        selected ? 'ring-2 ring-green-500/50 bg-green-500/5' : ''
      } ${component.is_installed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <span className="text-2xl">{categoryIcon}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium">{component.name}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${priorityStyle.badge}`}
              >
                {priorityStyle.label}
              </span>
              {component.is_installed && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                  Installed {component.installed_version && `(${component.installed_version})`}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{component.description}</p>
          </div>
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={selected || isRequired}
            onChange={onToggle}
            disabled={disabled || isRequired || component.is_installed}
            className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500 focus:ring-offset-0 disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ progress, label }: { progress: number; label?: string }) {
  return (
    <div className="space-y-2">
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{progress}%</p>
    </div>
  );
}

export function InstallWizardView() {
  const [step, setStep] = useState<WizardStep>('analyze');
  const [analysis, setAnalysis] = useState<InstallWizardAnalysis | null>(null);
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [useAaronsBaseline, setUseAaronsBaseline] = useState(true);
  const [plan, setPlan] = useState<InstallationPlan | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<InstallExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll installation status during execution
  const { data: installStatus } = useSWR<InstallationStatus>(
    executing ? 'install-status' : null,
    installWizardStatus,
    { refreshInterval: 1000 }
  );

  const handleAnalyze = useCallback(async () => {
    setError(null);
    try {
      const result = await installWizardAnalyze();
      setAnalysis(result);

      // Pre-select required and recommended components
      const preSelected = new Set<string>();
      result.components.forEach((comp) => {
        if (comp.priority === 'required' || (comp.priority === 'recommended' && !comp.is_installed)) {
          preSelected.add(comp.id);
        }
      });
      setSelectedComponents(preSelected);

      setStep('select');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    }
  }, []);

  const handleGeneratePlan = useCallback(async () => {
    setError(null);
    try {
      const result = await installWizardPlan({
        selected_components: Array.from(selectedComponents),
        use_aarons_baseline: useAaronsBaseline,
      });
      setPlan(result.plan);
      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan generation failed');
    }
  }, [selectedComponents, useAaronsBaseline]);

  const handleExecute = useCallback(async (dryRun = false) => {
    setError(null);
    setExecuting(true);
    try {
      const result = await installWizardExecute({ dry_run: dryRun });
      setExecutionResult(result);
      setExecuting(false);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
      setExecuting(false);
    }
  }, []);

  const handleReset = useCallback(async () => {
    await installWizardReset();
    setStep('analyze');
    setAnalysis(null);
    setSelectedComponents(new Set());
    setPlan(null);
    setExecutionResult(null);
    setError(null);
  }, []);

  const toggleComponent = useCallback((id: string) => {
    setSelectedComponents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'analyze':
        return (
          <div className="space-y-6">
            <div className="glass rounded-lg p-6 text-center">
              <div className="text-6xl mb-4">🧬</div>
              <h2 className="text-2xl font-bold mb-2">Context DNA Installation Wizard</h2>
              <p className="text-muted-foreground mb-6">
                This wizard will analyze your system and guide you through installing Context DNA
                with all required dependencies.
              </p>

              <div className="grid grid-cols-3 gap-4 mb-6 text-left">
                <div className="glass rounded-lg p-4">
                  <div className="text-2xl mb-2">🔍</div>
                  <h3 className="font-medium mb-1">System Analysis</h3>
                  <p className="text-xs text-muted-foreground">
                    Detect installed tools, IDEs, and extensions
                  </p>
                </div>
                <div className="glass rounded-lg p-4">
                  <div className="text-2xl mb-2">📋</div>
                  <h3 className="font-medium mb-1">Smart Planning</h3>
                  <p className="text-xs text-muted-foreground">
                    Generate optimal installation plan
                  </p>
                </div>
                <div className="glass rounded-lg p-4">
                  <div className="text-2xl mb-2">🚀</div>
                  <h3 className="font-medium mb-1">Automated Install</h3>
                  <p className="text-xs text-muted-foreground">
                    One-click installation of all components
                  </p>
                </div>
              </div>

              <Button
                onClick={handleAnalyze}
                className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8"
              >
                🔍 Analyze System
              </Button>
            </div>
          </div>
        );

      case 'select':
        if (!analysis) return null;

        const groupedComponents = {
          required: analysis.components.filter((c) => c.priority === 'required'),
          recommended: analysis.components.filter((c) => c.priority === 'recommended'),
          optional: analysis.components.filter((c) => c.priority === 'optional'),
        };

        return (
          <div className="space-y-6">
            {/* System Summary */}
            <div className="glass rounded-lg p-4">
              <h3 className="font-medium mb-3">System Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">OS:</span>{' '}
                  {analysis.hardware?.os || 'Unknown'}
                </div>
                <div>
                  <span className="text-muted-foreground">Architecture:</span>{' '}
                  {analysis.hardware?.arch || 'Unknown'}
                </div>
                <div>
                  <span className="text-muted-foreground">RAM:</span>{' '}
                  {analysis.hardware?.ram_gb || 'Unknown'} GB
                </div>
                <div>
                  <span className="text-muted-foreground">Apple Silicon:</span>{' '}
                  {analysis.hardware?.is_apple_silicon ? '✅ Yes' : '❌ No'}
                </div>
              </div>
            </div>

            {/* Aaron's Baseline Toggle */}
            <div className="glass rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAaronsBaseline}
                  onChange={(e) => setUseAaronsBaseline(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-green-500 focus:ring-green-500"
                />
                <div>
                  <span className="font-medium">Use Aaron&apos;s Baseline</span>
                  <span className="text-amber-400 ml-2 text-xs">(Recommended)</span>
                  <p className="text-sm text-muted-foreground">
                    Install with the recommended configuration that Aaron uses
                  </p>
                </div>
              </label>
            </div>

            {/* Required Components */}
            {groupedComponents.required.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Required Components
                </h3>
                <div className="space-y-2">
                  {groupedComponents.required.map((comp) => (
                    <ComponentCard
                      key={comp.id}
                      component={comp}
                      selected={selectedComponents.has(comp.id)}
                      onToggle={() => toggleComponent(comp.id)}
                      disabled={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Components */}
            {groupedComponents.recommended.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Recommended Components
                </h3>
                <div className="space-y-2">
                  {groupedComponents.recommended.map((comp) => (
                    <ComponentCard
                      key={comp.id}
                      component={comp}
                      selected={selectedComponents.has(comp.id)}
                      onToggle={() => toggleComponent(comp.id)}
                      disabled={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Optional Components */}
            {groupedComponents.optional.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Optional Components
                </h3>
                <div className="space-y-2">
                  {groupedComponents.optional.map((comp) => (
                    <ComponentCard
                      key={comp.id}
                      component={comp}
                      selected={selectedComponents.has(comp.id)}
                      onToggle={() => toggleComponent(comp.id)}
                      disabled={false}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleReset}>
                ← Back
              </Button>
              <Button
                onClick={handleGeneratePlan}
                className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
              >
                Generate Plan →
              </Button>
            </div>
          </div>
        );

      case 'plan':
        if (!plan) return null;

        return (
          <div className="space-y-6">
            <div className="glass rounded-lg p-4">
              <h3 className="font-medium mb-3">Installation Plan</h3>
              <div className="flex gap-4 text-sm mb-4">
                <div>
                  <span className="text-muted-foreground">Steps:</span> {plan.total_steps}
                </div>
                <div>
                  <span className="text-muted-foreground">Estimated Time:</span>{' '}
                  {Math.ceil(plan.estimated_total_time / 60)} minutes
                </div>
              </div>
            </div>

            {/* Installation Steps */}
            <div className="space-y-2">
              {plan.steps.map((step, idx) => (
                <div key={step.component_id} className="glass rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-medium">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.name}</div>
                    <div className="text-xs text-muted-foreground">{step.description}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ~{step.estimated_time}s
                  </div>
                </div>
              ))}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep('select')}>
                ← Back
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => handleExecute(true)}>
                  🧪 Dry Run
                </Button>
                <Button
                  onClick={() => handleExecute(false)}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                >
                  🚀 Install Now
                </Button>
              </div>
            </div>
          </div>
        );

      case 'install':
        return (
          <div className="space-y-6">
            <div className="glass rounded-lg p-6 text-center">
              <div className="text-6xl mb-4 animate-pulse">⚡</div>
              <h2 className="text-xl font-bold mb-4">Installing...</h2>
              {installStatus && (
                <>
                  <ProgressBar
                    progress={installStatus.progress}
                    label={installStatus.current_step || 'Preparing...'}
                  />
                  <div className="mt-4 text-sm text-muted-foreground">
                    {installStatus.steps_completed.length} of {plan?.total_steps || '?'} steps
                    completed
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case 'complete':
        if (!executionResult) return null;

        const hasErrors = executionResult.errors.length > 0;

        return (
          <div className="space-y-6">
            <div className="glass rounded-lg p-6 text-center">
              <div className="text-6xl mb-4">{hasErrors ? '⚠️' : '🎉'}</div>
              <h2 className="text-2xl font-bold mb-2">
                {hasErrors ? 'Installation Complete with Warnings' : 'Installation Complete!'}
              </h2>
              <p className="text-muted-foreground mb-4">
                {executionResult.success_count} of {executionResult.total_count} components
                installed successfully
              </p>
            </div>

            {/* Results */}
            <div className="space-y-2">
              {executionResult.results.map((result) => (
                <div
                  key={result.component_id}
                  className={`glass rounded-lg p-3 flex items-center gap-3 ${
                    result.status === 'success'
                      ? 'border-l-4 border-green-500'
                      : result.status === 'failed' || result.status === 'error'
                      ? 'border-l-4 border-red-500'
                      : 'border-l-4 border-gray-500'
                  }`}
                >
                  <span className="text-xl">
                    {result.status === 'success'
                      ? '✅'
                      : result.status === 'skipped'
                      ? '⏭️'
                      : '❌'}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium">{result.name}</div>
                    {result.error && (
                      <div className="text-xs text-red-400">{result.error}</div>
                    )}
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      result.status === 'success'
                        ? 'bg-green-500/20 text-green-400'
                        : result.status === 'skipped'
                        ? 'bg-gray-500/20 text-gray-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {result.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Errors */}
            {hasErrors && (
              <div className="glass rounded-lg p-4 border border-red-500/30">
                <h3 className="font-medium text-red-400 mb-2">Errors</h3>
                <ul className="text-sm space-y-1">
                  {executionResult.errors.map((err, idx) => (
                    <li key={idx} className="text-red-300">
                      • {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Steps */}
            <div className="glass rounded-lg p-4">
              <h3 className="font-medium mb-2">Next Steps</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Open your IDE and start coding with Context DNA active</li>
                <li>• Your first prompt will trigger the webhook injection</li>
                <li>• Visit the Dashboard to see your learnings accumulate</li>
              </ul>
            </div>

            {/* Navigation */}
            <div className="flex justify-center pt-4">
              <Button onClick={handleReset} variant="outline">
                Start Over
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex justify-center gap-2">
        {(['analyze', 'select', 'plan', 'install', 'complete'] as WizardStep[]).map((s, idx) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? 'bg-green-500 text-white'
                  : idx < ['analyze', 'select', 'plan', 'install', 'complete'].indexOf(step)
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {idx + 1}
            </div>
            {idx < 4 && <div className="w-8 h-0.5 bg-gray-800 mx-1" />}
          </div>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="glass rounded-lg p-4 border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-2 text-red-400">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Step Content */}
      {renderStepContent()}
    </div>
  );
}
