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

describe.skipIf(!databaseUrl)('PersonDirectory.search (real Postgres)', () => {
  /** Makes people that share a token unique to this test, so others in the database never match. */
  async function seed(
    token: string,
    people: Array<{
      displayName?: string;
      email?: string;
      externalId?: string;
    }>,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const person of people) {
      const row = await ds.getRepository(Person).save(
        ds.getRepository(Person).create({
          externalId: person.externalId ?? `ext-${randomUUID()}`,
          displayName: person.displayName ?? null,
          email: person.email ?? null,
        }),
      );
      ids.push(row.id);
    }
    expect(token).not.toBe('');
    return ids;
  }

  test('matches name, email, and host identifier, ignoring case', async () => {
    const directory = new PersonDirectory(ds);
    const token = `tok${randomUUID().slice(0, 8)}`;
    const [byName, byEmail, byExternal, other] = await seed(token, [
      { displayName: `Ada ${token.toUpperCase()}` },
      { email: `someone@${token}.example.test` },
      { externalId: `ext-${token}-x` },
      { displayName: 'Unrelated' },
    ]);

    const found = await directory.search(token.toUpperCase());
    const ids = found.map((person) => person.id);

    expect(ids).toContain(byName as string);
    expect(ids).toContain(byEmail as string);
    expect(ids).toContain(byExternal as string);
    expect(ids).not.toContain(other as string);
  });

  test('returns only the fields a picker needs', async () => {
    const directory = new PersonDirectory(ds);
    const token = `tok${randomUUID().slice(0, 8)}`;
    await seed(token, [
      { displayName: `Grace ${token}`, email: `g@${token}.test` },
    ]);

    const [person] = await directory.search(token);

    expect(Object.keys(person ?? {}).sort()).toEqual([
      'displayName',
      'email',
      'externalId',
      'id',
    ]);
    expect(person?.displayName).toBe(`Grace ${token}`);
  });

  test('percent, underscore, and backslash match themselves, not everything', async () => {
    const directory = new PersonDirectory(ds);
    const token = randomUUID().slice(0, 8);
    const [percent, underscore, plain] = await seed(token, [
      { displayName: `${token} 100% done` },
      { displayName: `${token} a_b` },
      { displayName: `${token} 100x done aXb` },
    ]);

    const percentIds = (await directory.search(`${token} 100%`)).map(
      (person) => person.id,
    );
    expect(percentIds).toEqual([percent as string]);

    const underscoreIds = (await directory.search(`${token} a_b`)).map(
      (person) => person.id,
    );
    expect(underscoreIds).toEqual([underscore as string]);
    expect(underscoreIds).not.toContain(plain as string);

    // A lone wildcard must not list the whole table.
    const lonePercent = await directory.search('%');
    const everyone = await directory.search('');
    expect(lonePercent.length).toBeLessThan(everyone.length);
    expect(await directory.search('\\')).toEqual([]);
  });

  test('pages in a stable order without repeating or skipping people', async () => {
    const directory = new PersonDirectory(ds);
    const token = `tok${randomUUID().slice(0, 8)}`;
    await seed(
      token,
      Array.from({ length: 5 }, (_, index) => ({
        displayName: `${token} person ${index}`,
      })),
    );

    const ids: string[] = [];
    for (const offset of [0, 2, 4]) {
      const page = await directory.search(token, { limit: 2, offset });
      ids.push(...page.map((person) => person.id));
    }

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    const names = (await directory.search(token)).map(
      (person) => person.displayName,
    );
    expect(names).toEqual([...names].sort());
  });

  test('search text longer than the limit is cut, not rejected', async () => {
    const directory = new PersonDirectory(ds);
    const token = `tok${randomUUID().slice(0, 8)}`;
    await seed(token, [{ displayName: token }]);

    expect(await directory.search(`${token}${'z'.repeat(500)}`)).toEqual([]);
    expect(await directory.search(token)).toHaveLength(1);
  });
});
