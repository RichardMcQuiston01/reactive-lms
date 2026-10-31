import { describe, expect, test } from 'bun:test';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  type LaunchRequest,
} from '@richardmcquiston01/reactive-lms-shared';
import { createMemoryFileIndex } from '../../import/package-file-index';
import { Scorm12Runtime } from './scorm-12-runtime';

const runtime = new Scorm12Runtime();

const dummyLaunch: LaunchRequest = {
  registrationId: '11111111-1111-1111-1111-111111111111',
  courseModuleId: '22222222-2222-2222-2222-222222222222',
  learner: { externalId: 'u1', displayName: 'Ada' },
  launchMode: 'Normal',
};

const MANIFEST = `<?xml version="1.0"?>
<manifest>
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations>
    <organization identifier="ORG">
      <title>Demo SCO</title>
      <item identifier="ITEM" identifierref="RES">
        <title>Playing</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES" href="sco.html" adlcp:scormtype="sco"/>
  </resources>
</manifest>
`;

describe('Scorm12Runtime', () => {
  test('declares packageType scorm_12', () => {
    expect(runtime.packageType).toBe('scorm_12');
  });

  test('detect is true for a 1.2 imsmanifest', async () => {
    const files = createMemoryFileIndex({ 'imsmanifest.xml': MANIFEST });
    expect(await runtime.detect(files)).toBe(true);
  });

  test('detect is false for HTML5-only packages', async () => {
    const files = createMemoryFileIndex({ 'index.html': '<html></html>' });
    expect(await runtime.detect(files)).toBe(false);
  });

  test('parse returns the first SCO as entryHref', async () => {
    const files = createMemoryFileIndex({ 'imsmanifest.xml': MANIFEST });
    const parsed = await runtime.parse(files);
    expect(parsed.packageType).toBe('scorm_12');
    expect(parsed.entryHref).toBe('sco.html');
    expect(parsed.activities[0]?.href).toBe('sco.html');
  });

  test('parse throws PACKAGE_NOT_DETECTED when the manifest is missing', async () => {
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

  test('createLaunch returns a scorm-frame descriptor', async () => {
    const descriptor = await runtime.createLaunch(dummyLaunch, {
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      extractedKey: 'packages/pkg/content',
      entryHref: 'sco.html',
      activityNodeId: '12121212-1212-4121-8121-121212121212',
      getPublicUrl: async (key) => `/lms/content/${key}`,
    });
    expect(descriptor).toEqual({
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      packageType: 'scorm_12',
      playerKind: 'scorm-frame',
      contentUrl: '/lms/content/packages/pkg/content/sco.html',
      runtimeConfig: {
        launchMode: 'Normal',
        learner: dummyLaunch.learner,
        activityNodeId: '12121212-1212-4121-8121-121212121212',
      },
    });
  });
});
