import { describe, expect, test } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import { detectPackageType } from './detect-package-type';
import { createZipFileIndex } from './package-file-index';

function watchReads(index: ReturnType<typeof createZipFileIndex>) {
  const reads: string[] = [];
  return {
    reads,
    files: {
      paths: index.paths,
      has: (path: string) => index.has(path),
      read(path: string) {
        reads.push(path);
        return index.read(path);
      },
    },
  };
}

describe('createZipFileIndex', () => {
  test('lists central-directory names without reading member bodies', () => {
    const buffer = zipSync({
      'index.html': strToU8('<html>ok</html>'),
      'assets/app.js': strToU8('console.log(1)'),
    });
    const index = createZipFileIndex(buffer);
    expect(index.has('index.html')).toBe(true);
    expect([...index.paths].sort()).toEqual([
      'assets/app.js',
      'index.html',
    ]);
  });

  test('detects html5 from ZIP names without inflating payloads', () => {
    const buffer = zipSync({
      'index.html': strToU8('<html>ok</html>'),
      'huge.bin': strToU8('x'.repeat(64 * 1024)),
    });
    const { files, reads } = watchReads(createZipFileIndex(buffer));
    expect(detectPackageType(files)).toBe('html5');
    expect(reads).toEqual([]);
  });

  test('detects scorm by inflating only imsmanifest.xml', () => {
    const buffer = zipSync({
      'imsmanifest.xml': strToU8(
        '<manifest><schemaversion>1.2</schemaversion></manifest>',
      ),
      'huge.bin': strToU8('x'.repeat(64 * 1024)),
    });
    const { files, reads } = watchReads(createZipFileIndex(buffer));
    expect(detectPackageType(files)).toBe('scorm_12');
    expect(reads).toEqual(['imsmanifest.xml']);
  });
});
