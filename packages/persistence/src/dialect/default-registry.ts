import { DialectRegistry } from './dialect-registry';
import { postgresDialect } from './postgres.dialect';

/**
 * Registry used by `createPersistenceDataSource` when none is passed. Starts
 * with the built-in dialects; a host may register more or replace one.
 */
export const defaultDialectRegistry = new DialectRegistry();

const registered = defaultDialectRegistry.register(postgresDialect);
if (!registered.ok) {
  throw new Error(
    `Could not register the built-in postgres dialect: ${registered.error}`,
  );
}
