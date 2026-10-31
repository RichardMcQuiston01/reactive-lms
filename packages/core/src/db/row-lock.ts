import type { EntityManager, FindOneOptions } from 'typeorm';

/** Drivers whose writers are already serialized, where row locks do not exist. */
const SERIAL_DRIVERS = new Set(['sqlite', 'better-sqlite3']);

/**
 * `findOne` options that lock the row for the rest of the transaction
 * (`SELECT ... FOR UPDATE`), so concurrent transactions that lock the same row
 * run one after another. Use it on a parent row (a registration, a section, a
 * person) before reading and then changing what hangs off it, so two requests
 * cannot both decide from the same snapshot.
 *
 * Must be used inside a transaction. SQLite has no row locks but runs one
 * writer at a time, so the options are empty there.
 *
 * @param manager - The transaction's entity manager
 */
export function rowLock(manager: EntityManager): Pick<FindOneOptions, 'lock'> {
  const driver = manager.connection?.options?.type;
  return driver !== undefined && SERIAL_DRIVERS.has(driver)
    ? {}
    : { lock: { mode: 'pessimistic_write' } };
}
