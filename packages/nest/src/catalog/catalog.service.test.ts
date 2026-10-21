import { describe, expect, test } from 'bun:test';
import type { BlobStorageAdapter } from '@richardmcquiston01/reactive-lms-shared';
import { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import { CatalogService } from './catalog.service';

const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function moduleRow(
  id: string,
  extra: Partial<CourseModule> = {},
): CourseModule {
  return Object.assign(new CourseModule(), {
    id,
    courseSectionId: SECTION_ID,
    title: id,
    sortOrder: 0,
    parentModuleId: null,
    contentPackageId: 'pkg',
    activityNodeId: null,
    availabilityJson: null,
    ...extra,
  });
}

function setup(rows: CourseModule[]): {
  service: CatalogService;
  rows: CourseModule[];
} {
  const manager = {
    findOne: async (
      _entity: unknown,
      options: { where: Partial<CourseModule> },
    ): Promise<CourseModule | null> =>
      rows.find((row) => row.id === options.where.id) ?? null,
    find: async (
      _entity: unknown,
      options: { where: Partial<CourseModule> },
    ): Promise<CourseModule[]> =>
      rows.filter((row) =>
        Object.entries(options.where).every(
          ([key, value]) =>
            (row as unknown as Record<string, unknown>)[key] === value,
        ),
      ),
    save: async (row: CourseModule): Promise<CourseModule> => row,
    delete: async (_entity: unknown, where: { id: string }): Promise<void> => {
      const index = rows.findIndex((row) => row.id === where.id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
  const dataSource = { manager } as unknown as DataSource;
  const service = new CatalogService(dataSource, {} as BlobStorageAdapter);
  return { service, rows };
}

describe('CatalogService module tree', () => {
  test('updateModule re-parents into a block', async () => {
    const block = moduleRow('block', { contentPackageId: null });
    const leaf = moduleRow('leaf');
    const { service } = setup([block, leaf]);

    await service.updateModule('leaf', { parentModuleId: 'block' });

    expect(leaf.parentModuleId).toBe('block');
  });

  test('updateModule refuses a content module as parent', async () => {
    const other = moduleRow('other');
    const leaf = moduleRow('leaf');
    const { service } = setup([other, leaf]);

    const attempt = service.updateModule('leaf', { parentModuleId: 'other' });

    await expect(attempt).rejects.toMatchObject({
      code: 'MODULE_TREE_INVALID',
    });
  });

  test('deleteModule refuses a block that still has children', async () => {
    const block = moduleRow('block', { contentPackageId: null });
    const leaf = moduleRow('leaf', { parentModuleId: 'block' });
    const { service, rows } = setup([block, leaf]);

    const attempt = service.deleteModule('block');

    await expect(attempt).rejects.toMatchObject({
      code: 'MODULE_HAS_CHILDREN',
    });
    expect(rows).toHaveLength(2);
  });

  test('deleteModule removes an empty block', async () => {
    const block = moduleRow('block', { contentPackageId: null });
    const { service, rows } = setup([block]);

    await service.deleteModule('block');

    expect(rows).toHaveLength(0);
  });
});

describe('CatalogService.listModules', () => {
  test('maps rows to DTOs, flagging blocks and reading rules as version 1', async () => {
    const block = moduleRow('block', {
      contentPackageId: null,
      availabilityJson: {
        version: 1,
        all: [{ type: 'date_window', from: '2026-01-01T00:00:00.000Z' }],
      },
    });
    const leaf = moduleRow('leaf', { parentModuleId: 'block', sortOrder: 2 });
    const { service } = setup([block, leaf]);

    const modules = await service.listModules(SECTION_ID);

    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatchObject({
      id: 'block',
      isBlock: true,
      parentModuleId: null,
      contentPackageId: null,
    });
    expect(modules[0]?.availability?.version).toBe(1);
    expect(modules[1]).toMatchObject({
      id: 'leaf',
      isBlock: false,
      parentModuleId: 'block',
      sortOrder: 2,
      availability: null,
      availabilityInvalid: false,
    });
  });

  test('flags unreadable stored rules instead of hiding them', async () => {
    const leaf = moduleRow('leaf', {
      availabilityJson: { version: 9 } as never,
    });
    const { service } = setup([leaf]);

    const [module] = await service.listModules(SECTION_ID);

    expect(module?.availability).toBeNull();
    expect(module?.availabilityInvalid).toBe(true);
  });
});
