/**
 * Command whitelist — the security boundary for the IDE terminal.
 *
 * WHY (NON-NEGOTIABLE):
 *   The terminal exec route spawns child processes on the host running the
 *   IDE. If we allowed arbitrary commands, any XSS / CSRF / open-CORS bug
 *   anywhere in the IDE would become full RCE on Aaron's machine.
 *   Allowing only a fixed set of dev tools shrinks the blast radius to
 *   "things Aaron would type himself anyway".
 *
 * RULES:
 *   1. command must be a non-empty string
 *   2. argv[0] (after naive whitespace split) must be in ALLOWED_BINARIES
 *   3. `bash` is special-cased: only `bash -c <single-arg>` is permitted —
 *      bare `bash` (interactive shell) and other bash flags are rejected.
 *   4. No shell metacharacters anywhere in the argv. We split by whitespace
 *      with no shell expansion (see exec/route.ts), so glob/redirect/pipe
 *      characters would never work — we reject them with a clear error
 *      instead of silently passing them as literal arguments.
 *
 * NOT ENFORCED HERE:
 *   - Whether `git push` is destructive, whether `npm install` adds deps,
 *     etc. The whitelist gates *binaries*, not *intent*. Aaron is the user;
 *     this is an IDE terminal he asked for.
 */

export const ALLOWED_BINARIES = [
  'npm',
  'npx',
  'git',
  'ls',
  'pwd',
  'cat',
  'echo',
  'python3',
  'expo',
  'node',
  'bash',
] as const;

export type AllowedBinary = (typeof ALLOWED_BINARIES)[number];

/** Characters that imply shell expansion. We never invoke a shell, but if
 *  any of these appear in the input the user almost certainly expected one,
 *  so we reject rather than silently misbehaving. */
const SHELL_METACHARS = /[;&|`$<>(){}*?\[\]\\]/;

export interface WhitelistOk {
  ok: true;
  argv: string[];
}

export interface WhitelistErr {
  ok: false;
  status: 400;
  error: string;
}

export type WhitelistResult = WhitelistOk | WhitelistErr;

/**
 * Naive whitespace split of the command. NO shell expansion — quoted strings,
 * variable expansion, globs, redirects, pipes are NOT supported. Documented
 * limitation. For "bash -c '...'" pass the script via the body's `command`
 * field as e.g. `bash -c date` (no spaces inside the script) or use a
 * dedicated binary like `npm` / `git`.
 */
export function validateCommand(raw: unknown): WhitelistResult {
  if (typeof raw !== 'string') {
    return { ok: false, status: 400, error: 'command must be a string' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'command must be non-empty' };
  }
  if (SHELL_METACHARS.test(trimmed)) {
    return {
      ok: false,
      status: 400,
      error: `command contains shell metacharacters; this terminal does NOT invoke a shell. Use the binary directly.`,
    };
  }
  // Naive whitespace split — see top-of-file note. No quoted strings.
  const argv = trimmed.split(/\s+/);
  const head = argv[0];
  if (!head || !(ALLOWED_BINARIES as readonly string[]).includes(head)) {
    return {
      ok: false,
      status: 400,
      error: `command "${head}" not in allow-list. Allowed: ${ALLOWED_BINARIES.join(', ')}`,
    };
  }
  // bash is special: only `bash -c <arg>` is permitted.
  if (head === 'bash') {
    if (argv.length < 3 || argv[1] !== '-c') {
      return {
        ok: false,
        status: 400,
        error: 'bash is restricted to `bash -c <command>` form',
      };
    }
  }
  return { ok: true, argv };
}
