"use client"

import '@/lib/agents/init';
import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"
import { PageProvider } from "@/lib/contexts/page-context"

/**
 * /dashboard route — Measurement cockpit.
 *
 * PageProvider declares this as 'dashboard' so only dashboard-available
 * panels appear in the activity bar and command palette.
 */
export default function DashboardPage() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <PageProvider page="dashboard">
            <DockviewShell initialTab="home" />
          </PageProvider>
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
