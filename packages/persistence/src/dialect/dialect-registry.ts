import type { PersistenceDialect } from './persistence-dialect';

/**
 * Outcome of a registry operation. Callers must check `ok`.
 */
export type DialectResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

/**
 * Options for {@link DialectRegistry.register}.
 */
export interface RegisterDialectOptions {
  /**
   * Allows replacing a dialect that is already registered under the same name.
   * Without it, registering a duplicate name fails.
   */
  replace?: boolean;
}

/**
 * Holds the persistence dialects available to
 * `createPersistenceDataSource`, keyed by name.
 */
export class DialectRegistry {
  private readonly dialects = new Map<string, PersistenceDialect>();

  /**
   * Adds a dialect.
   *
   * @param dialect - Dialect to add
   * @param options - Set `replace` to override an existing name
   */
  register(
    dialect: PersistenceDialect,
    options: RegisterDialectOptions = {},
  ): DialectResult<PersistenceDialect> {
    const name = dialect.name.trim();
    if (name.length === 0) {
      return { ok: false, error: 'A dialect must have a non-empty name.' };
    }
    if (this.dialects.has(name) && options.replace !== true) {
      return {
        ok: false,
        error: `Dialect "${name}" is already registered. Pass { replace: true } to override it.`,
      };
    }
    this.dialects.set(name, dialect);
    return { ok: true, value: dialect };
  }

  /**
   * Looks up a dialect by name.
   *
   * @param name - Registered dialect name
   */
  get(name: string): DialectResult<PersistenceDialect> {
    const dialect = this.dialects.get(name);
    if (!dialect) {
      const known = this.names();
      return {
        ok: false,
        error: `Unknown persistence dialect "${name}". Registered dialects: ${
          known.length > 0 ? known.join(', ') : '(none)'
        }.`,
      };
    }
    return { ok: true, value: dialect };
  }

  /**
   * Returns the registered dialect names, sorted.
   */
  names(): string[] {
    return [...this.dialects.keys()].sort();
  }
}
