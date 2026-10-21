import { describe, expect, test } from 'bun:test';
import { checkPackageFile } from './package-upload';

describe('checkPackageFile', () => {
  test('accepts a non-empty zip regardless of case', () => {
    expect(checkPackageFile('course.zip', 10)).toBeNull();
    expect(checkPackageFile('COURSE.ZIP', 10)).toBeNull();
  });

  test('rejects an empty file, naming it', () => {
    expect(checkPackageFile('course.zip', 0)).toBe('"course.zip" is empty.');
  });

  test('rejects other file types, naming the file', () => {
    expect(checkPackageFile('course.rar', 10)).toContain('"course.rar"');
    expect(checkPackageFile('course.rar', 10)).toContain('.zip');
  });
});
