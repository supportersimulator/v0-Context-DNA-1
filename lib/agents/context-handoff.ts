// =============================================================================
// context-handoff.ts — Agent Context Handoff & Summarization
//
// When switching agents, summarizes recent ProjectDialogue events into a
// compact handoff payload so the incoming agent has context.
//
// Spec: Dashboard-Workspace-Live-Spec.md Section 5
// =============================================================================

import { getProjectDialogue, type ProjectDialogueEvent } from './project-dialogue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffSummary {
  /** Agent being switched FROM */
  fromAgent: string;
  /** Agent being switched TO */
  toAgent: string;
  /** Timestamp of the handoff */
  timestamp: number;
  /** Recent file changes (deduplicated paths) */
  recentFiles: string[];
  /** Recent user messages (last 3) */
  recentMessages: string[];
  /** Active plan/task if any */
  activePlan: string | null;
  /** Error context if switching due to error */
  errorContext: string | null;
  /** Number of events summarized */
  eventCount: number;
}

// ---------------------------------------------------------------------------
// Summarization logic
// ---------------------------------------------------------------------------

const DEFAULT_LOOKBACK = 20;

/**
 * Build a compact handoff summary from recent ProjectDialogue events.
 * Called during agent switches to give the incoming agent context.
 */
export function buildHandoffSummary(
  fromAgent: string,
  toAgent: string,
  lookback: number = DEFAULT_LOOKBACK,
): HandoffSummary {
  const dialogue = getProjectDialogue();
  const recent = dialogue.getRecent(lookback);

  const recentFiles: string[] = [];
  const recentMessages: string[] = [];
  let activePlan: string | null = null;
  let errorContext: string | null = null;

  for (const event of recent) {
    switch (event.type) {
      case 'file_change': {
        const path = (event.payload as { path?: string })?.path;
        if (path && !recentFiles.includes(path)) {
          recentFiles.push(path);
        }
        break;
      }
      case 'user_message': {
        const text = (event.payload as { text?: string })?.text;
        if (text) {
          recentMessages.push(text);
        }
        break;
      }
      case 'plan_update': {
        const plan = (event.payload as { summary?: string })?.summary;
        if (plan) {
          activePlan = plan;
        }
        break;
      }
      case 'agent_status': {
        const status = event.payload as { status?: string };
        if (status?.status === 'error') {
          errorContext = `Agent ${event.agent_id} entered error state`;
        }
        break;
      }
    }
  }

  return {
    fromAgent,
    toAgent,
    timestamp: Date.now(),
    recentFiles: recentFiles.slice(-5),        // Last 5 files
    recentMessages: recentMessages.slice(-3),   // Last 3 messages
    activePlan,
    errorContext,
    eventCount: recent.length,
  };
}

/**
 * Format a handoff summary as a compact string for agent context injection.
 */
export function formatHandoffForAgent(summary: HandoffSummary): string {
  const lines: string[] = [
    `[Handoff: ${summary.fromAgent} → ${summary.toAgent}]`,
  ];

  if (summary.recentFiles.length > 0) {
    lines.push(`Files: ${summary.recentFiles.join(', ')}`);
  }

  if (summary.recentMessages.length > 0) {
    lines.push(`Recent: "${summary.recentMessages[summary.recentMessages.length - 1]}"`);
  }

  if (summary.activePlan) {
    lines.push(`Plan: ${summary.activePlan}`);
  }

  if (summary.errorContext) {
    lines.push(`Error: ${summary.errorContext}`);
  }

  return lines.join(' | ');
}
