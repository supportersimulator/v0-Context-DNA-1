// Agent delegation system — barrel exports
export { getAgentManager, BUILTIN_AGENTS } from './agent-manager';
export type { AgentManager, AgentDefinition, AgentState, AgentStatus, AgentRole, AgentManagerListener } from './agent-manager';

export { getProjectDialogue } from './project-dialogue';
export type { ProjectDialogueStore, ProjectDialogueEvent, ProjectDialogueEventType, EventFilter, Unsubscribe } from './project-dialogue';

export { AgentSwitcher } from './agent-switcher';
export type { AgentSwitcherProps } from './agent-switcher';

export { buildHandoffSummary, formatHandoffForAgent } from './context-handoff';
export type { HandoffSummary } from './context-handoff';
