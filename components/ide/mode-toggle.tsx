'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, User, Zap, Feather } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getModeStore, type AgentMode, type SystemMode, type ModeState } from '@/lib/agents/agent-mode-store';

// ---------------------------------------------------------------------------
// ModeToggle — compact dual toggle for status bar
// ---------------------------------------------------------------------------

export function ModeToggle() {
  const [state, setState] = useState<ModeState>(() => getModeStore().getState());

  useEffect(() => {
    return getModeStore().subscribe(setState);
  }, []);

  const toggleAgent = useCallback(() => {
    const store = getModeStore();
    store.setAgentMode(state.agentMode === 'swarm' ? 'single' : 'swarm');
  }, [state.agentMode]);

  const toggleSystem = useCallback(() => {
    const store = getModeStore();
    store.setSystemMode(state.systemMode === 'lite' ? 'heavy' : 'lite');
  }, [state.systemMode]);

  return (
    <div className="flex items-center gap-1">
      {/* Agent mode toggle */}
      <button
        onClick={toggleAgent}
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
          state.agentMode === 'swarm'
            ? 'bg-[#f59e0b]/10 text-[#f59e0b]'
            : 'bg-[#6b6b75]/10 text-[#6b6b75] hover:text-[#e5e5e5]',
        )}
        title={state.agentMode === 'swarm' ? 'Swarm mode: multiple agents' : 'Single agent mode'}
      >
        {state.agentMode === 'swarm' ? (
          <Users className="w-3 h-3" />
        ) : (
          <User className="w-3 h-3" />
        )}
        <span>{state.agentMode === 'swarm' ? 'Swarm' : 'Single'}</span>
      </button>

      {/* System mode toggle */}
      <button
        onClick={toggleSystem}
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
          state.systemMode === 'heavy'
            ? 'bg-[#a78bfa]/10 text-[#a78bfa]'
            : 'bg-[#6b6b75]/10 text-[#6b6b75] hover:text-[#e5e5e5]',
        )}
        title={state.systemMode === 'lite' ? 'Lite mode: in-memory' : 'Heavy mode: SQLite/Redis'}
      >
        {state.systemMode === 'heavy' ? (
          <Zap className="w-3 h-3" />
        ) : (
          <Feather className="w-3 h-3" />
        )}
        <span>{state.systemMode === 'lite' ? 'Lite' : 'Heavy'}</span>
      </button>
    </div>
  );
}
