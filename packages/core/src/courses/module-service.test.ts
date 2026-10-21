import { describe, expect, test } from 'bun:test';
import {
  ContentPackage,
  CourseModule,
} from '@richardmcquiston01/reactive-lms-persistence';
import { LmsError } from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { createMockDataSource } from '../test/mock-data-source';
import { ModuleService } from './module-service';

const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACKAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('ModuleService', () => {
  test('place appends a module using the package title', async () => {
    const ds = createMockDataSource();
    ds.seed(ContentPackage, {
      id: PACKAGE_ID,
      packageType: 'html5',
      title: 'HTML5 package',
      storageKey: 'packages/p/original.zip',
      extractedKey: 'packages/p/content',
      entryHref: 'index.html',
      manifestJson: {},
    });

    const service = new ModuleService(ds as unknown as DataSource);
    const first = await service.place(SECTION_ID, {
      contentPackageId: PACKAGE_ID,
    });
    const second = await service.place(SECTION_ID, {
      contentPackageId: PACKAGE_ID,
      title: 'Override',
      availability: { afterModuleId: first.moduleId, minScore: 0.5 },
    });

    const rows = ds.rowsOf(CourseModule);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: first.moduleId,
      courseSectionId: SECTION_ID,
      title: 'HTML5 package',
      sortOrder: 0,
    });
    expect(rows[1]).toMatchObject({
      id: second.moduleId,
      title: 'Override',
      sortOrder: 1,
      availabilityJson: {
        afterModuleId: first.moduleId,
        minScore: 0.5,
      },
    });
  });

  test('reorder writes 0-based sort_order', async () => {
    const ds = createMockDataSource();
    ds.seed(ContentPackage, {
      id: PACKAGE_ID,
      packageType: 'html5',
      title: 'P',
      storageKey: 'k',
      manifestJson: {},
    });
    const service = new ModuleService(ds as unknown as DataSource);
    const a = await service.place(SECTION_ID, { contentPackageId: PACKAGE_ID });
    const b = await service.place(SECTION_ID, { contentPackageId: PACKAGE_ID });
    await service.reorder(SECTION_ID, [b.moduleId, a.moduleId]);

    const byId = new Map(ds.rowsOf(CourseModule).map((row) => [row.id, row]));
    expect(byId.get(b.moduleId)?.sortOrder).toBe(0);
    expect(byId.get(a.moduleId)?.sortOrder).toBe(1);
  });

  test('place throws PACKAGE_NOT_FOUND when the package is missing', async () => {
    const ds = createMockDataSource();
    const service = new ModuleService(ds as unknown as DataSource);
    try {
      await service.place(SECTION_ID, { contentPackageId: PACKAGE_ID });
      throw new Error('expected place to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'PACKAGE_NOT_FOUND',
        status: 404,
      });
    }
  });
});
