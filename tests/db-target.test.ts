import { describe, expect, it } from 'vitest';

import {
  confirmationMessage,
  describeDatabaseTarget,
  requiresConfirmation,
} from '@/lib/db-target';

const LOCAL = 'postgresql://booknow:booknow@localhost:5432/booknow?schema=public';
const COMPOSE = 'postgresql://booknow:booknow@db:5432/booknow?schema=public';
const REMOTE = 'postgresql://neondb_owner:secret_pw@ep-noisy-haze.aws.neon.tech/neondb?sslmode=require';

describe('describeDatabaseTarget', () => {
  it('reads host and database from a local url', () => {
    const t = describeDatabaseTarget(LOCAL);
    expect(t.host).toBe('localhost');
    expect(t.database).toBe('booknow');
    expect(t.isLocal).toBe(true);
  });

  it('treats the docker-compose service name as local', () => {
    expect(describeDatabaseTarget(COMPOSE).isLocal).toBe(true);
  });

  it('treats a managed host as remote', () => {
    const t = describeDatabaseTarget(REMOTE);
    expect(t.isLocal).toBe(false);
    expect(t.host).toBe('ep-noisy-haze.aws.neon.tech');
    expect(t.database).toBe('neondb');
  });

  it('never leaks the password into the printable label', () => {
    const t = describeDatabaseTarget(REMOTE);
    expect(t.label).not.toContain('secret_pw');
    expect(t.label).not.toContain('neondb_owner');
    expect(JSON.stringify(t)).not.toContain('secret_pw');
  });

  it('fails safe: an unset url is treated as remote, not local', () => {
    const t = describeDatabaseTarget(undefined);
    expect(t.isLocal).toBe(false);
  });

  it('fails safe: unparseable input is treated as remote', () => {
    const t = describeDatabaseTarget('not a url at all');
    expect(t.isLocal).toBe(false);
  });
});

describe('requiresConfirmation', () => {
  it('lets a local run through untouched', () => {
    expect(requiresConfirmation(describeDatabaseTarget(LOCAL), {})).toBe(false);
  });

  it('blocks a remote run by default', () => {
    expect(requiresConfirmation(describeDatabaseTarget(REMOTE), {})).toBe(true);
  });

  it('allows a remote run only when opted into explicitly', () => {
    const t = describeDatabaseTarget(REMOTE);
    expect(requiresConfirmation(t, { ALLOW_REMOTE_SEED: 'true' })).toBe(false);
    expect(requiresConfirmation(t, { ALLOW_REMOTE_SEED: '1' })).toBe(true);
    expect(requiresConfirmation(t, { ALLOW_REMOTE_SEED: 'yes' })).toBe(true);
  });

  it('reproduces the incident: a remote url left exported in the shell is stopped', () => {
    // Exactly the shape of the mistake this guard exists to prevent.
    const shell = { DATABASE_URL: REMOTE };
    expect(requiresConfirmation(describeDatabaseTarget(shell.DATABASE_URL), shell)).toBe(true);
  });
});

describe('confirmationMessage', () => {
  it('names the target and the command without exposing credentials', () => {
    const msg = confirmationMessage(describeDatabaseTarget(REMOTE), 'db:seed');
    expect(msg).toContain('neondb at ep-noisy-haze.aws.neon.tech');
    expect(msg).toContain('db:seed');
    expect(msg).not.toContain('secret_pw');
  });
});
