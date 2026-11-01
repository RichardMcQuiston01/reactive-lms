import { randomUUID } from 'node:crypto';
import {
  Person,
  createPersistenceDataSource,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PersonDirectory } from './person-directory';

/**
 * Runs only against a real Postgres (`RLMS_TEST_DATABASE_URL`): the race it
 * covers needs real transactions, which the unit-test doubles cannot provide.
 */
const databaseUrl = process.env['RLMS_TEST_DATABASE_URL'];

let ds: DataSource;

beforeAll(async () => {
  if (!databaseUrl) {
    return;
  }
  ds = createPersistenceDataSource({ url: databaseUrl, migrationsRun: true });
  await ds.initialize();
});

afterAll(async () => {
  if (ds?.isInitialized) {
    await ds.destroy();
  }
});

describe.skipIf(!databaseUrl)('PersonDirectory.ensure (real Postgres)', () => {
  test('simultaneous first requests for one learner all get the same person', async () => {
    const directory = new PersonDirectory(ds);
    const learner = {
      externalId: `ext-${randomUUID()}`,
      displayName: 'First-time learner',
    };

    const people = await Promise.all(
      Array.from({ length: 10 }, () => directory.ensure(learner)),
    );

    expect(new Set(people.map((person) => person.id)).size).toBe(1);
    const rows = await ds
      .getRepository(Person)
      .find({ where: { externalId: learner.externalId } });
    expect(rows).toHaveLength(1);
  });

  test('find never creates a person', async () => {
    const directory = new PersonDirectory(ds);
    const learner = {
      externalId: `ext-${randomUUID()}`,
      displayName: 'Nobody',
    };

    expect(await directory.find(learner)).toBeNull();
    expect(
      await ds
        .getRepository(Person)
        .count({ where: { externalId: learner.externalId } }),
    ).toBe(0);
  });
});
