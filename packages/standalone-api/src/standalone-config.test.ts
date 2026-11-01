import { afterEach, describe, expect, test } from 'bun:test';
import {
  buildDatabaseUrl,
  resolveDatabaseUrl,
  resolveRunMigrations,
} from './standalone-config';

describe('resolveRunMigrations', () => {
  test('runs migrations by default', () => {
    expect(resolveRunMigrations({})).toEqual({ ok: true, value: true });
    expect(resolveRunMigrations({ RLMS_RUN_MIGRATIONS: '' })).toEqual({
      ok: true,
      value: true,
    });
  });

  test.each(['false', 'FALSE', '0', 'no', 'off', ' false '])(
    'turns migrations off for %p',
    (raw) => {
      expect(resolveRunMigrations({ RLMS_RUN_MIGRATIONS: raw })).toEqual({
        ok: true,
        value: false,
      });
    },
  );

  test.each(['true', 'TRUE', '1', 'yes', 'on'])(
    'keeps migrations on for %p',
    (raw) => {
      expect(resolveRunMigrations({ RLMS_RUN_MIGRATIONS: raw })).toEqual({
        ok: true,
        value: true,
      });
    },
  );

  test('rejects an unrecognised value, naming the variable and the value', () => {
    const result = resolveRunMigrations({ RLMS_RUN_MIGRATIONS: 'maybe' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('RLMS_RUN_MIGRATIONS');
      expect(result.error).toContain('"maybe"');
      expect(result.error).toContain('true or false');
    }
  });
});

describe('buildDatabaseUrl', () => {
  test('keeps the plain case readable', () => {
    expect(
      buildDatabaseUrl({
        host: 'localhost',
        port: '5432',
        user: 'rlms',
        password: 'rlms',
        name: 'rlms',
      }),
    ).toBe('postgres://rlms:rlms@localhost:5432/rlms');
  });

  test.each([
    'p/ss',
    'a#b',
    'what?',
    'me@home',
    'a:b',
    '100%',
    'sp ace',
    'p/#?@:% mix',
  ])('a password of %p comes back out of the URL unchanged', (password) => {
    const url = new URL(
      buildDatabaseUrl({
        host: 'db.internal',
        port: '5433',
        user: 'rlms',
        password,
        name: 'rlms',
      }),
    );

    expect(decodeURIComponent(url.password)).toBe(password);
    // The special characters did not change where each part starts.
    expect(url.username).toBe('rlms');
    expect(url.hostname).toBe('db.internal');
    expect(url.port).toBe('5433');
    expect(url.pathname).toBe('/rlms');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  test('a user or database name with special characters survives too', () => {
    const url = new URL(
      buildDatabaseUrl({
        host: 'localhost',
        port: '5432',
        user: 'ops@team',
        password: 'x',
        name: 'my/db',
      }),
    );

    expect(decodeURIComponent(url.username)).toBe('ops@team');
    expect(decodeURIComponent(url.pathname.slice(1))).toBe('my/db');
    expect(url.hostname).toBe('localhost');
  });
});

describe('resolveDatabaseUrl', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test('builds a URL from DATABASE_* parts, encoding the password', () => {
    for (const key of ['RLMS_DATABASE_URL', 'DATABASE_URL']) {
      delete process.env[key];
    }
    process.env['DATABASE_PASSWORD'] = 'p/ss#w?rd';

    const url = new URL(resolveDatabaseUrl());

    expect(decodeURIComponent(url.password)).toBe('p/ss#w?rd');
    expect(url.hostname).toBe('localhost');
  });

  test('uses an explicit URL as given', () => {
    process.env['RLMS_DATABASE_URL'] = 'postgres://u:p@h:1/d';

    expect(resolveDatabaseUrl()).toBe('postgres://u:p@h:1/d');
  });
});
