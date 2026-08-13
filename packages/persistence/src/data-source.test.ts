import { describe, expect, test } from 'bun:test';
import { getMetadataArgsStorage } from 'typeorm';
import {
  ALL_ENTITIES,
  Registration,
  createPersistenceDataSource,
} from './index';

describe('entity metadata', () => {
  test('every entity table name starts with rlms_', () => {
    expect(ALL_ENTITIES.length).toBeGreaterThan(0);

    const tableNames = getMetadataArgsStorage()
      .tables.filter((table) => ALL_ENTITIES.includes(table.target as never))
      .map((table) => table.name);

    expect(tableNames.length).toBe(ALL_ENTITIES.length);

    for (const name of tableNames) {
      expect(name?.startsWith('rlms_')).toBe(true);
    }
  });

  test('Registration has a unique index on (personId, courseSectionId)', () => {
    const uniqueColumns = getMetadataArgsStorage()
      .uniques.filter((unique) => unique.target === Registration)
      .flatMap((unique) => unique.columns ?? []);

    const indexColumns = getMetadataArgsStorage()
      .indices.filter(
        (index) => index.target === Registration && index.unique === true,
      )
      .flatMap((index) => index.columns ?? []);

    const columns = [...uniqueColumns, ...indexColumns];
    expect(columns).toContain('personId');
    expect(columns).toContain('courseSectionId');
  });
});

const testDatabaseUrl = process.env.RLMS_TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('persistence integration', () => {
  test('applies migration, reuses a package, rejects duplicate registration', async () => {
    const { Person } = await import('./entities/person.entity');
    const { CourseTemplate } = await import(
      './entities/course-template.entity'
    );
    const { CourseOffering } = await import(
      './entities/course-offering.entity'
    );
    const { CourseSection } = await import('./entities/course-section.entity');
    const { CourseModule } = await import('./entities/course-module.entity');
    const { ContentPackage } = await import(
      './entities/content-package.entity'
    );
    const { Registration: RegistrationEntity } = await import(
      './entities/registration.entity'
    );

    const dataSource = createPersistenceDataSource({
      url: testDatabaseUrl as string,
      migrationsRun: true,
    });

    await dataSource.initialize();

    try {
      const suffix = crypto.randomUUID();

      const person = await dataSource.getRepository(Person).save({
        externalId: `ext-${suffix}`,
        displayName: 'Test Learner',
      });

      const template = await dataSource.getRepository(CourseTemplate).save({
        code: `T-${suffix}`,
        title: 'Template',
      });

      const offering = await dataSource.getRepository(CourseOffering).save({
        courseTemplateId: template.id,
        title: 'Offering',
      });

      const section = await dataSource.getRepository(CourseSection).save({
        courseOfferingId: offering.id,
        title: 'Section',
        completionRule: { allModules: true },
      });

      const contentPackage = await dataSource
        .getRepository(ContentPackage)
        .save({
          packageType: 'html5',
          title: 'Reusable package',
          storageKey: `packages/${suffix}.zip`,
          manifestJson: {},
        });

      const moduleRepo = dataSource.getRepository(CourseModule);
      const firstModule = await moduleRepo.save({
        courseSectionId: section.id,
        contentPackageId: contentPackage.id,
        title: 'Module 1',
        sortOrder: 1,
      });
      const secondModule = await moduleRepo.save({
        courseSectionId: section.id,
        contentPackageId: contentPackage.id,
        title: 'Module 2',
        sortOrder: 2,
      });

      expect(firstModule.contentPackageId).toBe(contentPackage.id);
      expect(secondModule.contentPackageId).toBe(contentPackage.id);

      const registrationRepo = dataSource.getRepository(RegistrationEntity);
      await registrationRepo.save({
        personId: person.id,
        courseSectionId: section.id,
        status: 'not_started',
      });

      try {
        await registrationRepo.save({
          personId: person.id,
          courseSectionId: section.id,
          status: 'not_started',
        });
        throw new Error('expected unique violation');
      } catch (error) {
        const code =
          (error as { code?: string }).code ??
          (error as { driverError?: { code?: string } }).driverError?.code;
        expect(code).toBe('23505');
      }
    } finally {
      await dataSource.destroy();
    }
  });
});
