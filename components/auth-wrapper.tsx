"use client"

/**
 * AuthWrapper - Complete authentication flow for Context DNA admin
 *
 * Authentication Flow:
 * 1. Check device auth / Supabase session
 * 2. If not authenticated -> redirect to /login
 * 3. If authenticated but not voice-verified -> show VoiceGate
 * 4. If voice-verified -> show dashboard content
 *
 * Voice verification is per-session (clears on tab close).
 */

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { initDeviceAuth, isAuthenticated, getStoredUsername, logout } from "@/lib/auth/session"
import { VoiceGate, isVoiceVerified, clearVoiceVerification } from "@/components/auth/voice-gate"

interface AuthWrapperProps {
  children: React.ReactNode
  /** If true, skip voice verification (for pages that don't need it) */
  skipVoiceGate?: boolean
}

export function AuthWrapper({ children, skipVoiceGate = false }: AuthWrapperProps) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [voiceVerified, setVoiceVerified] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Check auth on mount.
    // IMPORTANT: wait for device token initialization so we don't incorrectly
    // redirect to /login during first-load races.
    const checkAuth = async () => {
      try {
        await initDeviceAuth()
      } catch {
        // ignore; we'll fall back to auth check below
      }

      if (cancelled) return

      const authed = isAuthenticated()
      setAuthenticated(authed)

      // Check if voice is already verified this session
      if (authed) {
        const voiceOk = skipVoiceGate || isVoiceVerified()
        setVoiceVerified(voiceOk)
      }

      setChecking(false)

      if (!authed) {
        router.push("/login")
      }
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [router, skipVoiceGate])

  // Handle voice verification complete
  const handleVoiceVerified = useCallback(() => {
    setVoiceVerified(true)
  }, [])

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-zinc-400">Verifying credentials...</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return null // Will redirect to login
  }

  // Show voice gate if not voice-verified
  if (!voiceVerified) {
    return <VoiceGate onVerified={handleVoiceVerified} />
  }

  return <>{children}</>
}

export function useAuth() {
  const router = useRouter()

  const handleLogout = async () => {
    // Clear voice verification on logout
    clearVoiceVerification()
    await logout()
    router.push("/login")
  }

  return {
    username: getStoredUsername(),
    logout: handleLogout,
  }
}
