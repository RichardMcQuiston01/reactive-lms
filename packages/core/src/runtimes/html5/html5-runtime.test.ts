import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  type LaunchRequest,
} from '@reactive-lms/shared';
import { createMemoryFileIndex } from '../../import/package-file-index';
import { Html5Runtime } from './html5-runtime';

const runtime = new Html5Runtime();

const dummyLaunch: LaunchRequest = {
  registrationId: '11111111-1111-1111-1111-111111111111',
  courseModuleId: '22222222-2222-2222-2222-222222222222',
  learner: { externalId: 'u1', displayName: 'Ada' },
  launchMode: 'Normal',
};

describe('Html5Runtime', () => {
  test('declares packageType html5', () => {
    expect(runtime.packageType).toBe('html5');
  });

  test('detect is true for html5 markers and no higher-priority marker', async () => {
    const files = createMemoryFileIndex({ 'index.html': '<html></html>' });
    expect(await runtime.detect(files)).toBe(true);
  });

  test('detect is false when a higher-priority marker is present', async () => {
    const files = createMemoryFileIndex({
      'cmi5.xml': '<courseStructure></courseStructure>',
      'index.html': '<html></html>',
    });
    expect(await runtime.detect(files)).toBe(false);
  });

  test('detect is false when no html5 marker exists', async () => {
    const files = createMemoryFileIndex({ 'readme.txt': 'hello' });
    expect(await runtime.detect(files)).toBe(false);
  });

  test('parse uses index.html as the entry and a single activity node', async () => {
    const files = createMemoryFileIndex({
      'index.html': '<html></html>',
      'assets/app.js': 'console.log(1)',
    });
    const parsed = await runtime.parse(files);
    expect(parsed).toEqual({
      title: 'HTML5 package',
      entryHref: 'index.html',
      packageType: 'html5',
      activities: [{ title: 'HTML5 package', href: 'index.html' }],
    });
  });

  test('parse falls back to the first .html when index.html is absent', async () => {
    const files = createMemoryFileIndex({
      'pages/intro.html': '<html></html>',
      'pages/z-last.html': '<html></html>',
    });
    const parsed = await runtime.parse(files);
    expect(parsed.entryHref).toBe('pages/intro.html');
    expect(parsed.title).toBe('intro');
    expect(parsed.activities).toEqual([
      { title: 'intro', href: 'pages/intro.html' },
    ]);
  });

  test('parse throws PACKAGE_NOT_DETECTED when no html file exists', async () => {
    const files = createMemoryFileIndex({ 'readme.txt': 'hello' });
    try {
      await runtime.parse(files);
      throw new Error('expected parse to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: PACKAGE_NOT_DETECTED,
        status: 400,
      });
    }
  });

  test('createLaunch throws a clear not-implemented error', async () => {
    try {
      await runtime.createLaunch(dummyLaunch);
      throw new Error('expected createLaunch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: 'LAUNCH_NOT_IMPLEMENTED',
        status: 501,
      });
      expect((error as LmsError).message).toMatch(/not implemented in 3a/i);
    }
  });
});
