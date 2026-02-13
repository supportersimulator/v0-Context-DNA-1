"use client"

import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"

/**
 * /live route — Extensible panel host for extensions.
 *
 * Currently renders the full DockviewShell in focus (injection) mode.
 * DashboardShell internally shows the "injection" tab (Live View).
 *
 * TODO (Phase 4): Replace with standalone LivePage component
 * that uses Panel Protocol v1 for dynamic panel registration,
 * supports websocket/http/iframe/file transports.
 */
export default function LivePage() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <DockviewShell initialTab="injection" />
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
