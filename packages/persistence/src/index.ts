import 'reflect-metadata';

export { createPersistenceDataSource } from './data-source';
export type { PersistenceDataSourceOptions } from './data-source';
export * from './dialect';
export { InitialSchema0001 } from './migrations/postgres/0001-initial-schema';
export * from './entities';
