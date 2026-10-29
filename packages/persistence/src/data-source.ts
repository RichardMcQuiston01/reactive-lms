import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { defaultDialectRegistry } from './dialect/default-registry';
import type { DialectRegistry } from './dialect/dialect-registry';
import type { PersistenceDialect } from './dialect/persistence-dialect';
import { ALL_ENTITIES } from './entities';

/**
 * Options for {@link createPersistenceDataSource}.
 */
export interface PersistenceDataSourceOptions {
  /** Database connection URL. */
  url: string;

  /**
   * A dialect object, or the name of a registered one. Defaults to `postgres`.
   */
  dialect?: PersistenceDialect | string;

  /** Registry used to resolve a dialect name. Defaults to the built-ins. */
  registry?: DialectRegistry;

  /** Runs pending migrations when the DataSource initializes. */
  migrationsRun?: boolean;
}

/**
 * Host-safe TypeORM DataSource for ReactiveLMS tables and migrations.
 * Tables and the migrations ledger use the `rlms_` prefix. Engine-specific
 * behavior comes from the dialect, so a host can pick or replace one.
 *
 * @param options - Connection URL, dialect, and migration behavior
 * @throws Error naming the dialect and the registered alternatives when a
 *   dialect name cannot be resolved
 */
export function createPersistenceDataSource(
  options: PersistenceDataSourceOptions,
): DataSource {
  const dialectOption = options.dialect ?? 'postgres';
  let dialect: PersistenceDialect;
  if (typeof dialectOption === 'string') {
    const resolved = (options.registry ?? defaultDialectRegistry).get(
      dialectOption,
    );
    if (!resolved.ok) {
      throw new Error(resolved.error);
    }
    dialect = resolved.value;
  } else {
    dialect = dialectOption;
  }

  return new DataSource({
    ...dialect.driverOptions({ url: options.url }),
    entities: [...ALL_ENTITIES],
    migrations: [...dialect.migrations],
    migrationsRun: options.migrationsRun ?? false,
    migrationsTableName: 'rlms_migrations',
    synchronize: false,
  } as DataSourceOptions);
}
