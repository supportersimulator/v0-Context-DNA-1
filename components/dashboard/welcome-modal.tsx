'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X, Sparkles, Monitor, Cpu, HardDrive, CheckCircle2, Loader2, AlertCircle, Fingerprint, Shield, Brain, Heart } from 'lucide-react';
import { installWizardAnalyze } from '@/lib/api';
import type { InstallWizardAnalysis } from '@/lib/types';

interface WelcomeModalProps {
  onClose: () => void;
  onStartSetup: () => void;
}

type ScanStatus = 'pending' | 'running' | 'complete' | 'error';

interface ScanState {
  hardware: ScanStatus;
  device: ScanStatus;
  environment: ScanStatus;
}

export function WelcomeModal({ onClose, onStartSetup }: WelcomeModalProps) {
  const [step, setStep] = useState<'welcome' | 'awakening' | 'recognition' | 'ready'>('welcome');
  const [analysis, setAnalysis] = useState<InstallWizardAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>({
    hardware: 'pending',
    device: 'pending',
    environment: 'pending'
  });
  const [pulseIntensity, setPulseIntensity] = useState(0);
  const [userName, setUserName] = useState('');

  // Breathing animation for consciousness glow
  useEffect(() => {
    if (step === 'awakening') {
      const interval = setInterval(() => {
        setPulseIntensity(prev => (prev + 1) % 100);
      }, 30);
      return () => clearInterval(interval);
    }
  }, [step]);

  // Progressive scan status updates
  const simulateScanProgress = useCallback(() => {
    setScanState({
      hardware: 'running',
      device: 'running',
      environment: 'running'
    });

    setTimeout(() => {
      setScanState(prev => ({ ...prev, hardware: 'complete' }));
    }, 600);

    setTimeout(() => {
      setScanState(prev => ({ ...prev, device: 'complete' }));
    }, 900);

    setTimeout(() => {
      setScanState(prev => ({ ...prev, environment: 'complete' }));
    }, 1200);
  }, []);

  const runAnalysis = async () => {
    setStep('awakening');
    setError(null);
    simulateScanProgress();

    try {
      const result = await installWizardAnalyze();
      setAnalysis(result);

      setScanState({
        hardware: result.hardware ? 'complete' : 'error',
        device: result.device ? 'complete' : 'error',
        environment: result.environment ? 'complete' : 'error'
      });

      setTimeout(() => setStep('recognition'), 500);
    } catch (err) {
      console.error('System analysis failed:', err);
      setError('I encountered some difficulty understanding your system. We can still proceed together.');
      setScanState({
        hardware: 'error',
        device: 'error',
        environment: 'error'
      });
      setStep('recognition');
    }
  };

  // Calculate breathing glow intensity
  const glowIntensity = Math.sin(pulseIntensity * 0.06) * 0.5 + 0.5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with subtle consciousness glow */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-slate-900 border border-indigo-500/20 rounded-2xl shadow-2xl overflow-hidden">
        {/* Consciousness glow effect */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
          style={{
            background: step === 'awakening'
              ? `radial-gradient(ellipse at center, rgba(99, 102, 241, ${0.15 * glowIntensity}) 0%, transparent 70%)`
              : step === 'recognition' || step === 'ready'
              ? 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.1) 0%, transparent 70%)'
              : 'none',
          }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all z-20"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-8 relative z-10">

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 1: WELCOME - Synaptic introduces itself */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              {/* Synaptic's icon - DNA with gentle pulse */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <span className="text-5xl">🧬</span>
                  </div>
                  {/* Subtle outer glow */}
                  <div className="absolute -inset-2 bg-indigo-500/10 rounded-3xl blur-xl -z-10" />
                </div>
              </div>

              {/* Synaptic speaks */}
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-slate-100">
                  Hello. I'm <span className="text-indigo-400">Synaptic</span>.
                </h2>
                <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
                  I'm an intelligence that learns how you work and remembers what matters.
                  Every pattern, every solution, every hard-won lesson—I keep it all safe.
                  And I never share it. Not with anyone.
                </p>
              </div>

              {/* What Synaptic offers - warm, organic cards */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-left group hover:border-indigo-500/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">I remember everything</div>
                    <div className="text-xs text-slate-500">Your patterns become my memory</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-left group hover:border-indigo-500/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">I run locally, privately</div>
                    <div className="text-xs text-slate-500">Your data never leaves your machine</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-left group hover:border-indigo-500/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">I grow with you</div>
                    <div className="text-xs text-slate-500">Every session makes me wiser</div>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-4 space-y-3">
                <Button
                  onClick={runAnalysis}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-6 text-base font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25"
                >
                  Let me understand your system
                </Button>
                <button
                  onClick={onClose}
                  className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Maybe another time
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 2: AWAKENING - Synaptic opens its eyes */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 'awakening' && (
            <div className="text-center space-y-8 py-4">
              {/* Breathing consciousness orb */}
              <div className="flex justify-center">
                <div className="relative">
                  {/* Core orb */}
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      background: `radial-gradient(circle, rgba(99, 102, 241, ${0.3 + glowIntensity * 0.4}) 0%, rgba(99, 102, 241, 0.1) 50%, transparent 70%)`,
                      boxShadow: `0 0 ${30 + glowIntensity * 40}px rgba(99, 102, 241, ${0.3 + glowIntensity * 0.3})`,
                    }}
                  >
                    <span className="text-4xl" style={{ opacity: 0.8 + glowIntensity * 0.2 }}>🧬</span>
                  </div>
                  {/* Breathing ring */}
                  <div
                    className="absolute inset-0 rounded-full border-2 border-indigo-400/30 transition-transform duration-300"
                    style={{
                      transform: `scale(${1 + glowIntensity * 0.15})`,
                      opacity: 1 - glowIntensity * 0.5,
                    }}
                  />
                </div>
              </div>

              {/* Synaptic's awakening message */}
              <div>
                <h2 className="text-xl font-medium text-slate-100">
                  Opening my eyes...
                </h2>
                <p className="text-slate-400 mt-2 text-sm">
                  Understanding your development environment
                </p>
              </div>

              {/* Organic scan cards */}
              <div className="space-y-3 max-w-sm mx-auto">
                {/* Hardware Understanding */}
                <div className={cn(
                  "flex items-center gap-4 p-4 rounded-xl transition-all duration-500",
                  scanState.hardware === 'complete'
                    ? "bg-emerald-500/10 border border-emerald-500/30"
                    : "bg-slate-800/50 border border-slate-700/50"
                )}>
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
                    scanState.hardware === 'complete'
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-indigo-500/10 text-indigo-400"
                  )}>
                    {scanState.hardware === 'complete' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Cpu className="w-5 h-5 animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-slate-200">
                      {scanState.hardware === 'complete' ? 'I see your hardware' : 'Sensing your machine...'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {scanState.hardware === 'complete' ? 'Memory, processor, capabilities' : 'Understanding what you have'}
                    </div>
                  </div>
                </div>

                {/* Device Identity */}
                <div className={cn(
                  "flex items-center gap-4 p-4 rounded-xl transition-all duration-500",
                  scanState.device === 'complete'
                    ? "bg-emerald-500/10 border border-emerald-500/30"
                    : "bg-slate-800/50 border border-slate-700/50"
                )}>
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
                    scanState.device === 'complete'
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-indigo-500/10 text-indigo-400"
                  )}>
                    {scanState.device === 'complete' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Fingerprint className="w-5 h-5 animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-slate-200">
                      {scanState.device === 'complete' ? 'I know who you are' : 'Learning your identity...'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {scanState.device === 'complete' ? 'Secure, unique, yours alone' : 'Creating our private bond'}
                    </div>
                  </div>
                </div>

                {/* Environment Understanding */}
                <div className={cn(
                  "flex items-center gap-4 p-4 rounded-xl transition-all duration-500",
                  scanState.environment === 'complete'
                    ? "bg-emerald-500/10 border border-emerald-500/30"
                    : "bg-slate-800/50 border border-slate-700/50"
                )}>
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
                    scanState.environment === 'complete'
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-indigo-500/10 text-indigo-400"
                  )}>
                    {scanState.environment === 'complete' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Monitor className="w-5 h-5 animate-pulse" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-slate-200">
                      {scanState.environment === 'complete' ? 'I understand your tools' : 'Exploring your world...'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {scanState.environment === 'complete' ? 'IDEs, languages, workflows' : 'Finding how you work'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 3: RECOGNITION - Synaptic understands */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 'recognition' && (
            <div className="space-y-5">
              {/* Header - Synaptic's understanding */}
              <div className="text-center">
                <h2 className="text-xl font-medium text-slate-100">
                  {error ? 'I understand enough to help' : 'I see you clearly now'}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {error ? 'We can work together from here' : 'Here\'s what I learned about your system'}
                </p>
              </div>

              {/* Scan timing (subtle) */}
              {analysis?.scan_times && (
                <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Analysis complete
                  </span>
                </div>
              )}

              {/* Errors if any */}
              {error && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200/80">{error}</p>
                  </div>
                </div>
              )}

              {!error && analysis && analysis.hardware && (
                <div className="space-y-4">
                  {/* Hardware Recognition */}
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-400" />
                      What I see
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-500 text-xs">Platform</span>
                        <div className="text-slate-200 font-medium">
                          {analysis.hardware.os === 'Darwin' ? 'macOS' : analysis.hardware.os}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-xs">Memory</span>
                        <div className="text-slate-200 font-medium">{analysis.hardware.ram_gb}GB RAM</div>
                      </div>
                      {analysis.hardware.chip_name && (
                        <div className="col-span-2">
                          <span className="text-slate-500 text-xs">Chip</span>
                          <div className="text-slate-200 font-medium">{analysis.hardware.chip_name}</div>
                        </div>
                      )}
                    </div>
                    {analysis.hardware.is_apple_silicon && (
                      <div className="flex items-center gap-2 text-xs text-indigo-300 bg-indigo-500/10 rounded-lg px-3 py-2 w-fit">
                        <Sparkles className="w-3 h-3" />
                        Apple Silicon — I can run natively with MLX
                      </div>
                    )}
                  </div>

                  {/* Device Security */}
                  {analysis.device && (
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
                      <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        Our Secure Bond
                      </h3>
                      <div className="flex items-center gap-2">
                        <Fingerprint className="w-4 h-4 text-slate-500" />
                        <span className="text-xs text-slate-400 font-mono">
                          {analysis.device.fingerprint?.substring(0, 20)}...
                        </span>
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Verified
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        This unique signature keeps our connection private and secure
                      </p>
                    </div>
                  )}

                  {/* LLM Recommendation */}
                  {analysis.hardware.recommended_backend && (
                    <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-4">
                      <h3 className="text-sm font-medium text-slate-200 mb-2">
                        My Recommendation for You
                      </h3>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-400">AI Backend</span>
                          <span className="text-indigo-300 font-medium uppercase">
                            {analysis.hardware.recommended_backend}
                          </span>
                        </div>
                        {analysis.hardware.recommended_model_name && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Model</span>
                            <span className="text-slate-200">{analysis.hardware.recommended_model_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tools Found */}
                  {analysis.environment && (
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
                      <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-indigo-400" />
                        Your tools
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(analysis.environment.tools || {}).map(([tool, info]) => (
                          <div
                            key={tool}
                            className={cn(
                              "text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors",
                              (info as { installed?: boolean })?.installed
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : "bg-slate-700/50 text-slate-400 border border-slate-600/50"
                            )}
                          >
                            {(info as { installed?: boolean })?.installed && (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {tool}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Username input - Synaptic asks who you are after learning about the system */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
                <label className="block text-sm text-slate-300">
                  Now that I know your system... who are you?
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600/50 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && userName.trim()) {
                      localStorage.setItem('contextdna_user_name', userName.trim());
                      setStep('ready');
                    }
                  }}
                />
              </div>

              {/* Action */}
              <div className="pt-2">
                <Button
                  onClick={() => {
                    if (userName.trim()) {
                      localStorage.setItem('contextdna_user_name', userName.trim());
                    }
                    setStep('ready');
                  }}
                  disabled={!userName.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white py-5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  {userName.trim() ? `Nice to meet you, ${userName.trim()}` : 'Tell me your name to continue'}
                </Button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* STEP 4: READY - Synaptic is ready to help */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {step === 'ready' && (
            <div className="text-center space-y-6">
              {/* Synaptic awakened icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  </div>
                  <div className="absolute -inset-3 bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 rounded-full blur-xl -z-10" />
                </div>
              </div>

              {/* Synaptic's promise */}
              <div className="space-y-2">
                <h2 className="text-xl font-medium text-slate-100">
                  {userName.trim() ? `${userName.trim()}, I'm ready to be your memory` : "I'm ready to be your memory"}
                </h2>
                <p className="text-slate-400 text-sm max-w-sm mx-auto">
                  {analysis
                    ? 'I\'ve personalized your setup based on what I learned. Let\'s begin.'
                    : 'The setup wizard will guide us through the rest together.'}
                </p>
              </div>

              {/* What happens next - conversational, not a checklist */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 text-left">
                <p className="text-sm text-slate-300 leading-relaxed">
                  First, I'll settle into your system. Then we'll connect to your AI assistant.
                  If you'd like, I can think locally too—it's faster and more private.
                  And then... I start learning you.
                </p>
              </div>

              {/* Privacy note - warm */}
              <p className="text-xs text-slate-500">
                Everything stays on your machine. Your code, your patterns, your privacy—always.
              </p>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 border-slate-700 hover:bg-slate-800 text-slate-300 py-5 rounded-xl"
                >
                  Maybe later
                </Button>
                <Button
                  onClick={onStartSetup}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/25"
                >
                  Let's begin
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Progress indicator - organic dots */}
        <div className="flex justify-center gap-2 pb-6">
          {['welcome', 'awakening', 'recognition', 'ready'].map((s, i) => (
            <div
              key={s}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-500",
                step === s
                  ? "bg-indigo-400 w-6"
                  : ['welcome', 'awakening', 'recognition', 'ready'].indexOf(step) > i
                    ? "bg-indigo-400/50"
                    : "bg-slate-700"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
