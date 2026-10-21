import type { DataSourceOptions, MigrationInterface } from 'typeorm';

/**
 * A migration class TypeORM can instantiate.
 */
export type DialectMigration = new () => MigrationInterface;

/**
 * Connection details a dialect needs to build driver options.
 */
export interface DialectConnection {
  /** Connection URL for the database. */
  url: string;
}

/**
 * Everything database-specific about ReactiveLMS persistence.
 *
 * Entities use portable TypeORM column types, so all engine differences live
 * here: the TypeORM driver, its options, and the migration set. A host can
 * register its own dialect (SQL Server, CockroachDB, Oracle, ...) or replace a
 * built-in one, including `postgres`, without touching the entities.
 */
export interface PersistenceDialect {
  /** Registry name, for example `postgres`. */
  readonly name: string;

  /** Migrations for this engine, in the order they must run. */
  readonly migrations: readonly DialectMigration[];

  /**
   * Builds the driver-specific TypeORM options (type, URL, driver extras).
   * Entities, migrations, and the migrations table are added by
   * `createPersistenceDataSource`.
   *
   * @param connection - Connection details
   */
  driverOptions(connection: DialectConnection): DataSourceOptions;
}
