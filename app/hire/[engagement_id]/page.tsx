// =============================================================================
// /hire/[engagement_id] — CLIENT-FACING engagement page
// (EE1 Phase-12 scaffold, 2026-05-07).
//
// IMPORTANT: this page is INTENTIONALLY NOT inside the DashboardShell.
// Clients who hire Aaron-as-coder land here and see ONLY their engagement.
// No tabs, no admin sidebar, no surgeon panels, no cluster status.
//
// The page is a thin wrapper around `<HirePanel />` (which lives in
// `components/hire/`, NOT `components/dashboard/`, to make the boundary
// visually obvious in the source tree).
// =============================================================================

import type { Metadata } from 'next';

import { HirePanel } from '@/components/hire/HirePanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Engagement — ContextDNA',
  description: 'Live status of your engagement with Atlas.',
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ engagement_id: string }>;
};

export default async function HireEngagementPage({
  params,
}: PageProps) {
  const { engagement_id: engagementId } = await params;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <HirePanel engagementId={engagementId} />
      </div>
    </main>
  );
}
