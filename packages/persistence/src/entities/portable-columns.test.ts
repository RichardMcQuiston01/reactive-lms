import { describe, expect, test } from 'bun:test';
import { getMetadataArgsStorage } from 'typeorm';
import { ALL_ENTITIES } from './index';

/**
 * Column types that only some engines accept. Entities must stay portable
 * (D9); these belong in dialect migrations only.
 */
const NATIVE_ONLY_TYPES = [
  'jsonb',
  'bytea',
  'timestamptz',
  'numeric',
  'blob',
  'longblob',
];

describe('entity column portability', () => {
  test('no entity column uses an engine-specific type', () => {
    const offenders = getMetadataArgsStorage()
      .columns.filter((column) => ALL_ENTITIES.includes(column.target as never))
      .filter((column) => {
        const type = column.options.type;
        return typeof type === 'string' && NATIVE_ONLY_TYPES.includes(type);
      })
      .map(
        (column) =>
          `${(column.target as { name: string }).name}.${column.propertyName}: ${String(column.options.type)}`,
      );

    expect(offenders).toEqual([]);
  });
});
