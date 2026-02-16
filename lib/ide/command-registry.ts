// =============================================================================
// command-registry.ts — Centralized Command Registry
//
// Bridges Command Palette UI, KeybindingRegistry, and CapabilityBus.
// Any panel can register commands → Command Palette queries/displays them →
// execution flows through the registry and optionally emits on CapabilityBus.
//
// This is the missing bridge that connects keyboard shortcuts, the palette,
// and cross-panel actions into a single unified command system.
// =============================================================================

import type { Disposable } from './event-bus';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisteredCommand {
  id: string;
  label: string;
  category: 'View' | 'Navigation' | 'Workspace' | 'System' | 'AI';
  shortcut?: string;
  icon?: ReactNode;
  handler: () => void;
  /** Source panel/component that registered this command */
  source?: string;
}

type CommandListener = () => void;

// ---------------------------------------------------------------------------
// CommandRegistry
// ---------------------------------------------------------------------------

export class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>();
  private listeners = new Set<CommandListener>();

  /** Register a command. Returns a Disposable for cleanup. */
  register(command: RegisteredCommand): Disposable {
    this.commands.set(command.id, command);
    this.notify();
    return {
      dispose: () => {
        if (this.commands.get(command.id) === command) {
          this.commands.delete(command.id);
          this.notify();
        }
      },
    };
  }

  /** Register multiple commands at once. Returns a single Disposable. */
  registerMany(commands: RegisteredCommand[]): Disposable {
    for (const cmd of commands) {
      this.commands.set(cmd.id, cmd);
    }
    this.notify();
    return {
      dispose: () => {
        for (const cmd of commands) {
          if (this.commands.get(cmd.id) === cmd) {
            this.commands.delete(cmd.id);
          }
        }
        this.notify();
      },
    };
  }

  /** Unregister a command by ID. */
  unregister(id: string): void {
    this.commands.delete(id);
    this.notify();
  }

  /** Execute a command by ID. Returns true if found and executed. */
  execute(id: string): boolean {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    try {
      cmd.handler();
    } catch (err) {
      console.error(`[CommandRegistry] Error executing "${id}":`, err);
    }
    return true;
  }

  /** Get a single command by ID. */
  get(id: string): RegisteredCommand | undefined {
    return this.commands.get(id);
  }

  /** Get all registered commands. */
  getAll(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  /** Search commands by query string (fuzzy match on label, category, ID). */
  search(query: string): RegisteredCommand[] {
    if (!query.trim()) return this.getAll();
    const q = query.toLowerCase();
    return this.getAll().filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q),
    );
  }

  /** Subscribe to registry changes (for reactive UI updates). */
  subscribe(listener: CommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }

  dispose(): void {
    this.commands.clear();
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _registry: CommandRegistry | null = null;

export function getCommandRegistry(): CommandRegistry {
  if (!_registry) {
    _registry = new CommandRegistry();
  }
  return _registry;
}

export function _resetCommandRegistry(): void {
  if (_registry) {
    _registry.dispose();
    _registry = null;
  }
}
