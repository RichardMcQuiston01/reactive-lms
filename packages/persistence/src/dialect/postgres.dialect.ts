import { InitialSchema0001 } from '../migrations/postgres/0001-initial-schema';
import type { PersistenceDialect } from './persistence-dialect';

/**
 * PostgreSQL 13 or later. Timestamps are stored as `timestamptz`, which keeps
 * UTC instants; native types such as `jsonb` and `gen_random_uuid()` appear
 * only in this dialect's migrations.
 */
export const postgresDialect: PersistenceDialect = {
  name: 'postgres',
  migrations: [InitialSchema0001],
  driverOptions: ({ url }) => ({ type: 'postgres', url }),
};
