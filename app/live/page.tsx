"use client"

import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"
import { PageProvider } from "@/lib/contexts/page-context"

/**
 * /live route — Extensible panel host for extensions and real-time views.
 *
 * PageProvider declares this as 'live' so extension panels
 * (injection viewer, node-red, provider panels) appear in the activity bar.
 */
export default function LivePage() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <PageProvider page="live">
            <DockviewShell initialTab="injection" />
          </PageProvider>
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
