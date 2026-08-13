import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';
import { InitialSchema0001 } from './migrations/0001-initial-schema';

/**
 * Host-safe TypeORM DataSource for ReactiveLMS tables and migrations.
 * Tables and the migrations ledger use the `rlms_` prefix.
 */
export function createPersistenceDataSource(options: {
  url: string;
  migrationsRun?: boolean;
}): DataSource {
  return new DataSource({
    type: 'postgres',
    url: options.url,
    entities: [...ALL_ENTITIES],
    migrations: [InitialSchema0001],
    migrationsRun: options.migrationsRun ?? false,
    migrationsTableName: 'rlms_migrations',
    synchronize: false,
  });
}
