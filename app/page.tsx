"use client"

import DashboardShell from "@/components/dashboard/DashboardShell"
import { AuthWrapper } from "@/components/auth-wrapper"

export default function Page() {
  return (
    <AuthWrapper>
      <DashboardShell />
    </AuthWrapper>
  )
}
