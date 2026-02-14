// =============================================================================
// init.ts — One-time EventStore initialization
//
// Import this module to activate IndexedDB-backed persistence for the
// ProjectDialogue event bus. Must run before first getProjectDialogue() call.
// =============================================================================

import { configureEventStore } from './event-store';

// Activate IndexedDB persistence ('sqlite' mode maps to IndexedDB in browser)
configureEventStore({ mode: 'sqlite', maxHistory: 500 });
