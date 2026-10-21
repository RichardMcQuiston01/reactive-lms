import { randomUUID } from 'node:crypto';

/**
 * Constructor-like target used as a Map key for mocked rows.
 */
export type MockEntityClass = { name: string };

/**
 * In-memory TypeORM-shaped DataSource used by core unit tests.
 * Stores rows keyed by entity class name.
 */
export interface MockDataSource {
  /** TypeORM-like entity manager (also used as the transaction manager). */
  manager: MockEntityManager;
  getRepository: (entity: MockEntityClass) => MockRepository;
  transaction: <T>(
    run: (manager: MockEntityManager) => Promise<T>,
  ) => Promise<T>;
  /** Insert a row before the unit under test runs. */
  seed: (
    entity: MockEntityClass,
    row: Record<string, unknown>,
  ) => Record<string, unknown>;
  /** Snapshot of persisted rows for an entity class. */
  rowsOf: (entity: MockEntityClass) => Record<string, unknown>[];
}

/**
 * Minimal repository surface used by the 3b services.
 */
export interface MockRepository {
  create: (plain: Record<string, unknown>) => Record<string, unknown>;
  save: (entity: Record<string, unknown>) => Promise<Record<string, unknown>>;
  find: (options?: MockFindOptions) => Promise<Record<string, unknown>[]>;
  findOne: (
    options?: MockFindOptions,
  ) => Promise<Record<string, unknown> | null>;
  update: (
    criteria: string | Record<string, unknown>,
    partial: Record<string, unknown>,
  ) => Promise<void>;
}

/**
 * EntityManager subset used inside transactions.
 */
export interface MockEntityManager {
  create: (
    entityClass: MockEntityClass,
    plain: Record<string, unknown>,
  ) => Record<string, unknown>;
  save: (
    entityClassOrRow: MockEntityClass | Record<string, unknown>,
    maybeRow?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  find: (
    entityClass: MockEntityClass,
    options?: MockFindOptions,
  ) => Promise<Record<string, unknown>[]>;
  findOne: (
    entityClass: MockEntityClass,
    options?: MockFindOptions,
  ) => Promise<Record<string, unknown> | null>;
  update: (
    entityClass: MockEntityClass,
    criteria: string | Record<string, unknown>,
    partial: Record<string, unknown>,
  ) => Promise<void>;
  getRepository: (entity: MockEntityClass) => MockRepository;
}

/**
 * `find` / `findOne` options understood by the mock.
 */
export interface MockFindOptions {
  where?: Record<string, unknown>;
  order?: Record<string, 'ASC' | 'DESC' | 'asc' | 'desc'>;
}

/**
 * Builds a mocked DataSource that records saves per entity class name.
 */
export function createMockDataSource(): MockDataSource {
  const store = new Map<string, Record<string, unknown>[]>();

  const rowsOf = (entity: MockEntityClass): Record<string, unknown>[] => {
    const existing = store.get(entity.name);
    if (!existing) {
      const created: Record<string, unknown>[] = [];
      store.set(entity.name, created);
      return created;
    }
    return existing;
  };

  const matches = (
    row: Record<string, unknown>,
    where?: Record<string, unknown>,
  ): boolean => {
    if (!where) {
      return true;
    }
    return Object.entries(where).every(([key, value]) => row[key] === value);
  };

  const persist = (
    entity: MockEntityClass,
    row: Record<string, unknown>,
  ): Record<string, unknown> => {
    const list = rowsOf(entity);
    if (typeof row.id !== 'string' || row.id.length === 0) {
      row.id = randomUUID();
    }
    Object.defineProperty(row, 'constructor', {
      value: entity,
      enumerable: false,
    });
    const index = list.findIndex((entry) => entry.id === row.id);
    if (index >= 0) {
      const merged = { ...list[index], ...row };
      Object.defineProperty(merged, 'constructor', {
        value: entity,
        enumerable: false,
      });
      list[index] = merged;
      return merged;
    }
    list.push(row);
    return row;
  };

  const applyOrder = (
    rows: Record<string, unknown>[],
    order?: MockFindOptions['order'],
  ): Record<string, unknown>[] => {
    if (!order) {
      return rows;
    }
    const entries = Object.entries(order);
    return [...rows].sort((left, right) => {
      for (const [key, direction] of entries) {
        const leftValue = left[key];
        const rightValue = right[key];
        if (leftValue === rightValue) {
          continue;
        }
        const cmp = String(leftValue) < String(rightValue) ? -1 : 1;
        return direction === 'DESC' || direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  };

  const repositoryFor = (entity: MockEntityClass): MockRepository => ({
    create: (plain) => ({ ...plain }),
    save: async (row) => persist(entity, row),
    find: async (options) => {
      const found = rowsOf(entity).filter((row) =>
        matches(row, options?.where),
      );
      return applyOrder(found, options?.order);
    },
    findOne: async (options) => {
      const found = applyOrder(
        rowsOf(entity).filter((row) => matches(row, options?.where)),
        options?.order,
      );
      return found[0] ?? null;
    },
    update: async (criteria, partial) => {
      const list = rowsOf(entity);
      for (const row of list) {
        const hit =
          typeof criteria === 'string'
            ? row.id === criteria
            : matches(row, criteria);
        if (hit) {
          Object.assign(row, partial);
        }
      }
    },
  });

  const manager: MockEntityManager = {
    create: (entityClass, plain) => {
      const row = { ...plain };
      Object.defineProperty(row, 'constructor', {
        value: entityClass,
        enumerable: false,
      });
      return row;
    },
    save: async (entityClassOrRow, maybeRow) => {
      if (maybeRow) {
        return persist(entityClassOrRow as MockEntityClass, maybeRow);
      }
      const row = entityClassOrRow as Record<string, unknown>;
      const ctor = row.constructor as MockEntityClass | undefined;
      if (!ctor?.name || ctor.name === 'Object') {
        throw new Error('mock save(entity) needs a class-tagged row');
      }
      return persist(ctor, row);
    },
    find: async (entityClass, options) =>
      repositoryFor(entityClass).find(options),
    findOne: async (entityClass, options) =>
      repositoryFor(entityClass).findOne(options),
    update: async (entityClass, criteria, partial) =>
      repositoryFor(entityClass).update(criteria, partial),
    getRepository: (entity) => repositoryFor(entity),
  };

  return {
    manager,
    getRepository: (entity) => repositoryFor(entity),
    transaction: async (run) => run(manager),
    seed: (entity, row) => persist(entity, { ...row }),
    rowsOf,
  };
}
