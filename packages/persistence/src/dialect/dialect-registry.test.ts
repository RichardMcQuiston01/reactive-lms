import { describe, expect, test } from 'bun:test';
import { DialectRegistry } from './dialect-registry';
import { defaultDialectRegistry } from './default-registry';
import type { PersistenceDialect } from './persistence-dialect';
import { postgresDialect } from './postgres.dialect';

const fakeDialect = (name: string): PersistenceDialect => ({
  name,
  migrations: [],
  driverOptions: ({ url }) => ({ type: 'postgres', url }),
});

describe('DialectRegistry', () => {
  test('registers and finds a dialect', () => {
    const registry = new DialectRegistry();
    const added = registry.register(fakeDialect('mssql'));
    expect(added.ok).toBe(true);

    const found = registry.get('mssql');
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(found.value.name).toBe('mssql');
    }
  });

  test('rejects a duplicate name unless replace is set', () => {
    const registry = new DialectRegistry();
    registry.register(fakeDialect('mssql'));

    const duplicate = registry.register(fakeDialect('mssql'));
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error).toContain('"mssql" is already registered');
    }

    const replacement = fakeDialect('mssql');
    const replaced = registry.register(replacement, { replace: true });
    expect(replaced.ok).toBe(true);
    const found = registry.get('mssql');
    expect(found.ok && found.value === replacement).toBe(true);
  });

  test('rejects an empty name', () => {
    const result = new DialectRegistry().register(fakeDialect('  '));
    expect(result.ok).toBe(false);
  });

  test('an unknown name lists the registered dialects', () => {
    const registry = new DialectRegistry();
    registry.register(fakeDialect('b'));
    registry.register(fakeDialect('a'));

    const result = registry.get('oracle');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unknown persistence dialect "oracle"');
      expect(result.error).toContain('a, b');
    }
  });

  test('the default registry ships postgres and allows replacing it', () => {
    const found = defaultDialectRegistry.get('postgres');
    expect(found.ok && found.value === postgresDialect).toBe(true);

    const isolated = new DialectRegistry();
    isolated.register(postgresDialect);
    const replaced = isolated.register(fakeDialect('postgres'), {
      replace: true,
    });
    expect(replaced.ok).toBe(true);
  });
});
