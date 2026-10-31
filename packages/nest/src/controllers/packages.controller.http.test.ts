import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { PackageImporter } from '@richardmcquiston01/reactive-lms-core';
import { LmsError } from '@richardmcquiston01/reactive-lms-shared';
import { afterEach, describe, expect, test } from 'bun:test';
import { CatalogService } from '../catalog/catalog.service';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { LmsExceptionFilter } from '../filters/lms-exception.filter';
import { LmsRequestService } from '../identity/lms-request.service';
import { PackageImportGuard } from './package-import.guard';
import { PackagesController } from './packages.controller';

const UPLOAD_LIMIT_BYTES = 64;

interface Harness {
  baseUrl: string;
  checks: string[];
  imported: number[];
  fetched: string[];
  close: () => Promise<void>;
}

/**
 * Boots only `PackagesController` with fake collaborators, so the guard,
 * interceptor, and exception filters run exactly as they do in the module.
 */
async function startHarness(denied: ReadonlySet<string>): Promise<Harness> {
  const checks: string[] = [];
  const imported: number[] = [];
  const fetched: string[] = [];

  @Module({
    controllers: [PackagesController],
    providers: [
      PackageImportGuard,
      {
        provide: LmsRequestService,
        useValue: {
          assertCan: async (
            _req: unknown,
            action: string,
            resource: { type: string; id: string },
          ) => {
            checks.push(`${action}:${resource.type}:${resource.id}`);
            if (denied.has(action)) {
              throw new LmsError({
                status: 403,
                code: 'FORBIDDEN',
                message: `Not allowed to ${action}.`,
              });
            }
          },
          ensurePersonId: async () => 'person-1',
        },
      },
      {
        provide: PackageImporter,
        useValue: {
          import: async (bytes: Uint8Array) => {
            imported.push(bytes.byteLength);
            return {
              packageId: 'pkg-1',
              activityNodeId: 'node-1',
              packageType: 'html5',
            };
          },
        },
      },
      {
        provide: CatalogService,
        useValue: {
          getPackage: async (id: string) => {
            fetched.push(id);
            return { id, title: 'Package', activities: [] };
          },
        },
      },
      {
        provide: 'MULTER_MODULE_OPTIONS',
        useValue: { limits: { fileSize: UPLOAD_LIMIT_BYTES, files: 1 } },
      },
      { provide: APP_FILTER, useClass: LmsExceptionFilter },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  })
  class TestModule {}

  const app: INestApplication = await NestFactory.create(TestModule, {
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    checks,
    imported,
    fetched,
    close: () => app.close(),
  };
}

function uploadOf(byteCount: number): FormData {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(byteCount)]), 'course.zip');
  return form;
}

let harness: Harness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('POST /packages', () => {
  test('imports an upload within the size limit', async () => {
    harness = await startHarness(new Set());

    const response = await fetch(`${harness.baseUrl}/packages`, {
      method: 'POST',
      body: uploadOf(10),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      packageId: 'pkg-1',
      id: 'pkg-1',
    });
    expect(harness.imported).toEqual([10]);
    expect(harness.checks).toEqual(['package.import:content_package:*']);
  });

  test('refuses an upload over the limit with 413 and never imports it', async () => {
    harness = await startHarness(new Set());

    const response = await fetch(`${harness.baseUrl}/packages`, {
      method: 'POST',
      body: uploadOf(UPLOAD_LIMIT_BYTES * 4),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(harness.imported).toEqual([]);
  });

  test('refuses a caller who may not import before reading the file', async () => {
    harness = await startHarness(new Set(['package.import']));

    // Oversize on purpose: a 413 here would mean the body was parsed before
    // the permission check ran.
    const response = await fetch(`${harness.baseUrl}/packages`, {
      method: 'POST',
      body: uploadOf(UPLOAD_LIMIT_BYTES * 4),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(harness.imported).toEqual([]);
  });

  test('asks for a file when none is sent', async () => {
    harness = await startHarness(new Set());

    const response = await fetch(`${harness.baseUrl}/packages`, {
      method: 'POST',
      body: new FormData(),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: 'PACKAGE_NOT_DETECTED',
    });
  });
});

describe('GET /packages/:id', () => {
  test('returns the package for an allowed caller, checking that package', async () => {
    harness = await startHarness(new Set());

    const response = await fetch(`${harness.baseUrl}/packages/pkg-7`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'pkg-7' });
    expect(harness.checks).toEqual(['module.manage:content_package:pkg-7']);
  });

  test('refuses a caller who may not manage modules, without loading the package', async () => {
    harness = await startHarness(new Set(['module.manage']));

    const response = await fetch(`${harness.baseUrl}/packages/pkg-7`);

    expect(response.status).toBe(403);
    expect(harness.fetched).toEqual([]);
  });
});
