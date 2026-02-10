"use client"

import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"

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
