"use client"

/**
 * VoiceGate - Voice verification gate for Context DNA admin
 *
 * Shows after Supabase login but BEFORE dashboard access.
 * User must verify voice identity by saying "Wake up Synaptic".
 *
 * Flow:
 * 1. Check enrollment status on mount
 * 2. If not enrolled -> show enrollment flow (record 3 samples)
 * 3. If enrolled -> show verification flow (record once, verify)
 * 4. If verified (similarity > 0.70) -> call onVerified()
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { getStoredUsername, getDeviceToken } from '@/lib/auth/session'

// Voice verification API
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.contextdna.io"
const VOICE_VERIFY_ENDPOINT = `${BACKEND_BASE_URL}/voice/verify`
const VOICE_ENROLL_ENDPOINT = `${BACKEND_BASE_URL}/voice/enroll`
const VOICE_STATUS_ENDPOINT = `${BACKEND_BASE_URL}/voice/status`

// Session storage key for voice verification
const VOICE_VERIFIED_KEY = 'voice_verified'

// Recording duration in milliseconds
const RECORDING_DURATION = 3000

// Verification threshold
const SIMILARITY_THRESHOLD = 0.70

// Animation states
type BrainState = 'sleeping' | 'waking' | 'listening' | 'processing' | 'awake' | 'failed'

interface VoiceGateProps {
  onVerified: () => void
}

export function VoiceGate({ onVerified }: VoiceGateProps) {
  // State
  const [brainState, setBrainState] = useState<BrainState>('sleeping')
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string>('')

  // Enrollment flow state
  const [enrollmentStep, setEnrollmentStep] = useState(0) // 0-3 samples
  const [enrollmentSamples, setEnrollmentSamples] = useState<Blob[]>([])

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Check if already voice-verified this session
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const verified = sessionStorage.getItem(VOICE_VERIFIED_KEY)
      if (verified === 'true') {
        onVerified()
      }
    }
  }, [onVerified])

  // Check enrollment status on mount
  useEffect(() => {
    checkEnrollmentStatus()
  }, [])

  const checkEnrollmentStatus = async () => {
    try {
      const email = getStoredUsername()
      const deviceToken = getDeviceToken()

      if (!email && !deviceToken) {
        setError('No user credentials found')
        return
      }

      const response = await fetch(`${VOICE_STATUS_ENDPOINT}?email=${encodeURIComponent(email || '')}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(deviceToken && { 'X-Device-Token': deviceToken }),
        },
      })

      if (response.ok) {
        const data = await response.json()
        setIsEnrolled(data.enrolled)
        if (data.enrolled) {
          setMessage('Say "Wake up Synaptic" to continue')
        } else {
          setMessage('Voice not enrolled. Please enroll your voice.')
        }
      } else {
        // If status check fails, assume not enrolled
        setIsEnrolled(false)
        setMessage('Voice not enrolled. Please enroll your voice.')
      }
    } catch (err) {
      console.error('[VoiceGate] Status check error:', err)
      // On error, allow enrollment flow
      setIsEnrolled(false)
      setMessage('Voice not enrolled. Please enroll your voice.')
    }
  }

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      audioChunksRef.current = []

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType
        })
        handleRecordingComplete(audioBlob)
      }

      // Start recording
      setIsRecording(true)
      setBrainState('listening')
      mediaRecorder.start()

      // Auto-stop after duration
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording()
        }
      }, RECORDING_DURATION)

    } catch (err) {
      console.error('[VoiceGate] Recording error:', err)
      setError('Microphone access denied. Please allow microphone access.')
      setBrainState('failed')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsRecording(false)
  }, [])

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setBrainState('processing')
    setMessage('Processing...')

    if (isEnrolled === false) {
      // Enrollment flow
      await handleEnrollmentSample(audioBlob)
    } else {
      // Verification flow
      await handleVerification(audioBlob)
    }
  }

  const handleEnrollmentSample = async (audioBlob: Blob) => {
    const newSamples = [...enrollmentSamples, audioBlob]
    setEnrollmentSamples(newSamples)
    const step = newSamples.length

    if (step < 3) {
      setEnrollmentStep(step)
      setBrainState('waking')
      setMessage(`Sample ${step}/3 recorded. ${3 - step} more to go.`)
    } else {
      // All samples collected, enroll
      await submitEnrollment(newSamples)
    }
  }

  const submitEnrollment = async (samples: Blob[]) => {
    try {
      setMessage('Enrolling your voice...')
      const email = getStoredUsername()
      const deviceToken = getDeviceToken()

      const formData = new FormData()
      samples.forEach((sample, index) => {
        formData.append(`sample_${index}`, sample, `sample_${index}.webm`)
      })
      if (email) formData.append('email', email)

      const response = await fetch(VOICE_ENROLL_ENDPOINT, {
        method: 'POST',
        headers: {
          ...(deviceToken && { 'X-Device-Token': deviceToken }),
        },
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setIsEnrolled(true)
          setEnrollmentStep(0)
          setEnrollmentSamples([])
          setBrainState('waking')
          setMessage('Voice enrolled! Now verify by saying "Wake up Synaptic"')
        } else {
          throw new Error(data.error || 'Enrollment failed')
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Enrollment failed: ${response.status}`)
      }
    } catch (err) {
      console.error('[VoiceGate] Enrollment error:', err)
      setError(err instanceof Error ? err.message : 'Enrollment failed')
      setBrainState('failed')
      // Reset enrollment to try again
      setEnrollmentSamples([])
      setEnrollmentStep(0)
    }
  }

  const handleVerification = async (audioBlob: Blob) => {
    try {
      const email = getStoredUsername()
      const deviceToken = getDeviceToken()

      const formData = new FormData()
      formData.append('audio', audioBlob, 'verification.webm')
      if (email) formData.append('email', email)

      const response = await fetch(VOICE_VERIFY_ENDPOINT, {
        method: 'POST',
        headers: {
          ...(deviceToken && { 'X-Device-Token': deviceToken }),
        },
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()

        if (data.verified && data.similarity >= SIMILARITY_THRESHOLD) {
          setBrainState('awake')
          setMessage('Voice verified! Welcome back.')

          // Store verification in session
          sessionStorage.setItem(VOICE_VERIFIED_KEY, 'true')

          // Wait for animation, then proceed
          setTimeout(() => {
            onVerified()
          }, 1500)
        } else {
          setBrainState('failed')
          const similarity = (data.similarity * 100).toFixed(0)
          setError(`Voice not recognized (${similarity}% match, need 70%). Try again.`)
          setMessage('Try speaking more clearly')
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Verification failed: ${response.status}`)
      }
    } catch (err) {
      console.error('[VoiceGate] Verification error:', err)
      setError(err instanceof Error ? err.message : 'Verification failed')
      setBrainState('failed')
    }
  }

  const handleWakeUp = () => {
    if (isRecording) return

    setError(null)
    if (isEnrolled === false && enrollmentStep === 0) {
      setMessage('Say "Wake up Synaptic" - Sample 1 of 3')
    }
    startRecording()
  }

  const handleRetry = () => {
    setError(null)
    setBrainState('sleeping')
    if (isEnrolled === false) {
      setMessage(`Say "Wake up Synaptic" - Sample ${enrollmentStep + 1} of 3`)
    } else {
      setMessage('Say "Wake up Synaptic" to continue')
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 shadow-lg overflow-hidden backdrop-blur-sm">
          {/* Header */}
          <div className="text-center p-8 border-b border-zinc-800/50">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/20">
                <span className="text-white text-2xl">&#x1F9EC;</span>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white">Context DNA</h1>
            <p className="text-zinc-500 mt-1">Voice Verification</p>
          </div>

          {/* Main Content */}
          <div className="p-8 space-y-6">
            {/* Animated Brain */}
            <div className="flex justify-center">
              <SynapticBrain state={brainState} />
            </div>

            {/* Status Message */}
            <div className="text-center">
              {isEnrolled === null ? (
                <p className="text-zinc-400">Checking voice enrollment...</p>
              ) : (
                <>
                  <p className="text-zinc-300 text-lg">{message}</p>
                  {isEnrolled === false && enrollmentStep > 0 && (
                    <div className="mt-2 flex justify-center gap-2">
                      {[1, 2, 3].map((n) => (
                        <div
                          key={n}
                          className={cn(
                            "w-3 h-3 rounded-full transition-all",
                            n <= enrollmentStep
                              ? "bg-cyan-500"
                              : "bg-zinc-700"
                          )}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <span className="text-red-400">&#x26A0;&#xFE0F;</span>
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              {brainState === 'failed' ? (
                <Button
                  onClick={handleRetry}
                  className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500"
                >
                  <span>&#x1F504;</span>
                  Try Again
                </Button>
              ) : brainState === 'awake' ? (
                <div className="text-center text-green-400 py-3">
                  <span className="text-2xl">&#x2705;</span>
                  <p className="mt-2">Access Granted</p>
                </div>
              ) : (
                <Button
                  onClick={handleWakeUp}
                  disabled={isRecording || brainState === 'processing' || isEnrolled === null}
                  className={cn(
                    "w-full py-4 px-4 font-medium rounded-lg transition-all flex items-center justify-center gap-2",
                    isRecording
                      ? "bg-red-500/20 border-2 border-red-500 text-red-400"
                      : "bg-gradient-to-r from-cyan-500 to-purple-600 text-white hover:from-cyan-400 hover:to-purple-500"
                  )}
                >
                  {isRecording ? (
                    <>
                      <span className="animate-pulse">&#x1F534;</span>
                      Recording...
                    </>
                  ) : brainState === 'processing' ? (
                    <>
                      <span className="animate-spin">&#x21BB;</span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <span>&#x1F3A4;</span>
                      {isEnrolled === false
                        ? `Record Sample ${enrollmentStep + 1}/3`
                        : 'Wake Synaptic'
                      }
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Help Text */}
            <p className="text-center text-zinc-600 text-xs">
              {isEnrolled === false
                ? 'Record 3 voice samples to enroll your voice print'
                : 'Voice verification adds an extra layer of security'
              }
            </p>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Context DNA Voice Gate
        </p>
      </div>
    </div>
  )
}

/**
 * Animated Synaptic Brain Icon
 * States: sleeping, waking, listening, processing, awake, failed
 */
function SynapticBrain({ state }: { state: BrainState }) {
  const stateStyles: Record<BrainState, string> = {
    sleeping: 'opacity-50 scale-100',
    waking: 'opacity-75 scale-105 animate-pulse',
    listening: 'opacity-100 scale-110 animate-pulse',
    processing: 'opacity-100 scale-100 animate-spin',
    awake: 'opacity-100 scale-110',
    failed: 'opacity-60 scale-95',
  }

  const glowStyles: Record<BrainState, string> = {
    sleeping: 'shadow-cyan-500/10',
    waking: 'shadow-cyan-500/30',
    listening: 'shadow-cyan-500/50 shadow-lg',
    processing: 'shadow-purple-500/50 shadow-lg',
    awake: 'shadow-green-500/60 shadow-xl',
    failed: 'shadow-red-500/40 shadow-lg',
  }

  const brainEmoji: Record<BrainState, string> = {
    sleeping: '&#x1F634;', // Sleeping face
    waking: '&#x1F9E0;',   // Brain
    listening: '&#x1F442;', // Ear
    processing: '&#x1F4AB;', // Dizzy symbol
    awake: '&#x2728;',     // Sparkles
    failed: '&#x1F615;',   // Confused face
  }

  return (
    <div
      className={cn(
        "relative w-24 h-24 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center transition-all duration-500",
        stateStyles[state],
        glowStyles[state]
      )}
    >
      {/* Animated ring */}
      <div
        className={cn(
          "absolute inset-0 rounded-full border-2 transition-all duration-500",
          state === 'sleeping' && "border-cyan-500/20",
          state === 'waking' && "border-cyan-500/40 animate-ping",
          state === 'listening' && "border-cyan-500/60 animate-pulse",
          state === 'processing' && "border-purple-500/60 animate-spin",
          state === 'awake' && "border-green-500/80",
          state === 'failed' && "border-red-500/60"
        )}
      />

      {/* Secondary ring for listening state */}
      {(state === 'listening' || state === 'processing') && (
        <div
          className={cn(
            "absolute inset-[-4px] rounded-full border transition-all duration-300",
            state === 'listening' && "border-cyan-400/40 animate-ping",
            state === 'processing' && "border-purple-400/40 animate-pulse"
          )}
        />
      )}

      {/* Brain icon */}
      <span
        className={cn(
          "text-4xl transition-all duration-300",
          state === 'sleeping' && "opacity-50",
          state === 'awake' && "animate-bounce"
        )}
        dangerouslySetInnerHTML={{ __html: brainEmoji[state] }}
      />

      {/* Success checkmark overlay */}
      {state === 'awake' && (
        <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-full animate-ping">
          <span className="text-green-400 text-3xl">&#x2714;</span>
        </div>
      )}
    </div>
  )
}

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
