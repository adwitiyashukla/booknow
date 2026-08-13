export interface DatabaseTarget {
  host: string;
  database: string;
  isLocal: boolean;
  label: string;
}

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'db',
  'postgres',
  'host.docker.internal',
]);

export function describeDatabaseTarget(url: string | undefined): DatabaseTarget {
  if (!url) {
    return {
      host: 'unknown',
      database: 'unknown',
      isLocal: false,
      label: 'unknown (DATABASE_URL is not set)',
    };
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname || 'unknown';
    const database = parsed.pathname.replace(/^\//, '') || 'unknown';
    const isLocal = LOCAL_HOSTS.has(host);
    return { host, database, isLocal, label: `${database} at ${host}` };
  } catch {
    return {
      host: 'unparseable',
      database: 'unknown',
      isLocal: false,
      label: 'unparseable DATABASE_URL',
    };
  }
}

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
    '  This command deletes every row it touches. To run it anyway:',
    '',
    '    PowerShell   $env:ALLOW_REMOTE_SEED="true"; npm run ' + command,
    '    bash / zsh   ALLOW_REMOTE_SEED=true npm run ' + command,
    '',
  ].join('\n');
}
