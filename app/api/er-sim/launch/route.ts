/**
 * ER Simulator Launcher
 *
 * POST /api/er-sim/launch
 *
 * Spawns the ER Simulator (Expo web build) as a detached child process.
 * Returns the spawned PID and the URL where the dev server will serve.
 *
 * Security:
 *   - Uses execFile / spawn with an argv array — never a shell string.
 *   - No user input is interpolated into the command.
 *   - ER_SIM_PATH env var overrides the default location.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Default location of the ER Simulator (er-sim-monitor) inside the superrepo.
// Resolved relative to the IDE's package.json (admin.contextdna.io).
const DEFAULT_ER_SIM_PATH = path.resolve(
  process.cwd(),
  '..',
  'simulator-core',
  'er-sim-monitor',
);

// Expo web dev server default port.
const ER_SIM_URL = 'http://localhost:8081';

export async function POST() {
  const erSimPath = process.env.ER_SIM_PATH || DEFAULT_ER_SIM_PATH;

  if (!existsSync(erSimPath)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'ER Simulator path not configured. Set ER_SIM_PATH env var.',
        suggested_path: DEFAULT_ER_SIM_PATH,
      },
      { status: 500 },
    );
  }

  const pkgJson = path.join(erSimPath, 'package.json');
  if (!existsSync(pkgJson)) {
    return NextResponse.json(
      {
        ok: false,
        error: `ER Simulator package.json missing at ${pkgJson}.`,
        suggested_path: DEFAULT_ER_SIM_PATH,
      },
      { status: 500 },
    );
  }

  try {
    // npm run web → expo start --web (Expo Router app)
    // Spawn detached so it survives this request handler.
    // argv form (no shell) — user input never reaches a shell.
    const child = spawn('npm', ['run', 'web'], {
      cwd: erSimPath,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        BROWSER: 'none', // don't auto-open in IDE-launched flow
      },
    });

    child.unref();

    return NextResponse.json({
      ok: true,
      pid: child.pid,
      url: ER_SIM_URL,
      cwd: erSimPath,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `Failed to spawn ER Simulator: ${String(e)}`,
        suggested_path: erSimPath,
      },
      { status: 500 },
    );
  }
}
