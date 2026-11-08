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

  test('says launching is not implemented yet', async () => {
    try {
      await runtime.createLaunch(request);
      throw new Error('expected createLaunch to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect((error as LmsError).code).toBe(LAUNCH_NOT_IMPLEMENTED);
    }
  });
});
