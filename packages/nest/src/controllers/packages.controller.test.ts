import { describe, expect, test } from 'bun:test';
import type { PackageImporter } from '@reactive-lms/core';
import { LmsError, PACKAGE_NOT_DETECTED } from '@reactive-lms/shared';
import type { CatalogService } from '../catalog/catalog.service';
import type { LmsRequestService } from '../identity/lms-request.service';
import { PackagesController } from './packages.controller';

function controller(overrides?: {
  importer?: Partial<PackageImporter>;
  catalog?: Partial<CatalogService>;
  request?: Partial<LmsRequestService>;
}): PackagesController {
  return new PackagesController(
    {
      import: async () => ({
        packageId: 'pkg-1',
        activityNodeId: 'node-1',
        packageType: 'html5',
      }),
      ...overrides?.importer,
    } as PackageImporter,
    {
      getPackage: async (id: string) => ({
        id,
        packageType: 'html5',
        title: 'Demo',
        storageKey: `packages/${id}/original.zip`,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        activities: [],
      }),
      deletePackage: async () => undefined,
      ...overrides?.catalog,
    } as CatalogService,
    {
      assertCan: async () => undefined,
      ensurePersonId: async () => 'person-1',
      ...overrides?.request,
    } as LmsRequestService,
  );
}

describe('PackagesController', () => {
  test('POST imports the multipart buffer via PackageImporter', async () => {
    const imported: Uint8Array[] = [];
    const ctl = controller({
      importer: {
        import: async (buffer) => {
          imported.push(buffer);
          return {
            packageId: 'pkg-1',
            activityNodeId: 'node-1',
            packageType: 'html5',
          };
        },
      },
    });

    const result = await ctl.create({ buffer: new Uint8Array([1, 2, 3]) }, {});

    expect(imported).toHaveLength(1);
    expect(result).toEqual({
      packageId: 'pkg-1',
      activityNodeId: 'node-1',
      packageType: 'html5',
      id: 'pkg-1',
    });
  });

  test('POST without a file throws PACKAGE_NOT_DETECTED', async () => {
    try {
      await controller().create(undefined, {});
      throw new Error('expected create to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: PACKAGE_NOT_DETECTED,
        status: 400,
      });
    }
  });

  test('GET returns the catalog package', async () => {
    const result = await controller().findOne('pkg-1');
    expect(result.id).toBe('pkg-1');
    expect(result.packageType).toBe('html5');
  });

  test('DELETE calls catalog.deletePackage', async () => {
    const deleted: string[] = [];
    await controller({
      catalog: {
        deletePackage: async (id) => {
          deleted.push(id);
        },
      },
    }).remove('pkg-1', {});
    expect(deleted).toEqual(['pkg-1']);
  });
});
