// Agent delegation system — barrel exports
export { getAgentManager, BUILTIN_AGENTS } from './agent-manager';
export type { AgentManager, AgentDefinition, AgentState, AgentStatus, AgentRole, AgentManagerListener } from './agent-manager';

export { getProjectDialogue, getProjectDialogueAsync, getInMemoryStore } from './project-dialogue';
export type { ProjectDialogueStore, ProjectDialogueEvent, ProjectDialogueEventType, EventFilter, Unsubscribe } from './project-dialogue';

export { IndexedDBEventStore } from './indexeddb-event-store';

export { AgentSwitcher } from './agent-switcher';
export type { AgentSwitcherProps } from './agent-switcher';

export { buildHandoffSummary, formatHandoffForAgent } from './context-handoff';
export type { HandoffSummary } from './context-handoff';

export { configureEventStore, getEventStoreConfig, isEventStorePersistent, createEventStore } from './event-store';
export type { EventStore, EventStoreMode, EventStoreConfig } from './event-store';

export { getModeStore } from './agent-mode-store';
export type { ModeStore, AgentMode, SystemMode, ModeState, ModeListener } from './agent-mode-store';
