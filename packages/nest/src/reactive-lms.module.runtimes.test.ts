import { describe, expect, test } from 'bun:test';
import { createContentRuntimes } from './reactive-lms.module';

describe('createContentRuntimes', () => {
  test('holds one runtime for each format the module can import', () => {
    const types = createContentRuntimes().map((runtime) => runtime.packageType);
    expect(types).toEqual(['html5', 'scorm_12', 'aicc']);
  });

  test('gives each caller its own instances', () => {
    expect(createContentRuntimes()[0]).not.toBe(createContentRuntimes()[0]);
  });
});
