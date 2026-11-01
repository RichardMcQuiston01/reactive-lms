import { randomUUID } from 'node:crypto';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  CourseOffering,
  CourseSection,
  CourseTemplate,
  NormalizedProgress,
  Person,
  Registration,
  createPersistenceDataSource,
} from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { EventLogService } from './audit/event-log.service';
import { EnrolmentService } from './enrolment/enrolment-service';
import { ModuleService } from './courses/module-service';
import { ancestorsOf } from './courses/module-tree';
import { LaunchService } from './launch/launch-service';
import { ProgressSinkService } from './progress/progress-sink';
import { Html5Runtime } from './runtimes/html5/html5-runtime';

/**
 * These run only against a real Postgres (`RLMS_TEST_DATABASE_URL`), because
 * the races they cover need real transactions and row locks; the in-memory
 * test double cannot reproduce them. Each test makes its own rows and a unique
 * suffix, so they can share a database with the other integration tests.
 */
const databaseUrl = process.env['RLMS_TEST_DATABASE_URL'];
const ROUNDS = 5;

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

interface Course {
  personId: string;
  sectionId: string;
  registrationId: string;
  nodeId: string;
  moduleIds: string[];
}

/** A section with `moduleCount` launchable modules and one enrolled learner. */
async function seedCourse(moduleCount: number): Promise<Course> {
  const suffix = randomUUID();
  const person = await ds.getRepository(Person).save({
    externalId: `ext-${suffix}`,
    displayName: 'Learner',
  });
  const template = await ds.getRepository(CourseTemplate).save({
    code: `T-${suffix}`,
    title: 'Template',
  });
  const offering = await ds.getRepository(CourseOffering).save({
    courseTemplateId: template.id,
    title: 'Offering',
  });
  const section = await ds.getRepository(CourseSection).save({
    courseOfferingId: offering.id,
    title: 'Section',
    completionRule: { allModules: true },
  });
  const contentPackage = await ds.getRepository(ContentPackage).save({
    packageType: 'html5',
    title: 'Package',
    entryHref: 'index.html',
    extractedKey: `packages/${suffix}/content`,
    storageKey: `packages/${suffix}/original.zip`,
    manifestJson: {},
  });
  const node = await ds.getRepository(ActivityNode).save({
    contentPackageId: contentPackage.id,
    title: 'Page',
    href: 'index.html',
  });
  const moduleIds: string[] = [];
  for (let index = 0; index < moduleCount; index += 1) {
    const saved = await ds.getRepository(CourseModule).save({
      courseSectionId: section.id,
      contentPackageId: contentPackage.id,
      activityNodeId: node.id,
      title: `Module ${index + 1}`,
      sortOrder: index,
    });
    moduleIds.push(saved.id);
  }
  const registration = await ds.getRepository(Registration).save({
    personId: person.id,
    courseSectionId: section.id,
    status: 'not_started',
  });
  return {
    personId: person.id,
    sectionId: section.id,
    registrationId: registration.id,
    nodeId: node.id,
    moduleIds,
  };
}

const sink = (): ProgressSinkService =>
  new ProgressSinkService(ds, new EventLogService(ds));

describe.skipIf(!databaseUrl)('concurrent writers (real Postgres)', () => {
  test('the database itself allows one progress row per registration, module, and node', async () => {
    const course = await seedCourse(1);
    const slot = {
      registrationId: course.registrationId,
      courseModuleId: course.moduleIds[0] as string,
      activityNodeId: course.nodeId,
      completionStatus: 'incomplete' as const,
      successStatus: 'unknown' as const,
    };
    const repo = ds.getRepository(NormalizedProgress);
    await repo.save(repo.create(slot));

    const duplicate = repo.save(repo.create(slot));

    await expect(duplicate).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
  });

  test('simultaneous first reports for one node leave a single row', async () => {
    const course = await seedCourse(1);
    const slot = {
      registrationId: course.registrationId,
      courseModuleId: course.moduleIds[0] as string,
      activityNodeId: course.nodeId,
      successStatus: 'unknown' as const,
    };

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        sink().upsert({
          ...slot,
          completionStatus: 'incomplete',
          scoreRaw: index,
        }),
      ),
    );

    const rows = await ds
      .getRepository(NormalizedProgress)
      .find({ where: { registrationId: course.registrationId } });
    expect(rows).toHaveLength(1);
  });

  test('two modules completing together both count toward the registration', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const course = await seedCourse(2);
      const complete = (courseModuleId: string): Promise<void> =>
        sink().upsert({
          registrationId: course.registrationId,
          courseModuleId,
          activityNodeId: course.nodeId,
          completionStatus: 'completed',
          successStatus: 'unknown',
        });

      await Promise.all(course.moduleIds.map(complete));

      const registration = await ds
        .getRepository(Registration)
        .findOneByOrFail({ id: course.registrationId });
      expect(registration.status).toBe('completed');
    }
  });

  test('enrolling the same person at the same time gives everyone the same registration', async () => {
    const course = await seedCourse(1);
    const person = await ds.getRepository(Person).save({
      externalId: `ext-${randomUUID()}`,
      displayName: 'Second learner',
    });
    const enrolment = new EnrolmentService(ds);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        enrolment.manual(course.sectionId, person.id, course.personId),
      ),
    );

    expect(new Set(results.map((result) => result.registrationId)).size).toBe(
      1,
    );
    const rows = await ds.getRepository(Registration).find({
      where: { personId: person.id, courseSectionId: course.sectionId },
    });
    expect(rows).toHaveLength(1);
  });

  test('launching the same module at the same time leaves one open attempt', async () => {
    const course = await seedCourse(1);
    const launches = new LaunchService(
      ds,
      [new Html5Runtime()],
      {},
      new EventLogService(ds),
    );

    await Promise.all(
      Array.from({ length: 6 }, () =>
        launches.launch({
          registrationId: course.registrationId,
          courseModuleId: course.moduleIds[0] as string,
          learner: { externalId: 'ignored', displayName: 'Learner' },
          launchMode: 'Normal',
        }),
      ),
    );

    const open = await ds.getRepository(Attempt).find({
      where: {
        registrationId: course.registrationId,
        termination: 'still_open',
      },
    });
    expect(open).toHaveLength(1);
  });

  test('opposite moves of two blocks cannot leave a cycle', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const course = await seedCourse(0);
      const modules = new ModuleService(ds);
      const first = await modules.placeBlock(course.sectionId, { title: 'A' });
      const second = await modules.placeBlock(course.sectionId, { title: 'B' });

      const outcomes = await Promise.allSettled([
        modules.move(first.moduleId, second.moduleId),
        modules.move(second.moduleId, first.moduleId),
      ]);

      const fulfilled = outcomes.filter(
        (outcome) => outcome.status === 'fulfilled',
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toMatchObject({
        code: 'MODULE_TREE_INVALID',
      });
      const stored = await ds
        .getRepository(CourseModule)
        .find({ where: { courseSectionId: course.sectionId } });
      for (const row of stored) {
        expect(() => ancestorsOf(stored, row.id)).not.toThrow();
      }
    }
  });

  test('simultaneous placements in one section get distinct sort positions', async () => {
    const course = await seedCourse(0);
    const modules = new ModuleService(ds);

    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        modules.placeBlock(course.sectionId, { title: `Block ${index}` }),
      ),
    );

    const orders = (
      await ds
        .getRepository(CourseModule)
        .find({ where: { courseSectionId: course.sectionId } })
    ).map((row) => row.sortOrder);
    expect(new Set(orders).size).toBe(6);
  });
});
