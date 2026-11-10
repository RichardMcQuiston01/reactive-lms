import { describe, expect, test } from 'bun:test';
import {
  LAUNCH_NOT_IMPLEMENTED,
  LmsError,
  type LaunchRequest,
} from '@richardmcquiston01/reactive-lms-shared';
import { createMemoryFileIndex } from '../../import/package-file-index';
import { readAiccFixture } from '../../testing/aicc-fixtures';
import { AiccRuntime } from './aicc-runtime';

const request: LaunchRequest = {
  registrationId: 'r',
  courseModuleId: 'm',
  learner: { externalId: 'u', displayName: 'U' },
  launchMode: 'Normal',
};

describe('AiccRuntime', () => {
  const runtime = new AiccRuntime();

  test('detects an AICC package and nothing else', async () => {
    expect(
      await runtime.detect(createMemoryFileIndex(readAiccFixture('single-au'))),
    ).toBe(true);
    expect(
      await runtime.detect(createMemoryFileIndex({ 'index.html': '<html/>' })),
    ).toBe(false);
    expect(await runtime.detect(createMemoryFileIndex({}))).toBe(false);
  });

  test('parses a package into the aicc type', async () => {
    const parsed = await runtime.parse(
      createMemoryFileIndex(readAiccFixture('blocks-and-params')),
    );
    expect(parsed.packageType).toBe('aicc');
  });

  describe('createLaunch', () => {
    const context = {
      attemptId: 'attempt-1',
      sessionId: 'session-1',
      extractedKey: 'packages/p1/content',
      entryHref: 'units/Lesson One.html',
      activityNodeId: 'node-1',
      getPublicUrl: async (key: string) => `/lms/content/${key}`,
    };
    const launch = (
      overrides: Partial<LaunchRequest> = {},
      ctx: typeof context | undefined = context,
    ) =>
      runtime.createLaunch(
        {
          ...request,
          callbackBaseUrl: 'https://lms.example.com/lms',
          ...overrides,
        },
        ctx,
      );

    test('opens the unit in a frame with the session id and the endpoint address', async () => {
      const descriptor = await launch();

      expect(descriptor).toMatchObject({
        attemptId: 'attempt-1',
        sessionId: 'session-1',
        packageType: 'aicc',
        playerKind: 'iframe',
      });
      const url = new URL(descriptor.contentUrl, 'https://lms.example.com');
      expect(url.pathname).toContain('units/Lesson');
      expect(url.searchParams.get('AICC_SID')).toBe('session-1');
      expect(url.searchParams.get('AICC_URL')).toBe(
        'https://lms.example.com/lms/aicc/hacp',
      );
      expect(descriptor.runtimeConfig).toMatchObject({
        launchMode: 'Normal',
        activityNodeId: 'node-1',
        aicc: {
          sessionId: 'session-1',
          url: 'https://lms.example.com/lms/aicc/hacp',
        },
      });
    });

    test('keeps a query the package gave, and puts the parameters before a fragment', async () => {
      const withQuery = await launch(
        {},
        {
          ...context,
          getPublicUrl: async () => '/c/unit.html?lang=en&x=1#top',
        },
      );
      expect(
        withQuery.contentUrl.startsWith('/c/unit.html?lang=en&x=1&AICC_SID='),
      ).toBe(true);
      expect(withQuery.contentUrl.endsWith('#top')).toBe(true);
      expect(withQuery.contentUrl.split('#').length).toBe(2);
    });

    test('a trailing slash on the base address is not doubled', async () => {
      const descriptor = await launch({
        callbackBaseUrl: 'https://lms.example.com/lms//',
      });
      expect(
        new URL(descriptor.contentUrl, 'https://x').searchParams.get(
          'AICC_URL',
        ),
      ).toBe('https://lms.example.com/lms/aicc/hacp');
    });

    test.each([undefined, '', '  '])(
      'refuses a launch with no callback address (%p), and says what to set',
      async (callbackBaseUrl) => {
        try {
          await launch({ callbackBaseUrl });
          throw new Error('expected createLaunch to throw');
        } catch (error) {
          expect(error).toBeInstanceOf(LmsError);
          expect((error as LmsError).code).toBe(LAUNCH_NOT_IMPLEMENTED);
          expect((error as LmsError).message).toContain('callbackBaseUrl');
        }
      },
    );

    test('refuses a launch with no location for the unit', async () => {
      await expect(
        launch({}, { ...context, extractedKey: '' }),
      ).rejects.toThrow('extracted content');
    });
  });
});
