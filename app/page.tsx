"use client"

import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AuthWrapper } from '@/components/auth-wrapper';

export default function Home() {
  return (
    <AuthWrapper>
      <DashboardShell />
    </AuthWrapper>
  );
}
