/**
 * Context DNA Login Page (App Router)
 *
 * Staff login for admin.contextdna.io dashboard.
 * Uses Supabase auth -> Django JWT exchange -> Device token linking.
 */

"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { loginWithSupabase, isAuthenticated } from "@/lib/auth/session"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      router.push("/")
    }
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      await loginWithSupabase(email, password)
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

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
            <p className="text-zinc-500 mt-1">Admin Dashboard Login</p>
          </div>

          {/* Form */}
          <div className="p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <span className="text-red-400">&#x26A0;&#xFE0F;</span>
                  <span className="text-sm text-red-400">{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aarontjomsland@gmail.com"
                  className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700/50 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
                  className="w-full px-4 py-3 bg-zinc-900/50 border border-zinc-700/50 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="animate-spin">&#x21BB;</span>
                    Authenticating...
                  </>
                ) : (
                  <>
                    <span>&#x1F510;</span>
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          Context DNA Admin Dashboard
        </p>
      </div>
    </div>
  )
}
