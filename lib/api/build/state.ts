/**
 * Module-level build run state.
 *
 * Tracks the *most recent* build invocation issued via /api/build/run so
 * /api/build/status can report whether a build is still in flight, when it
 * started, what target it is, and the spawned PID.
 *
 * We deliberately keep this in-memory and per-process — no persistence,
 * no queueing. If two clients hit /api/build/run concurrently, both spawns
 * happen but `currentBuild` always reflects the most recent one. The UI
 * disables the run buttons while running:true so this is acceptable for v1.
 */

export interface BuildRunState {
  target: string;
  running: boolean;
  started_at: number;
  pid: number | null;
  finished_at?: number;
  exit_code?: number | null;
}

let currentBuild: BuildRunState | null = null;

export function setBuildStarted(target: string, pid: number | null): void {
  currentBuild = {
    target,
    running: true,
    started_at: Date.now(),
    pid,
  };
}

export function setBuildFinished(exitCode: number | null): void {
  if (!currentBuild) return;
  currentBuild = {
    ...currentBuild,
    running: false,
    finished_at: Date.now(),
    exit_code: exitCode,
  };
}

export function getBuildState(): BuildRunState | null {
  return currentBuild;
}
