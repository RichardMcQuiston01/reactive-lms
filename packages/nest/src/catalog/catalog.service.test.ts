import { describe, expect, test } from 'bun:test';
import type { BlobStorageAdapter } from '@richardmcquiston01/reactive-lms-shared';
import { CourseModule } from '@richardmcquiston01/reactive-lms-persistence';
import type { DataSource } from 'typeorm';
import {
  CatalogService,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  clampPage,
} from './catalog.service';

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

describe('clampPage', () => {
  test('defaults when nothing usable is given', () => {
    expect(clampPage({})).toEqual({ take: DEFAULT_LIST_LIMIT, skip: 0 });
    expect(clampPage({ limit: Number.NaN, offset: Number.NaN })).toEqual({
      take: DEFAULT_LIST_LIMIT,
      skip: 0,
    });
    expect(clampPage({ limit: 0, offset: -5 })).toEqual({
      take: DEFAULT_LIST_LIMIT,
      skip: 0,
    });
    expect(clampPage({ limit: 1.5 })).toEqual({
      take: DEFAULT_LIST_LIMIT,
      skip: 0,
    });
  });

  test('keeps sensible values and caps the limit', () => {
    expect(clampPage({ limit: 25, offset: 50 })).toEqual({
      take: 25,
      skip: 50,
    });
    expect(clampPage({ limit: 100000 }).take).toBe(MAX_LIST_LIMIT);
  });
});

describe('CatalogService list calls', () => {
  function serviceReturning(
    rows: unknown[],
    seen: Array<Record<string, unknown>>,
  ): CatalogService {
    const manager = {
      find: async (
        _entity: unknown,
        options: Record<string, unknown>,
      ): Promise<unknown[]> => {
        seen.push(options);
        return rows;
      },
    };
    return new CatalogService(
      { manager } as unknown as DataSource,
      {} as BlobStorageAdapter,
    );
  }

  const when = new Date('2026-10-21T00:00:00.000Z');

  test('listSections maps rows and passes filter, order, and paging down', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const service = serviceReturning(
      [
        {
          id: 's1',
          courseOfferingId: 'o1',
          title: 'Safety 101',
          createdAt: when,
          updatedAt: when,
        },
      ],
      seen,
    );

    const sections = await service.listSections({ limit: 10 }, 'o1');

    expect(sections).toEqual([
      {
        id: 's1',
        courseOfferingId: 'o1',
        title: 'Safety 101',
        createdAt: '2026-10-21T00:00:00.000Z',
        updatedAt: '2026-10-21T00:00:00.000Z',
      },
    ]);
    expect(seen[0]).toMatchObject({
      where: { courseOfferingId: 'o1' },
      order: { title: 'ASC' },
      take: 10,
      skip: 0,
    });
  });

  test('listSections without an offering applies no filter', async () => {
    const seen: Array<Record<string, unknown>> = [];
    await serviceReturning([], seen).listSections();
    expect(seen[0]).not.toHaveProperty('where');
    expect(seen[0]).toMatchObject({ take: DEFAULT_LIST_LIMIT });
  });

  test('listPackages orders newest first with capped paging', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const service = serviceReturning(
      [
        {
          id: 'p1',
          packageType: 'html5',
          title: 'Intro',
          storageKey: 'packages/p1/original.zip',
          createdAt: when,
          updatedAt: when,
        },
      ],
      seen,
    );

    const packages = await service.listPackages({ limit: 99999, offset: 5 });

    expect(packages[0]).toMatchObject({ id: 'p1', title: 'Intro' });
    expect(seen[0]).toMatchObject({
      order: { createdAt: 'DESC' },
      take: MAX_LIST_LIMIT,
      skip: 5,
    });
  });
});
