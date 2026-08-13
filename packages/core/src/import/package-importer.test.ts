import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LmsError, PACKAGE_NOT_DETECTED } from '@reactive-lms/shared';
import { zipSync, strToU8 } from 'fflate';
import type { DataSource } from 'typeorm';
import { Html5Runtime } from '../runtimes/html5/html5-runtime';
import { FilesystemStorageAdapter } from '../storage/filesystem-storage.adapter';
import { PackageImporter } from './package-importer';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface SavedRow {
  id?: string;
  packageType?: string;
  title?: string;
  entryHref?: string;
  storageKey?: string;
  extractedKey?: string;
  contentPackageId?: string;
  href?: string;
}

function createMockDataSource(saved: SavedRow[]) {
  const manager = {
    create<T extends object>(_entityClass: unknown, plain: T): T {
      return { ...plain };
    },
    async save<T extends SavedRow>(entity: T): Promise<T> {
      saved.push(entity);
      return entity;
    },
  };

  return {
    manager,
    transaction: async <T>(
      run: (entityManager: typeof manager) => Promise<T>,
    ): Promise<T> => run(manager),
  } as unknown as DataSource;
}

describe('PackageImporter', () => {
  let dataRoot: string;
  let storage: FilesystemStorageAdapter;
  let saved: SavedRow[];
  let importer: PackageImporter;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-import-'));
    storage = new FilesystemStorageAdapter(dataRoot);
    saved = [];
    importer = new PackageImporter(
      createMockDataSource(saved),
      storage,
      [new Html5Runtime()],
    );
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  test('imports an HTML5 ZIP and persists package plus activity node', async () => {
    const buffer = zipSync({
      'index.html': strToU8('<html><title>Demo</title></html>'),
    });

    const result = await importer.import(buffer);

    expect(result.packageType).toBe('html5');
    expect(result.packageId).toMatch(UUID_RE);
    expect(result.activityNodeId).toMatch(UUID_RE);

    const pkg = saved.find((row) => row.packageType === 'html5');
    const node = saved.find((row) => row.contentPackageId === result.packageId);
    expect(pkg?.id).toBe(result.packageId);
    expect(pkg?.title).toBe('HTML5 package');
    expect(pkg?.entryHref).toBe('index.html');
    expect(pkg?.storageKey).toContain(result.packageId);
    expect(pkg?.extractedKey).toContain(result.packageId);
    expect(node?.id).toBe(result.activityNodeId);
    expect(node?.href).toBe('index.html');

    const original = await storage.get(pkg!.storageKey!);
    expect(original.byteLength).toBe(buffer.byteLength);
    const extracted = await storage.get(
      `${pkg!.extractedKey}/index.html`,
    );
    expect(new TextDecoder().decode(extracted)).toContain('Demo');
  });

  test('imports a wrapped HTML5 ZIP using the nested index.html path', async () => {
    const buffer = zipSync({
      'course/index.html': strToU8('<html>wrapped</html>'),
    });

    const result = await importer.import(buffer);
    const pkg = saved.find((row) => row.id === result.packageId);
    expect(pkg?.entryHref).toBe('course/index.html');
    const extracted = await storage.get(
      `${pkg!.extractedKey}/course/index.html`,
    );
    expect(new TextDecoder().decode(extracted)).toContain('wrapped');
  });

  test('throws PACKAGE_TYPE_UNSUPPORTED for a detected non-HTML5 package', async () => {
    const buffer = zipSync({
      'imsmanifest.xml': strToU8(
        '<manifest><schemaversion>1.2</schemaversion></manifest>',
      ),
    });

    try {
      await importer.import(buffer);
      throw new Error('expected import to reject unsupported type');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'PACKAGE_TYPE_UNSUPPORTED',
        status: 422,
      });
    }
    expect(saved).toEqual([]);
  });

  test('throws PACKAGE_NOT_DETECTED when the ZIP has no package marker', async () => {
    const buffer = zipSync({
      'readme.txt': strToU8('not a package'),
    });

    try {
      await importer.import(buffer);
      throw new Error('expected import to reject undetected package');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: PACKAGE_NOT_DETECTED,
        status: 400,
      });
    }
    expect(saved).toEqual([]);
  });
});
