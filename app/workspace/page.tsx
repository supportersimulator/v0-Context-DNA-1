"use client"

import '@/lib/agents/init';
import { DockviewShell } from "@/components/ide/dockview-shell"
import { AuthWrapper } from "@/components/auth-wrapper"
import { ChatProvider } from "@/lib/contexts/chat-context"
import { ResponsiveProvider } from "@/lib/contexts/responsive-context"
import { PageProvider } from "@/lib/contexts/page-context"

/**
 * /workspace route — DockView IDE (Explorer, Editor, Terminal, Diff).
 *
 * PageProvider declares this as 'workspace' so IDE-specific panels
 * (terminal, git, docker, code editor, workspace-editor) appear in the
 * activity bar.
 *
 * Panels are registered via panel-factory.tsx — adding metadata and a
 * component there makes them available without touching this page. The
 * `workspace-editor` panel (file tree + Monaco wired to /api/fs/{read,write})
 * is registered there alongside the existing IDE panels.
 */
export default function WorkspacePage() {
  return (
    <AuthWrapper>
      <ResponsiveProvider>
        <ChatProvider>
          <PageProvider page="workspace">
            <DockviewShell initialTab="synaptic" />
          </PageProvider>
        </ChatProvider>
      </ResponsiveProvider>
    </AuthWrapper>
  )
}
