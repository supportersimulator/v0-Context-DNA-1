/**
 * ServiceEndpoints — single source of truth for all service URLs.
 *
 * INVARIANT: Zero hardcoded localhost fallbacks in production.
 * All URLs come from environment variables.
 */
import { app } from 'electron';
import path from 'path';

const isDev = process.env.NODE_ENV !== 'production';

export interface ServiceEndpoints {
  /** Next.js dev server URL */
  devServer: string;
  /** Swift supervisor API */
  supervisor: string;
  /** Agent service (uvicorn, port 8080) — surgeons, webhooks, contextdna */
  agentService: string;
  /** Fleet daemon (Python, port 8855) — multi-machine coordination */
  fleet: string;
  /** Repository root path */
  repoRoot: string;
}

/**
 * Load service endpoints from environment.
 * In production: all URLs MUST come from env vars (no fallbacks).
 * In development: localhost fallbacks are acceptable.
 */
export function loadEndpoints(): ServiceEndpoints {
  if (isDev) {
    return {
      devServer: process.env.DEV_SERVER_URL || 'http://localhost:3000',
      supervisor: process.env.SUPERVISOR_URL || 'http://127.0.0.1:9090',
      agentService: process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8080',
      fleet: process.env.FLEET_URL || 'http://127.0.0.1:8855',
      repoRoot: process.env.REPO_ROOT || path.join(process.env.HOME || '', 'Documents/er-simulator-superrepo'),
    };
  }

  // Production: require env vars, fail fast if missing
  const missing: string[] = [];

  const supervisor = process.env.SUPERVISOR_URL;
  if (!supervisor) missing.push('SUPERVISOR_URL');

  const agentService = process.env.AGENT_SERVICE_URL;
  if (!agentService) missing.push('AGENT_SERVICE_URL');

  const repoRoot = process.env.REPO_ROOT;
  if (!repoRoot) missing.push('REPO_ROOT');

  const fleet = process.env.FLEET_URL;
  if (!fleet) missing.push('FLEET_URL');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for production: ${missing.join(', ')}. ` +
      `Set these in your environment or .env file.`
    );
  }

  return {
    devServer: '', // not used in production
    supervisor: supervisor!,
    agentService: agentService!,
    fleet: fleet!,
    repoRoot: repoRoot!,
  };
}

/**
 * Get platform-appropriate user data path.
 * Uses Electron's app.getPath('userData') for correct OS paths.
 */
export function getUserDataPath(): string {
  return app.getPath('userData');
}
