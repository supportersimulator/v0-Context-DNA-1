"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { initDeviceAuth, isAuthenticated, getStoredUsername, logout } from "@/lib/auth/session"

interface AuthWrapperProps {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

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
      setChecking(false)

      if (!authed) {
        router.push("/login")
      }
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [router])

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

  return <>{children}</>
}

export function useAuth() {
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.push("/login")
  }

  return {
    username: getStoredUsername(),
    logout: handleLogout,
  }
}
