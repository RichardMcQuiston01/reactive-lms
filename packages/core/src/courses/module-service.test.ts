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
        version: 1,
        all: [
          { type: 'module_completed', moduleId: first.moduleId },
          { type: 'min_score', moduleId: first.moduleId, score: 0.5 },
        ],
      },
    });
  });

  test('place stores version 1 rules as given', async () => {
    const ds = createMockDataSource();
    ds.seed(ContentPackage, {
      id: PACKAGE_ID,
      packageType: 'html5',
      title: 'HTML5 package',
      storageKey: 'k',
      manifestJson: {},
    });
    const rules = {
      version: 1 as const,
      any: [
        { type: 'group_member' as const, groupId: 'g1' },
        { type: 'module_completed' as const, moduleId: 'm1' },
      ],
    };

    const service = new ModuleService(ds as unknown as DataSource);
    await service.place(SECTION_ID, {
      contentPackageId: PACKAGE_ID,
      availability: rules,
    });

    expect(ds.rowsOf(CourseModule)[0]?.availabilityJson).toEqual(rules);
  });

  test('place rejects invalid availability and stores nothing', async () => {
    const ds = createMockDataSource();
    ds.seed(ContentPackage, {
      id: PACKAGE_ID,
      packageType: 'html5',
      title: 'HTML5 package',
      storageKey: 'k',
      manifestJson: {},
    });
    const service = new ModuleService(ds as unknown as DataSource);

    const attempt = service.place(SECTION_ID, {
      contentPackageId: PACKAGE_ID,
      availability: { version: 1, any: [] },
    });

    await expect(attempt).rejects.toMatchObject({
      code: 'AVAILABILITY_INVALID',
      status: 400,
    });
    await expect(attempt).rejects.toThrow('at least one condition');
    expect(ds.rowsOf(CourseModule)).toEqual([]);
  });

  test('place with no rules stores null', async () => {
    const ds = createMockDataSource();
    ds.seed(ContentPackage, {
      id: PACKAGE_ID,
      packageType: 'html5',
      title: 'HTML5 package',
      storageKey: 'k',
      manifestJson: {},
    });
    const service = new ModuleService(ds as unknown as DataSource);

    await service.place(SECTION_ID, {
      contentPackageId: PACKAGE_ID,
      availability: {},
    });

    expect(ds.rowsOf(CourseModule)[0]?.availabilityJson).toBeNull();
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

  describe('module tree', () => {
    function setup() {
      const ds = createMockDataSource();
      ds.seed(ContentPackage, {
        id: PACKAGE_ID,
        packageType: 'html5',
        title: 'HTML5 package',
        storageKey: 'k',
        manifestJson: {},
      });
      return { ds, service: new ModuleService(ds as unknown as DataSource) };
    }

    test('placeBlock creates a block with no content package', async () => {
      const { ds, service } = setup();

      const { moduleId } = await service.placeBlock(SECTION_ID, {
        title: 'Chapter 1',
      });

      expect(ds.rowsOf(CourseModule)[0]).toMatchObject({
        id: moduleId,
        title: 'Chapter 1',
        contentPackageId: null,
        parentModuleId: null,
        activityNodeId: null,
        sortOrder: 0,
      });
    });

    test('a module is placed inside a block and sorts among its siblings', async () => {
      const { ds, service } = setup();
      const chapter = await service.placeBlock(SECTION_ID, { title: 'Ch' });
      const top = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
      });
      const first = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
        parentModuleId: chapter.moduleId,
      });
      const second = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
        parentModuleId: chapter.moduleId,
      });

      const byId = new Map(ds.rowsOf(CourseModule).map((row) => [row.id, row]));
      expect(byId.get(top.moduleId)?.sortOrder).toBe(1);
      expect(byId.get(first.moduleId)).toMatchObject({
        parentModuleId: chapter.moduleId,
        sortOrder: 0,
      });
      expect(byId.get(second.moduleId)?.sortOrder).toBe(1);
    });

    test('rejects a content module as a parent', async () => {
      const { service } = setup();
      const leaf = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
      });

      await expect(
        service.place(SECTION_ID, {
          contentPackageId: PACKAGE_ID,
          parentModuleId: leaf.moduleId,
        }),
      ).rejects.toMatchObject({ code: 'MODULE_TREE_INVALID' });
    });

    test('rejects a parent that is not in the section', async () => {
      const { ds, service } = setup();

      await expect(
        service.placeBlock(SECTION_ID, {
          title: 'Orphan',
          parentModuleId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        }),
      ).rejects.toMatchObject({ code: 'MODULE_NOT_FOUND' });
      expect(ds.rowsOf(CourseModule)).toEqual([]);
    });

    test('a min_score rule on a block must name a module', async () => {
      const { service } = setup();

      const attempt = service.placeBlock(SECTION_ID, {
        title: 'Gate',
        availability: {
          version: 1,
          all: [{ type: 'min_score', score: 0.8 }],
        },
      });

      await expect(attempt).rejects.toMatchObject({
        code: 'AVAILABILITY_INVALID',
      });
      await expect(attempt).rejects.toThrow('must name a moduleId');
    });

    test('a block accepts a min_score rule that names a module', async () => {
      const { ds, service } = setup();

      await service.placeBlock(SECTION_ID, {
        title: 'Gate',
        availability: {
          version: 1,
          all: [{ type: 'min_score', moduleId: 'm1', score: 0.8 }],
        },
      });

      expect(ds.rowsOf(CourseModule)[0]?.availabilityJson).toEqual({
        version: 1,
        all: [{ type: 'min_score', moduleId: 'm1', score: 0.8 }],
      });
    });

    test('move re-parents a module and appends it among the new siblings', async () => {
      const { ds, service } = setup();
      const chapter = await service.placeBlock(SECTION_ID, { title: 'Ch' });
      await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
        parentModuleId: chapter.moduleId,
      });
      const loose = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
      });

      await service.move(loose.moduleId, chapter.moduleId);

      const moved = ds
        .rowsOf(CourseModule)
        .find((row) => row.id === loose.moduleId);
      expect(moved).toMatchObject({
        parentModuleId: chapter.moduleId,
        sortOrder: 1,
      });

      await service.move(loose.moduleId, null);
      expect(
        ds.rowsOf(CourseModule).find((row) => row.id === loose.moduleId)
          ?.parentModuleId,
      ).toBeNull();
    });

    test('move refuses to put a block inside its own subtree', async () => {
      const { service } = setup();
      const outer = await service.placeBlock(SECTION_ID, { title: 'Outer' });
      const inner = await service.placeBlock(SECTION_ID, {
        title: 'Inner',
        parentModuleId: outer.moduleId,
      });

      await expect(
        service.move(outer.moduleId, inner.moduleId),
      ).rejects.toMatchObject({ code: 'MODULE_TREE_INVALID' });
    });

    test('move reports an unknown module', async () => {
      const { service } = setup();
      await expect(
        service.move('ffffffff-ffff-4fff-8fff-ffffffffffff', null),
      ).rejects.toMatchObject({ code: 'MODULE_NOT_FOUND' });
    });

    test("reorder with a parent only accepts that parent's children", async () => {
      const { ds, service } = setup();
      const chapter = await service.placeBlock(SECTION_ID, { title: 'Ch' });
      const a = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
        parentModuleId: chapter.moduleId,
      });
      const b = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
        parentModuleId: chapter.moduleId,
      });
      const loose = await service.place(SECTION_ID, {
        contentPackageId: PACKAGE_ID,
      });

      await service.reorder(
        SECTION_ID,
        [b.moduleId, a.moduleId],
        chapter.moduleId,
      );
      const order = (id: string): unknown =>
        ds.rowsOf(CourseModule).find((row) => row.id === id)?.sortOrder;
      expect(order(b.moduleId)).toBe(0);
      expect(order(a.moduleId)).toBe(1);

      await expect(
        service.reorder(SECTION_ID, [loose.moduleId], chapter.moduleId),
      ).rejects.toMatchObject({ code: 'MODULE_TREE_INVALID' });
      await expect(
        service.reorder(SECTION_ID, [a.moduleId], null),
      ).rejects.toThrow('not a direct child of the section');
    });
  });
});
