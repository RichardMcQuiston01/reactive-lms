import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  collectBlobBody,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { Html5Runtime } from '../html5/html5-runtime';
import { PackageImporter } from '../../import/package-importer';
import { FilesystemBlobStorageAdapter } from '../../storage/filesystem-blob-storage.adapter';
import {
  readScorm12Fixture,
  zipScorm12Fixture,
  type Scorm12FixtureName,
} from '../../testing/scorm12-fixtures';
import { Scorm12Runtime } from './scorm-12-runtime';

interface SavedRow {
  id?: string;
  packageType?: string;
  title?: string;
  version?: string;
  entryHref?: string;
  storageKey?: string;
  extractedKey?: string;
  contentPackageId?: string;
  parentId?: string | null;
  publisherId?: string;
  href?: string | null;
  metadataJson?: Record<string, unknown> | null;
  sortOrder?: number;
}

/** A node as the importer stored it, with its children found by parent id. */
interface StoredNode {
  title?: string;
  href?: string | null;
  publisherId?: string;
  metadata?: Record<string, unknown> | null;
  children: StoredNode[];
}

function createMockDataSource(saved: SavedRow[]): DataSource {
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

function nodeTree(saved: SavedRow[], packageId: string): StoredNode[] {
  const rows = saved.filter((row) => row.contentPackageId === packageId);
  const byId = new Map<string, StoredNode>();
  for (const row of rows) {
    byId.set(row.id as string, {
      title: row.title,
      href: row.href,
      publisherId: row.publisherId,
      metadata: row.metadataJson,
      children: [],
    });
  }
  const roots: StoredNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id as string) as StoredNode;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

describe('SCORM 1.2 fixture packages', () => {
  let dataRoot: string;
  let storage: FilesystemBlobStorageAdapter;
  let saved: SavedRow[];
  let importer: PackageImporter;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), 'rlms-scorm12-'));
    storage = new FilesystemBlobStorageAdapter(dataRoot);
    saved = [];
    importer = new PackageImporter(createMockDataSource(saved), storage, [
      new Html5Runtime(),
      new Scorm12Runtime(),
    ]);
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  async function importFixture(
    name: Scorm12FixtureName,
    overrides: Record<string, Uint8Array | string | null> = {},
  ): Promise<{ packageId: string; pkg: SavedRow; nodes: StoredNode[] }> {
    const result = await importer.import(zipScorm12Fixture(name, overrides));
    expect(result.packageType).toBe('scorm_12');
    const pkg = saved.find((row) => row.id === result.packageId) as SavedRow;
    return {
      packageId: result.packageId,
      pkg,
      nodes: nodeTree(saved, result.packageId),
    };
  }

  async function storedText(
    extractedKey: string,
    file: string,
  ): Promise<string> {
    const result = await storage.get(`${extractedKey}/${file}`);
    if (!result.ok) {
      throw new Error(`${file} was not stored: ${result.error.message}`);
    }
    return new TextDecoder().decode(await collectBlobBody(result.value.body));
  }

  describe('simple-sco', () => {
    test('imports as one launchable SCO', async () => {
      const { pkg, nodes } = await importFixture('simple-sco');

      expect(pkg.title).toBe('Simple Course');
      expect(pkg.version).toBe('1.2');
      expect(pkg.entryHref).toBe('sco.html');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        title: 'Welcome',
        href: 'sco.html',
        publisherId: 'ITEM-WELCOME',
        metadata: { scormType: 'sco' },
      });
    });

    test('stores every file so the launch page can be served', async () => {
      const { pkg } = await importFixture('simple-sco');

      const page = await storedText(pkg.extractedKey as string, 'sco.html');

      expect(page).toContain('LMSInitialize');
      expect(page).toContain('cmi.core.lesson_status');
    });
  });

  describe('chapters-and-assets', () => {
    test('uses the default organization, not the first', async () => {
      const { pkg, nodes } = await importFixture('chapters-and-assets');

      expect(pkg.title).toBe('Fish & Chips <Basics> — Part 1');
      expect(nodes.map((node) => node.title)).toEqual([
        'Welcome (read first)',
        'Chapter 1 — Café Basics',
        'Final Quiz',
      ]);
      expect(JSON.stringify(nodes)).not.toContain('Decoy');
      expect(JSON.stringify(nodes)).not.toContain('Not real');
    });

    test('launches the first SCO, not the asset that comes before it', async () => {
      const { pkg } = await importFixture('chapters-and-assets');

      expect(pkg.entryHref).toBe('lessons/lesson-1.html');
    });

    test('keeps the chapter structure with launchable lessons inside it', async () => {
      const { nodes } = await importFixture('chapters-and-assets');
      const [welcome, chapter, quiz] = nodes;

      expect(welcome).toMatchObject({
        href: 'intro/welcome.html',
        metadata: { scormType: 'asset' },
      });
      expect(chapter?.href ?? undefined).toBeUndefined();
      expect(
        chapter?.children.map((child) => [child.title, child.href]),
      ).toEqual([
        ['Lesson 1: Frying', 'lessons/lesson-1.html'],
        ['Lesson 2: Seasoning', 'lessons/lesson-2.html'],
      ]);
      expect(quiz).toMatchObject({ href: 'quiz/quiz.html' });
    });

    test('reads launch data and normalizes the SCO type', async () => {
      const { nodes } = await importFixture('chapters-and-assets');
      const lessons = nodes[1]?.children ?? [];

      expect(lessons[0]?.metadata).toMatchObject({
        scormType: 'sco',
        launchData: 'mode=review&level=2',
      });
      // The manifest wrote this one as adlcp:scormType="SCO".
      expect(lessons[1]?.metadata).toMatchObject({ scormType: 'sco' });
    });

    test('keeps what the SCO is told about its time and mastery limits', async () => {
      const { nodes } = await importFixture('chapters-and-assets');
      const lesson = nodes[1]?.children[0];

      expect(lesson?.metadata).toMatchObject({
        masteryScore: 80,
        maxTimeAllowed: '00:30:00',
        timeLimitAction: 'exit,message',
      });
    });

    test('stores the shared files the lessons load', async () => {
      const { pkg } = await importFixture('chapters-and-assets');

      const script = await storedText(
        pkg.extractedKey as string,
        'shared/scorm-api.js',
      );

      expect(script).toContain('findScormApi');
    });
  });

  describe('bookmark-resume', () => {
    test('imports with its mastery score recorded', async () => {
      const { pkg, nodes } = await importFixture('bookmark-resume');

      expect(pkg.title).toBe('Bookmark and Resume');
      expect(pkg.entryHref).toBe('index.html');
      expect(nodes[0]?.metadata).toMatchObject({ masteryScore: 70 });
    });
  });

  describe('xml-base', () => {
    test('resolves resource paths against xml:base', async () => {
      const { pkg, nodes } = await importFixture('xml-base');

      expect(pkg.entryHref).toBe('content/v2/story.html');
      expect(nodes.map((node) => node.href)).toEqual([
        'content/v2/story.html',
        'content/other.html',
      ]);
    });
  });

  describe('launch-parameters', () => {
    test('adds an item parameters string to the launch address', async () => {
      const { nodes } = await importFixture('launch-parameters');

      expect(nodes.map((node) => node.href)).toEqual([
        'player.html?lang=fr&mode=review',
        'player.html?version=1&step=2',
        'player.html?version=1',
      ]);
    });

    test('finds the launch file by its path, ignoring the query', async () => {
      const { pkg } = await importFixture('launch-parameters');

      expect(pkg.entryHref).toBe('player.html?lang=fr&mode=review');
      expect(
        await storedText(pkg.extractedKey as string, 'player.html'),
      ).toContain('location.search');
    });
  });

  describe('broken exports are refused with a message that says what is wrong', () => {
    async function failureOf(attempt: Promise<unknown>): Promise<LmsError> {
      try {
        await attempt;
      } catch (error) {
        expect(error).toBeInstanceOf(LmsError);
        return error as LmsError;
      }
      throw new Error('Expected the import to be refused.');
    }

    test('a launch file that is not in the package', async () => {
      const error = await failureOf(
        importer.import(zipScorm12Fixture('simple-sco', { 'sco.html': null })),
      );

      expect(error.code).toBe(PACKAGE_NOT_DETECTED);
      expect(error.message).toContain('sco.html');
      expect(error.message).toContain('Welcome');
      expect(saved).toEqual([]);
    });

    test('a launch file that differs only by letter case', async () => {
      const error = await failureOf(
        importer.import(
          zipScorm12Fixture('simple-sco', {
            'sco.html': null,
            'SCO.html': '<html></html>',
          }),
        ),
      );

      expect(error.message).toContain('SCO.html');
      expect(error.message).toContain('letter case');
    });

    test('a launch path that climbs out of the package', async () => {
      const manifest = new TextDecoder()
        .decode(readScorm12Fixture('simple-sco')['imsmanifest.xml'])
        .replaceAll('href="sco.html"', 'href="../outside.html"');
      const error = await failureOf(
        importer.import(
          zipScorm12Fixture('simple-sco', { 'imsmanifest.xml': manifest }),
        ),
      );

      expect(error.code).toBe(PACKAGE_NOT_DETECTED);
      expect(error.message).toContain('../outside.html');
    });

    test('a course whose only items are assets has nothing to launch as a SCO', async () => {
      const manifest = new TextDecoder()
        .decode(readScorm12Fixture('simple-sco')['imsmanifest.xml'])
        .replace('adlcp:scormtype="sco"', 'adlcp:scormtype="asset"');
      const result = await importer.import(
        zipScorm12Fixture('simple-sco', { 'imsmanifest.xml': manifest }),
      );

      // Still importable: an asset-only course can be viewed, just not tracked.
      expect(result.packageType).toBe('scorm_12');
    });
  });
});
