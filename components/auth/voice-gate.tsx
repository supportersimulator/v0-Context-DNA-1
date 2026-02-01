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
import { supabase } from '@/lib/supabase/client'

// =============================================================================
// Get User Email from Supabase Session
// =============================================================================

async function getSupabaseUserEmail(): Promise<string | null> {
  if (!supabase) return null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email || null
  } catch {
    return null
  }
}

// =============================================================================
// API Configuration
// =============================================================================

function getBaseUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8000/api/contextdna'
  const hostname = window.location.hostname
  // Local development - connect to local Django backend
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000/api/contextdna'
  }
  // Production - use EC2 Django backend directly for voice AUTH
  // (voice.contextdna.io is for voice CHAT via Synaptic, not auth)
  return 'https://api.ersimulator.com/api/contextdna'
}

// =============================================================================
// Fetch with Retry - Automatic retry on network errors with exponential backoff
// =============================================================================

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      return response
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 3s...
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

// Storage keys (localStorage for persistence across sessions)
const VOICE_VERIFIED_KEY = 'voice_verified'
const VOICE_VERIFIED_AT_KEY = 'voice_verified_at'
const MACHINE_FINGERPRINT_KEY = 'machine_fingerprint'

// Recording configuration
const RECORDING_DURATION = 4000 // 4 seconds for better voice capture
const SIMILARITY_THRESHOLD = 0.70

// Verification TTL configuration
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Check if we're on localhost (local machine = voice optional)
 */
function isLocalAccess(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * Check if voice verification is still valid (within TTL)
 */
function isVerificationValid(): boolean {
  if (typeof window === 'undefined') return false

  const verified = localStorage.getItem(VOICE_VERIFIED_KEY)
  const verifiedAt = localStorage.getItem(VOICE_VERIFIED_AT_KEY)

  if (verified !== 'true' || !verifiedAt) return false

  const verifiedTime = parseInt(verifiedAt, 10)
  const now = Date.now()
  const elapsed = now - verifiedTime

  // Check if within TTL
  if (elapsed < VERIFICATION_TTL_MS) {
    return true
  }

  // Expired - clear verification
  localStorage.removeItem(VOICE_VERIFIED_KEY)
  localStorage.removeItem(VOICE_VERIFIED_AT_KEY)
  return false
}

/**
 * Store verification timestamp
 */
function storeVerification(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(VOICE_VERIFIED_KEY, 'true')
  localStorage.setItem(VOICE_VERIFIED_AT_KEY, Date.now().toString())
}

/**
 * Get time remaining until reverification needed
 */
function getVerificationTimeRemaining(): number {
  if (typeof window === 'undefined') return 0
  const verifiedAt = localStorage.getItem(VOICE_VERIFIED_AT_KEY)
  if (!verifiedAt) return 0

  const verifiedTime = parseInt(verifiedAt, 10)
  const remaining = VERIFICATION_TTL_MS - (Date.now() - verifiedTime)
  return Math.max(0, remaining)
}

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
  | 'challenge'        // Machine fingerprint mismatch - additional verification required
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
  const [challengeInfo, setChallengeInfo] = useState<{
    reason?: string
    expected_fingerprint?: string
    current_fingerprint?: string
  } | null>(null)

  // Resolved email state (for async Supabase lookup when UUID detected)
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(null)

  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Get user info - ensure we use a valid email address
  const rawUsername = userEmail || getStoredUsername() || 'user@contextdna.io'
  // Check if rawUsername looks like a UUID (Supabase user ID)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUsername)

  // Synchronous email resolution (used as fallback/initial value)
  const syncEmail = isUUID
    ? 'user@contextdna.io'  // Placeholder until async resolution completes
    : rawUsername.includes('@')
      ? rawUsername
      : `${rawUsername}@gmail.com`

  // Use resolved email if available, otherwise sync email
  const email = resolvedEmail || syncEmail
  const deviceToken = getDeviceToken()
  const machineFingerprint = getMachineFingerprint()

  // Async email resolution: If UUID detected, fetch real email from Supabase
  useEffect(() => {
    if (isUUID && !resolvedEmail) {
      console.log('[VoiceGate] UUID detected, resolving email from Supabase...')
      getSupabaseUserEmail().then((supabaseEmail) => {
        if (supabaseEmail) {
          console.log(`[VoiceGate] Resolved email: ${supabaseEmail}`)
          setResolvedEmail(supabaseEmail)
        } else {
          console.warn('[VoiceGate] Could not resolve email from Supabase session')
        }
      })
    } else if (!isUUID && rawUsername.includes('@')) {
      // Email was provided directly, no resolution needed
      setResolvedEmail(rawUsername)
    }
  }, [isUUID, rawUsername, resolvedEmail])

  // ==========================================================================
  // Check if already verified (within 24-hour TTL)
  // ==========================================================================
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check if verification is still valid (within TTL)
      if (isVerificationValid()) {
        const remaining = getVerificationTimeRemaining()
        const hours = Math.floor(remaining / (60 * 60 * 1000))
        console.log(`[VoiceGate] Verification valid for ${hours}h more`)
        onVerified()
        return
      }

      // Local access: Auto-bypass voice auth (physical presence = authenticated)
      // Voice auth is only required for remote access via Cloudflare tunnel
      if (isLocalAccess()) {
        console.log('[VoiceGate] Local access detected - auto-bypassing voice auth')
        storeVerification() // Store so we don't re-check for 24h
        onVerified()
        return
      }
    }

    // Wait for email resolution if UUID was detected
    // This ensures we have a real email before checking enrollment
    if (isUUID && !resolvedEmail) {
      console.log('[VoiceGate] Waiting for email resolution...')
      return
    }

    // Remote access: Check enrollment status and require voice auth
    checkEnrollmentStatus()
  }, [resolvedEmail, isUUID])

  // ==========================================================================
  // Check Enrollment Status
  // ==========================================================================
  const checkEnrollmentStatus = async () => {
    setState('loading')
    setErrorMessage(null)

    const baseUrl = getBaseUrl()
    const fullUrl = `${baseUrl}/voice/enrollment-status/?user_email=${encodeURIComponent(email)}`

    // DETAILED DEBUG LOGGING
    console.log('[VoiceGate] ========== ENROLLMENT CHECK START ==========')
    console.log('[VoiceGate] rawUsername:', rawUsername)
    console.log('[VoiceGate] isUUID:', isUUID)
    console.log('[VoiceGate] resolvedEmail:', resolvedEmail)
    console.log('[VoiceGate] syncEmail:', syncEmail)
    console.log('[VoiceGate] FINAL email:', email)
    console.log('[VoiceGate] baseUrl:', baseUrl)
    console.log('[VoiceGate] fullUrl:', fullUrl)
    console.log('[VoiceGate] deviceToken:', deviceToken ? deviceToken.slice(0, 8) + '...' : 'null')

    try {
      console.log('[VoiceGate] Making fetch request...')
      const response = await fetchWithRetry(fullUrl, { method: 'GET' })
      console.log('[VoiceGate] Response received:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[VoiceGate] Response not OK:', response.status, errorText)
        throw new Error(`Server returned ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('[VoiceGate] Result:', JSON.stringify(result))

      if (result.enrolled) {
        // User has voiceprint - go to verification
        setState('verify_ready')
        setStatusMessage('Speak to verify your identity')
      } else {
        // New user - start enrollment
        setState('enroll_intro')
        setStatusMessage('Set up your voice fingerprint')
      }
      console.log('[VoiceGate] ========== ENROLLMENT CHECK SUCCESS ==========')
    } catch (err) {
      console.error('[VoiceGate] ========== ENROLLMENT CHECK FAILED ==========')
      console.error('[VoiceGate] Error type:', err?.constructor?.name)
      console.error('[VoiceGate] Error message:', err instanceof Error ? err.message : String(err))
      console.error('[VoiceGate] Full error:', err)

      // Provide specific error message based on error type
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('fetch')) {
        setErrorMessage(`Network error connecting to ${baseUrl}. Check browser console.`)
      } else if (errorMsg.includes('Server returned')) {
        setErrorMessage(errorMsg)
      } else {
        setErrorMessage(`Connection failed: ${errorMsg}`)
      }
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
      const response = await fetchWithRetry(
        `${baseUrl}/voice/enroll/`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || 'Enrollment failed')
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
      const response = await fetchWithRetry(
        `${baseUrl}/voice/verify/`,
        {
          method: 'POST',
          body: formData,
        }
      )

      if (!response.ok) {
        throw new Error('Verification request failed')
      }

      const result = await response.json()
      setSimilarity(result.similarity)

      // Check for challenge mode (machine fingerprint mismatch)
      // Check for challenge mode - backend returns requires_additional_verification
      if (result.requires_additional_verification || result.challenge || result.challenge_mode) {
        setState('challenge')
        setStatusMessage('Additional verification required')
        setChallengeInfo({
          reason: result.challenge_reason || result.reason || 'Device fingerprint mismatch detected',
          expected_fingerprint: result.expected_fingerprint,
          current_fingerprint: result.current_fingerprint || machineFingerprint,
        })
        setErrorMessage('You are accessing from an unrecognized device. Additional verification is needed to confirm your identity.')
        console.log('[VoiceGate] Challenge mode triggered:', result.challenge_reason || 'fingerprint mismatch')
        return
      }

      if (result.is_match) {
        // SUCCESS - Voice verified
        setState('verified')
        setStatusMessage(`Welcome back! (${Math.round(result.similarity * 100)}% match)`)

        // Store verification with timestamp (24-hour TTL)
        storeVerification()
        console.log('[VoiceGate] Voice verified - valid for 24 hours')

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
    setChallengeInfo(null)
    if (state === 'unauthorized' || state === 'error' || state === 'challenge') {
      setState('verify_ready')
      setStatusMessage('Speak to verify your identity')
    }
  }

  // ==========================================================================
  // Contact Support Handler (for challenge mode)
  // ==========================================================================
  const handleContactSupport = () => {
    // Open email client with pre-filled support request
    const subject = encodeURIComponent('Voice Authentication Challenge - Device Verification')
    const body = encodeURIComponent(
      `Hello,\n\nI'm experiencing a device verification challenge when trying to access Context DNA.\n\n` +
      `User Email: ${email}\n` +
      `Current Machine ID: ${machineFingerprint}\n` +
      `Challenge Reason: ${challengeInfo?.reason || 'Unknown'}\n\n` +
      `Please help me verify my identity and update my device registration.\n\nThank you.`
    )
    window.open(`mailto:support@contextdna.io?subject=${subject}&body=${body}`, '_blank')
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
                state === 'challenge' && "text-amber-400",
                state === 'error' && "text-red-400",
                !['verified', 'unauthorized', 'challenge', 'error'].includes(state) && "text-zinc-300"
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
                  : state === 'challenge'
                  ? "bg-amber-900/20 border-amber-500/50"
                  : "bg-yellow-900/20 border-yellow-500/30"
              )}>
                <span className="text-xl flex-shrink-0">
                  {state === 'unauthorized' ? '🚨' : state === 'challenge' ? '🔐' : '⚠️'}
                </span>
                <span className={cn(
                  "text-sm",
                  state === 'unauthorized' ? "text-red-300" : state === 'challenge' ? "text-amber-300" : "text-yellow-300"
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
                <div className="space-y-3">
                  <Button
                    onClick={checkEnrollmentStatus}
                    className="w-full py-4 px-4 bg-gradient-to-r from-zinc-600 to-zinc-700 text-white font-medium rounded-lg hover:from-zinc-500 hover:to-zinc-600"
                  >
                    🔄 Retry Connection
                  </Button>
                  <p className="text-zinc-500 text-xs text-center mt-2">
                    Check browser console (F12) for detailed error info
                  </p>
                </div>
              )}

              {state === 'challenge' && (
                <>
                  {/* Challenge Mode Explanation */}
                  <div className="bg-amber-900/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
                    <p className="text-amber-200 text-sm font-medium">Why am I seeing this?</p>
                    <p className="text-amber-300/80 text-xs">
                      Your voice matched, but we detected you are accessing from a different device
                      than the one originally registered. This security measure protects your account
                      from unauthorized access.
                    </p>
                    {challengeInfo?.reason && (
                      <p className="text-amber-400/60 text-xs mt-2">
                        Reason: {challengeInfo.reason}
                      </p>
                    )}
                  </div>

                  {/* Challenge Action Buttons */}
                  <div className="space-y-2">
                    <Button
                      onClick={handleRetry}
                      className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium rounded-lg hover:from-amber-400 hover:to-orange-500"
                    >
                      🔄 Try Verification Again
                    </Button>
                    <Button
                      onClick={handleContactSupport}
                      variant="outline"
                      className="w-full py-3 px-4 border-amber-500/50 text-amber-300 hover:bg-amber-900/20"
                    >
                      📧 Contact Support
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Help Text */}
            <p className="text-center text-zinc-600 text-xs">
              {state.startsWith('enroll')
                ? 'Record 3 voice samples to create your unique voice fingerprint'
                : state === 'unauthorized'
                ? 'Voice authentication protects your personal Synaptic instance'
                : state === 'challenge'
                ? 'Device verification ensures secure access from trusted machines'
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
    challenge: {
      emoji: '🔐',
      bgClass: 'bg-amber-900/30',
      ringClass: 'border-amber-500',
      animate: 'animate-pulse',
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
 * Check if voice verification is active and within TTL
 */
export function isVoiceVerified(): boolean {
  if (typeof window === 'undefined') return false
  return isVerificationValid()
}

/**
 * Clear voice verification (for logout)
 */
export function clearVoiceVerification(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(VOICE_VERIFIED_KEY)
    localStorage.removeItem(VOICE_VERIFIED_AT_KEY)
  }
}

/**
 * Get machine fingerprint for binding
 */
export function getStoredMachineFingerprint(): string {
  return getMachineFingerprint()
}
