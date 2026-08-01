/**
 * Identify which database a destructive script is pointed at.
 *
 * `npm run db:seed` truncates every table. It reads DATABASE_URL, and an
 * environment variable exported into a shell earlier in the day is invisible
 * at the moment you press enter. That is exactly how this project's own
 * production data got wiped once: the terminal still had a remote URL exported
 * from an earlier task, and the seed printed nothing about where it was going.
 *
 * So the target is parsed and announced before anything is deleted, and a
 * remote target has to be confirmed deliberately. Pure and separately tested,
 * because a safety check that is itself unverified is not much of a safety
 * check.
 */

export interface DatabaseTarget {
  host: string;
  database: string;
  isLocal: boolean;
  /** Host and database only. Never carries the password. */
  label: string;
}

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'db', // the docker-compose service name
  'postgres',
  'host.docker.internal',
]);

/**
 * Parse a Postgres URL into something safe to print.
 *
 * Malformed input is treated as remote rather than local: the failure mode of
 * guessing "local" is wiping someone's production data, and the failure mode of
 * guessing "remote" is one extra confirmation.
 */
export function describeDatabaseTarget(url: string | undefined): DatabaseTarget {
  if (!url) {
    return { host: 'unknown', database: 'unknown', isLocal: false, label: 'unknown (DATABASE_URL is not set)' };
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname || 'unknown';
    const database = parsed.pathname.replace(/^\//, '') || 'unknown';
    const isLocal = LOCAL_HOSTS.has(host);
    return { host, database, isLocal, label: `${database} at ${host}` };
  } catch {
    return { host: 'unparseable', database: 'unknown', isLocal: false, label: 'unparseable DATABASE_URL' };
  }
}

/** True when a destructive run against this target should be blocked. */
export function requiresConfirmation(
  target: DatabaseTarget,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !target.isLocal && env.ALLOW_REMOTE_SEED !== 'true';
}

export function confirmationMessage(target: DatabaseTarget, command: string): string {
  return [
    '',
    `  Refusing to run ${command} against a remote database.`,
    '',
    `    target : ${target.label}`,
    '',
    '  This command deletes every row it touches. If that is genuinely what you',
    '  want, say so explicitly:',
    '',
    '    PowerShell   $env:ALLOW_REMOTE_SEED="true"; npm run ' + command,
    '    bash / zsh   ALLOW_REMOTE_SEED=true npm run ' + command,
    '',
  ].join('\n');
}
