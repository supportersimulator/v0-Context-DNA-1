"use client"

import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"

/**
 * Root page — renders the full IDE shell (Workspace view by default).
 *
 * Route structure (Dashboard | Workspace | Live):
 *   /           → This page (full IDE, defaults to Workspace)
 *   /dashboard  → Dashboard measurement cockpit
 *   /workspace  → DockView IDE (Explorer, Editor, Terminal)
 *   /live       → Extensible panel host
 *
 * Each route currently renders the same DockviewShell with different initialTab.
 * Phase 2 will give each route a standalone component.
 */
export default function Page() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <DockviewShell />
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
