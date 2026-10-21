import { describe, expect, test } from 'bun:test';
import type { PackageFileIndex } from '@reactive-lms/shared';
import { LmsError, PACKAGE_NOT_DETECTED } from '@reactive-lms/shared';
import { detectPackageType } from './detect-package-type';

function memoryIndex(files: Record<string, string>): PackageFileIndex {
  const encoder = new TextEncoder();
  const entries = new Map(
    Object.entries(files).map(([path, body]) => [path, encoder.encode(body)]),
  );
  return {
    paths: [...entries.keys()],
    has(path: string): boolean {
      return entries.has(path);
    },
    read(path: string): Uint8Array | undefined {
      return entries.get(path);
    },
  };
}

const SCORM_12_MANIFEST = `<?xml version="1.0"?>
<manifest>
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
</manifest>
`;

const SCORM_2004_MANIFEST = `<?xml version="1.0"?>
<manifest>
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
</manifest>
`;

const SCORM_CAM_MANIFEST = `<?xml version="1.0"?>
<manifest>
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>CAM 1.3</schemaversion>
  </metadata>
</manifest>
`;

describe('detectPackageType', () => {
  test('detects html5 from only index.html', () => {
    const files = memoryIndex({ 'index.html': '<html></html>' });
    expect(detectPackageType(files)).toBe('html5');
  });

  test('detects scorm_12 from imsmanifest.xml with 1.2 schemaversion', () => {
    const files = memoryIndex({ 'imsmanifest.xml': SCORM_12_MANIFEST });
    expect(detectPackageType(files)).toBe('scorm_12');
  });

  test('detects cmi5 from cmi5.xml at the package root', () => {
    const files = memoryIndex({
      'cmi5.xml': '<courseStructure></courseStructure>',
    });
    expect(detectPackageType(files)).toBe('cmi5');
  });

  test('detects h5p from h5p.json at the package root', () => {
    const files = memoryIndex({ 'h5p.json': '{"title":"Quiz"}' });
    expect(detectPackageType(files)).toBe('h5p');
  });

  test('detects scorm_2004 when schemaversion contains 2004', () => {
    const files = memoryIndex({ 'imsmanifest.xml': SCORM_2004_MANIFEST });
    expect(detectPackageType(files)).toBe('scorm_2004');
  });

  test('detects scorm_2004 when schemaversion contains CAM 1.3', () => {
    const files = memoryIndex({ 'imsmanifest.xml': SCORM_CAM_MANIFEST });
    expect(detectPackageType(files)).toBe('scorm_2004');
  });

  test('defaults imsmanifest without schemaversion to scorm_12', () => {
    const files = memoryIndex({
      'imsmanifest.xml': '<manifest><organizations/></manifest>',
    });
    expect(detectPackageType(files)).toBe('scorm_12');
  });

  test('detects xapi from tincan.xml at the package root', () => {
    const files = memoryIndex({ 'tincan.xml': '<tincan></tincan>' });
    expect(detectPackageType(files)).toBe('xapi');
  });

  test('detects html5 from any .html when no higher-priority marker exists', () => {
    const files = memoryIndex({ 'lesson/start.html': '<html></html>' });
    expect(detectPackageType(files)).toBe('html5');
  });

  test('prefers cmi5 over imsmanifest, tincan, h5p, and html', () => {
    const files = memoryIndex({
      'cmi5.xml': '<courseStructure></courseStructure>',
      'imsmanifest.xml': SCORM_12_MANIFEST,
      'tincan.xml': '<tincan></tincan>',
      'h5p.json': '{}',
      'index.html': '<html></html>',
    });
    expect(detectPackageType(files)).toBe('cmi5');
  });

  test('prefers scorm over tincan, h5p, and html', () => {
    const files = memoryIndex({
      'imsmanifest.xml': SCORM_12_MANIFEST,
      'tincan.xml': '<tincan></tincan>',
      'h5p.json': '{}',
      'index.html': '<html></html>',
    });
    expect(detectPackageType(files)).toBe('scorm_12');
  });

  test('detects name-only markers without reading file bodies', () => {
    const reads: string[] = [];
    const files: PackageFileIndex = {
      paths: ['cmi5.xml', 'payload.bin'],
      has(path) {
        return path === 'cmi5.xml' || path === 'payload.bin';
      },
      read(path) {
        reads.push(path);
        throw new Error(`unexpected read of ${path}`);
      },
    };
    expect(detectPackageType(files)).toBe('cmi5');
    expect(reads).toEqual([]);
  });

  test('throws PACKAGE_NOT_DETECTED with status 400 when no marker matches', () => {
    const files = memoryIndex({ 'readme.txt': 'hello' });
    try {
      detectPackageType(files);
      throw new Error('expected detectPackageType to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LmsError);
      expect(error).toMatchObject({
        code: PACKAGE_NOT_DETECTED,
        status: 400,
      });
    }
  });
});
