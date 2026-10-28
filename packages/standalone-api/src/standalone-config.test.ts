import { describe, expect, test } from 'bun:test';
import { resolveRunMigrations } from './standalone-config';

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
