"use client"

import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"

/**
 * /workspace route — DockView IDE (Explorer, Editor, Terminal, Diff).
 *
 * This is the primary workspace. Default landing page.
 * Renders the full DockviewShell with the "synaptic" tab
 * (which shows SynapticSplitView — the main working view).
 *
 * TODO (Phase 2): Add Agent Switcher bar above Editor,
 * Explorer panel sidebar, background agent badges.
 */
export default function WorkspacePage() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <DockviewShell initialTab="synaptic" />
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
