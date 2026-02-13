'use client';

import { createContext, useContext } from 'react';
import type { ParentPage } from '@/components/ide/panel-factory';

// ---------------------------------------------------------------------------
// PageContext — declares which page the app is currently on.
//
// Each route wraps its content with <PageProvider page="dashboard|workspace|live">
// so all child components (ActivityBar, panel creation, command palette) can
// filter to only show panels available on the current page.
// ---------------------------------------------------------------------------

const PageContext = createContext<ParentPage>('workspace');

export function PageProvider({
  page,
  children,
}: {
  page: ParentPage;
  children: React.ReactNode;
}) {
  return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}

export function useCurrentPage(): ParentPage {
  return useContext(PageContext);
}
