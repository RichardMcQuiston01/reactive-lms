import { randomUUID } from 'node:crypto';
import {
  CourseOffering,
  CourseSection,
  CourseTemplate,
  Person,
  Registration,
  createPersistenceDataSource,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { BlobStorageAdapter } from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CatalogService } from './catalog.service';

/**
 * Runs only against a real Postgres (`RLMS_TEST_DATABASE_URL`), to prove the
 * roster read joins people to registrations and pages in a stable order.
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

async function seedSection(): Promise<string> {
  const suffix = randomUUID();
  const template = await ds.manager.save(
    ds.manager.create(CourseTemplate, { title: `T ${suffix}` }),
  );
  const offering = await ds.manager.save(
    ds.manager.create(CourseOffering, {
      courseTemplateId: template.id,
      title: `O ${suffix}`,
    }),
  );
  const section = await ds.manager.save(
    ds.manager.create(CourseSection, {
      courseOfferingId: offering.id,
      title: `S ${suffix}`,
    }),
  );
  return section.id;
}

async function enrol(
  sectionId: string,
  displayName: string | null,
  status: Registration['status'],
  scoreScaled: string | null,
): Promise<string> {
  const person = await ds.manager.save(
    ds.manager.create(Person, {
      externalId: `ext-${randomUUID()}`,
      displayName,
      email: displayName ? `${displayName.toLowerCase()}@example.test` : null,
    }),
  );
  await ds.manager.save(
    ds.manager.create(Registration, {
      personId: person.id,
      courseSectionId: sectionId,
      status,
      scoreScaled,
    }),
  );
  return person.id;
}

describe.skipIf(!databaseUrl)('CatalogService.listSectionRegistrations', () => {
  test('returns each registration with its person, status, and score', async () => {
    const catalog = new CatalogService(ds, {} as BlobStorageAdapter);
    const sectionId = await seedSection();
    const adaId = await enrol(sectionId, 'Ada', 'passed', '0.850000');
    const anonId = await enrol(sectionId, null, 'not_started', null);
    // A registration on another section must not appear.
    await enrol(await seedSection(), 'Other', 'in_progress', null);

    const roster = await catalog.listSectionRegistrations(sectionId);

    expect(roster.map((row) => row.personId)).toEqual([adaId, anonId]);
    expect(roster[0]).toMatchObject({
      displayName: 'Ada',
      email: 'ada@example.test',
      status: 'passed',
      scoreScaled: 0.85,
      courseSectionId: sectionId,
    });
    expect(roster[1]?.displayName).toBeUndefined();
    expect(roster[1]?.scoreScaled).toBeUndefined();
    expect(roster[1]?.status).toBe('not_started');
  });

  test('pages without repeating or skipping people', async () => {
    const catalog = new CatalogService(ds, {} as BlobStorageAdapter);
    const sectionId = await seedSection();
    for (let index = 0; index < 5; index += 1) {
      await enrol(sectionId, `P${index}`, 'in_progress', null);
    }

    const first = await catalog.listSectionRegistrations(sectionId, {
      limit: 2,
      offset: 0,
    });
    const second = await catalog.listSectionRegistrations(sectionId, {
      limit: 2,
      offset: 2,
    });
    const third = await catalog.listSectionRegistrations(sectionId, {
      limit: 2,
      offset: 4,
    });

    const ids = [...first, ...second, ...third].map((row) => row.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  test('a section with no registrations returns an empty roster', async () => {
    const catalog = new CatalogService(ds, {} as BlobStorageAdapter);
    expect(await catalog.listSectionRegistrations(await seedSection())).toEqual(
      [],
    );
  });
});
