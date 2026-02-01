"use client"

/**
 * VoiceGate - Voice Authentication Gate for Context DNA
 *
 * Authentication Flow:
 * 1. DEVICE CHECK - If stored device_token exists, skip Supabase login
 * 2. VOICE VERIFICATION - Match voice against Supabase-stored voiceprint
 * 3. MACHINE FINGERPRINT - Device_token + machine_id must match enrollment
 * 4. ACCESS GRANTED - Session token issued, Cloudflare tunnel access enabled
 *
 * Security Properties:
 * - Something you have: Device token (stored locally)
 * - Something you are: Voice fingerprint (biometric)
 * - Where you are: Machine fingerprint binding
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getStoredUsername, getDeviceToken, storeDeviceToken } from '@/lib/auth/session'

// =============================================================================
// API Configuration
// =============================================================================

function getBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8888'
  const hostname = window.location.hostname
  // Local development - connect directly to Synaptic
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8888'
  }
  // Production - use Cloudflare Tunnel
  return 'https://voice.contextdna.io'
}

// Session storage keys
const VOICE_VERIFIED_KEY = 'voice_verified'
const MACHINE_FINGERPRINT_KEY = 'machine_fingerprint'

// Recording configuration
const RECORDING_DURATION = 4000 // 4 seconds for better voice capture
const SIMILARITY_THRESHOLD = 0.70

// =============================================================================
// Types
// =============================================================================

type GateState =
  | 'loading'          // Checking device/enrollment status
  | 'needs_login'      // No device token - show Supabase login
  | 'enroll_intro'     // First time - explain enrollment
  | 'enroll_recording' // Recording enrollment sample
  | 'enroll_processing'// Processing enrollment
  | 'enroll_success'   // Enrollment complete
  | 'verify_ready'     // Ready to verify voice
  | 'verify_recording' // Recording for verification
  | 'verify_processing'// Checking voice match
  | 'verified'         // Voice matched - access granted
  | 'unauthorized'     // Voice didn't match - UNAUTHORIZED
  | 'error'            // System error

interface VoiceGateProps {
  onVerified: () => void
  userEmail?: string
}

// =============================================================================
// Machine Fingerprint Generation
// =============================================================================

function generateMachineFingerprint(): string {
  if (typeof window === 'undefined') return 'server'

  // Combine multiple browser/device attributes
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
    navigator.maxTouchPoints || 0,
  ]

  // Simple hash
  const str = components.join('|')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }

  return 'fp_' + Math.abs(hash).toString(36)
}

function getMachineFingerprint(): string {
  if (typeof window === 'undefined') return 'server'

  let fp = localStorage.getItem(MACHINE_FINGERPRINT_KEY)
  if (!fp) {
    fp = generateMachineFingerprint()
    localStorage.setItem(MACHINE_FINGERPRINT_KEY, fp)
  }
  return fp
}

// =============================================================================
// Main Component
// =============================================================================

export function VoiceGate({ onVerified, userEmail }: VoiceGateProps) {
  // State
  const [state, setState] = useState<GateState>('loading')
  const [enrollmentSamples, setEnrollmentSamples] = useState<Blob[]>([])
  const [currentSample, setCurrentSample] = useState(0)
  const [similarity, setSimilarity] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('')

  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Get user info
  const email = userEmail || getStoredUsername() || 'user@contextdna.io'
  const deviceToken = getDeviceToken()
  const machineFingerprint = getMachineFingerprint()

  // ==========================================================================
  // Check if already verified this session
  // ==========================================================================
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const verified = sessionStorage.getItem(VOICE_VERIFIED_KEY)
      if (verified === 'true') {
        onVerified()
        return
      }
    }
    // Check enrollment status
    checkEnrollmentStatus()
  }, [])

  // ==========================================================================
  // Check Enrollment Status
  // ==========================================================================
  const checkEnrollmentStatus = async () => {
    setState('loading')
    setErrorMessage(null)

    try {
      const baseUrl = getBaseUrl()
      const response = await fetch(
        `${baseUrl}/voice/enrollment-status?user_email=${encodeURIComponent(email)}`
      )

      if (!response.ok) {
        throw new Error('Failed to check enrollment status')
      }

      const result = await response.json()

      if (result.enrolled) {
        // User has voiceprint - go to verification
        setState('verify_ready')
        setStatusMessage('Speak to verify your identity')
      } else {
        // New user - start enrollment
        setState('enroll_intro')
        setStatusMessage('Set up your voice fingerprint')
      }
    } catch (err) {
      // Server unavailable - cannot authenticate (security)
      setErrorMessage('Voice server unavailable. Cannot authenticate.')
      setState('error')
    }
  }

  // ==========================================================================
  // Audio Recording
  // ==========================================================================
  const startRecording = useCallback(async (): Promise<Blob | null> => {
    try {
      setErrorMessage(null)
      audioChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      return new Promise((resolve) => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach(track => track.stop())
          const blob = new Blob(audioChunksRef.current, { type: mimeType })
          resolve(blob.size > 0 ? blob : null)
        }

        mediaRecorder.start(100)

        // Auto-stop after duration
        setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
        }, RECORDING_DURATION)
      })
    } catch (err) {
      setErrorMessage('Microphone access required for voice authentication')
      return null
    }
  }, [])

  // ==========================================================================
  // Enrollment Flow
  // ==========================================================================
  const startEnrollment = useCallback(async () => {
    setEnrollmentSamples([])
    setCurrentSample(1)
    setErrorMessage(null)

    const samples: Blob[] = []

    for (let i = 1; i <= 3; i++) {
      setCurrentSample(i)
      setState('enroll_recording')
      setStatusMessage(`Recording sample ${i} of 3...`)

      // Brief pause before recording
      await new Promise(resolve => setTimeout(resolve, 500))

      const blob = await startRecording()
      if (!blob) {
        setState('enroll_intro')
        setErrorMessage('Recording failed. Please try again.')
        return
      }

      samples.push(blob)
      setEnrollmentSamples([...samples])

      // Brief pause between samples
      if (i < 3) {
        setStatusMessage(`Sample ${i} captured. Get ready for sample ${i + 1}...`)
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }

    // Submit enrollment
    await submitEnrollment(samples)
  }, [startRecording])

  const submitEnrollment = async (samples: Blob[]) => {
    setState('enroll_processing')
    setStatusMessage('Creating your voice fingerprint...')
    setErrorMessage(null)

    try {
      const formData = new FormData()
      samples.forEach((sample, i) => {
        formData.append(`audio${i + 1}`, sample, `sample${i + 1}.webm`)
      })
      formData.append('user_email', email)
      formData.append('device_token', deviceToken || machineFingerprint)
      formData.append('machine_fingerprint', machineFingerprint)

      const baseUrl = getBaseUrl()
      const response = await fetch(`${baseUrl}/voice/enroll`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Enrollment failed')
      }

      const result = await response.json()

      if (result.success) {
        setState('enroll_success')
        setStatusMessage('Voice fingerprint created!')

        // Store device token if not already stored
        if (!deviceToken) {
          storeDeviceToken(machineFingerprint)
        }

        // Transition to verification after success animation
        setTimeout(() => {
          setState('verify_ready')
          setStatusMessage('Now verify your voice to continue')
        }, 2000)
      } else {
        throw new Error(result.message || 'Enrollment failed')
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Enrollment failed')
      setState('enroll_intro')
      setEnrollmentSamples([])
      setCurrentSample(0)
    }
  }

  // ==========================================================================
  // Verification Flow
  // ==========================================================================
  const startVerification = useCallback(async () => {
    setState('verify_recording')
    setStatusMessage('Listening...')
    setErrorMessage(null)
    setSimilarity(null)

    const audioBlob = await startRecording()
    if (!audioBlob) {
      setState('verify_ready')
      return
    }

    setState('verify_processing')
    setStatusMessage('Analyzing voice pattern...')

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'verify.webm')
      formData.append('user_email', email)
      formData.append('device_token', deviceToken || machineFingerprint)
      formData.append('machine_fingerprint', machineFingerprint)

      const baseUrl = getBaseUrl()
      const response = await fetch(`${baseUrl}/voice/verify`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Verification request failed')
      }

      const result = await response.json()
      setSimilarity(result.similarity)

      if (result.is_match) {
        // SUCCESS - Voice verified
        setState('verified')
        setStatusMessage(`Welcome back! (${Math.round(result.similarity * 100)}% match)`)

        // Store verification in session
        sessionStorage.setItem(VOICE_VERIFIED_KEY, 'true')

        // Transition after animation
        setTimeout(() => {
          onVerified()
        }, 1500)
      } else {
        // FAILED - Unauthorized voice
        const simPercent = Math.round((result.similarity || 0) * 100)
        setState('unauthorized')

        // Different messages based on similarity
        if (simPercent < 30) {
          setErrorMessage('⛔ Unauthorized voice detected. This is not the registered user.')
          setStatusMessage('Voice pattern does not match')
        } else if (simPercent < 50) {
          setErrorMessage('🚫 Voice mismatch. Please speak clearly and try again.')
          setStatusMessage(`${simPercent}% match (need 70%)`)
        } else {
          setErrorMessage(`Voice not quite recognized (${simPercent}% match). Try speaking more naturally.`)
          setStatusMessage('Almost there - try again')
        }
      }
    } catch (err) {
      setErrorMessage('Verification failed. Voice server may be offline.')
      setState('verify_ready')
    }
  }, [email, deviceToken, machineFingerprint, startRecording, onVerified])

  // ==========================================================================
  // Retry Handler
  // ==========================================================================
  const handleRetry = () => {
    setErrorMessage(null)
    setSimilarity(null)
    if (state === 'unauthorized' || state === 'error') {
      setState('verify_ready')
      setStatusMessage('Speak to verify your identity')
    }
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 shadow-lg overflow-hidden backdrop-blur-sm">
          {/* Header */}
          <div className="text-center p-8 border-b border-zinc-800/50">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/20">
                <span className="text-white text-2xl">🧬</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white">Context DNA</h1>
            <p className="text-zinc-500 mt-1">Voice Authentication</p>
          </div>

          {/* Main Content */}
          <div className="p-8 space-y-6">
            {/* Animated Brain/Status Icon */}
            <div className="flex justify-center">
              <StatusIcon state={state} />
            </div>

            {/* Status Message */}
            <div className="text-center">
              <p className={cn(
                "text-lg font-medium",
                state === 'verified' && "text-green-400",
                state === 'unauthorized' && "text-red-400",
                state === 'error' && "text-red-400",
                !['verified', 'unauthorized', 'error'].includes(state) && "text-zinc-300"
              )}>
                {statusMessage}
              </p>

              {/* Enrollment Progress */}
              {(state === 'enroll_intro' || state === 'enroll_recording' || state === 'enroll_processing') && (
                <div className="mt-3 flex justify-center gap-2">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className={cn(
                        "w-3 h-3 rounded-full transition-all duration-300",
                        enrollmentSamples.length >= n
                          ? "bg-green-500"
                          : currentSample === n && state === 'enroll_recording'
                          ? "bg-cyan-500 animate-pulse"
                          : "bg-zinc-700"
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Similarity Score Display */}
              {similarity !== null && state !== 'verified' && (
                <p className="text-sm text-zinc-500 mt-2">
                  Voice match: {Math.round(similarity * 100)}%
                </p>
              )}
            </div>

            {/* Error Display */}
            {errorMessage && (
              <div className={cn(
                "flex items-start gap-3 p-4 rounded-lg border",
                state === 'unauthorized'
                  ? "bg-red-900/20 border-red-500/50"
                  : "bg-yellow-900/20 border-yellow-500/30"
              )}>
                <span className="text-xl flex-shrink-0">
                  {state === 'unauthorized' ? '🚨' : '⚠️'}
                </span>
                <span className={cn(
                  "text-sm",
                  state === 'unauthorized' ? "text-red-300" : "text-yellow-300"
                )}>
                  {errorMessage}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {state === 'loading' && (
                <div className="text-center text-zinc-400 py-4">
                  <span className="animate-spin inline-block mr-2">⏳</span>
                  Checking enrollment status...
                </div>
              )}

              {state === 'enroll_intro' && (
                <Button
                  onClick={startEnrollment}
                  className="w-full py-4 px-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-purple-500"
                >
                  🎤 Start Voice Setup
                </Button>
              )}

              {state === 'enroll_recording' && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/30 flex items-center justify-center animate-pulse">
                    <span className="text-2xl">🎙️</span>
                  </div>
                </div>
              )}

              {state === 'enroll_processing' && (
                <div className="text-center py-4">
                  <span className="animate-spin inline-block text-2xl">⚙️</span>
                </div>
              )}

              {state === 'enroll_success' && (
                <div className="text-center py-4">
                  <span className="text-4xl">✅</span>
                  <p className="text-green-400 mt-2">Voice fingerprint saved!</p>
                </div>
              )}

              {state === 'verify_ready' && (
                <Button
                  onClick={startVerification}
                  className="w-full py-4 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500"
                >
                  🎤 Verify Voice
                </Button>
              )}

              {state === 'verify_recording' && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/30 flex items-center justify-center">
                    <span className="text-2xl animate-pulse">👂</span>
                  </div>
                </div>
              )}

              {state === 'verify_processing' && (
                <div className="text-center py-4">
                  <span className="animate-spin inline-block text-2xl">🔍</span>
                </div>
              )}

              {state === 'verified' && (
                <div className="text-center py-4">
                  <span className="text-4xl animate-bounce">🎉</span>
                  <p className="text-green-400 mt-2 font-medium">Access Granted</p>
                </div>
              )}

              {state === 'unauthorized' && (
                <Button
                  onClick={handleRetry}
                  className="w-full py-4 px-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-medium rounded-lg hover:from-orange-400 hover:to-red-500"
                >
                  🔄 Try Again
                </Button>
              )}

              {state === 'error' && (
                <Button
                  onClick={checkEnrollmentStatus}
                  className="w-full py-4 px-4 bg-gradient-to-r from-zinc-600 to-zinc-700 text-white font-medium rounded-lg hover:from-zinc-500 hover:to-zinc-600"
                >
                  🔄 Retry Connection
                </Button>
              )}
            </div>

            {/* Help Text */}
            <p className="text-center text-zinc-600 text-xs">
              {state.startsWith('enroll')
                ? 'Record 3 voice samples to create your unique voice fingerprint'
                : state === 'unauthorized'
                ? 'Voice authentication protects your personal Synaptic instance'
                : 'Voice verification ensures only you can access your data'
              }
            </p>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 text-zinc-600 text-xs">
              <span>🔒</span>
              <span>Machine ID: {machineFingerprint.slice(0, 12)}...</span>
            </div>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Context DNA Voice Gate
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// Status Icon Component
// =============================================================================

function StatusIcon({ state }: { state: GateState }) {
  const config: Record<GateState, { emoji: string; bgClass: string; ringClass: string; animate?: string }> = {
    loading: {
      emoji: '⏳',
      bgClass: 'bg-zinc-800',
      ringClass: 'border-zinc-600',
      animate: 'animate-pulse'
    },
    needs_login: {
      emoji: '🔐',
      bgClass: 'bg-zinc-800',
      ringClass: 'border-zinc-600',
    },
    enroll_intro: {
      emoji: '😴',
      bgClass: 'bg-zinc-800',
      ringClass: 'border-cyan-500/30',
    },
    enroll_recording: {
      emoji: '🎙️',
      bgClass: 'bg-red-900/30',
      ringClass: 'border-red-500',
      animate: 'animate-pulse'
    },
    enroll_processing: {
      emoji: '⚙️',
      bgClass: 'bg-purple-900/30',
      ringClass: 'border-purple-500',
      animate: 'animate-spin'
    },
    enroll_success: {
      emoji: '✅',
      bgClass: 'bg-green-900/30',
      ringClass: 'border-green-500',
      animate: 'animate-bounce'
    },
    verify_ready: {
      emoji: '🛡️',
      bgClass: 'bg-zinc-800',
      ringClass: 'border-cyan-500/50',
    },
    verify_recording: {
      emoji: '👂',
      bgClass: 'bg-cyan-900/30',
      ringClass: 'border-cyan-500',
      animate: 'animate-pulse'
    },
    verify_processing: {
      emoji: '🔍',
      bgClass: 'bg-purple-900/30',
      ringClass: 'border-purple-500',
      animate: 'animate-spin'
    },
    verified: {
      emoji: '🎉',
      bgClass: 'bg-green-900/30',
      ringClass: 'border-green-500',
      animate: 'animate-bounce'
    },
    unauthorized: {
      emoji: '⛔',
      bgClass: 'bg-red-900/30',
      ringClass: 'border-red-500',
    },
    error: {
      emoji: '❌',
      bgClass: 'bg-red-900/30',
      ringClass: 'border-red-500/50',
    },
  }

  const c = config[state]

  return (
    <div className={cn(
      "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500",
      c.bgClass
    )}>
      {/* Animated ring */}
      <div className={cn(
        "absolute inset-0 rounded-full border-2 transition-all duration-500",
        c.ringClass,
        (state === 'enroll_recording' || state === 'verify_recording') && "animate-ping"
      )} />

      {/* Icon */}
      <span className={cn("text-4xl", c.animate)}>
        {c.emoji}
      </span>

      {/* Success overlay */}
      {state === 'verified' && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-full animate-ping" />
      )}

      {/* Unauthorized overlay */}
      {state === 'unauthorized' && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 rounded-full" />
      )}
    </div>
  )
}

// =============================================================================
// Utility Exports
// =============================================================================

/**
 * Check if voice verification is active for this session
 */
export function isVoiceVerified(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(VOICE_VERIFIED_KEY) === 'true'
}

/**
 * Clear voice verification (for logout)
 */
export function clearVoiceVerification(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(VOICE_VERIFIED_KEY)
  }
}

/**
 * Get machine fingerprint for binding
 */
export function getStoredMachineFingerprint(): string {
  return getMachineFingerprint()
}
