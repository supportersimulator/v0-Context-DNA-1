"use client"

import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"

/**
 * /dashboard route — Measurement cockpit.
 *
 * Currently renders the full DockviewShell (same as root).
 * DashboardShell internally shows the "home" tab when navigated here.
 *
 * TODO (Phase 2): Replace with standalone DashboardPage component
 * that renders benchmark cards, system health, service grid, etc.
 * without the DockView chrome.
 */
export default function DashboardPage() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <DockviewShell initialTab="home" />
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
