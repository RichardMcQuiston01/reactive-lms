import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

/** Names of the fixture packages under `packages/core/test-fixtures/scorm12`. */
export type Scorm12FixtureName =
  | 'simple-sco'
  | 'chapters-and-assets'
  | 'bookmark-resume'
  | 'xml-base'
  | 'launch-parameters'
  | 'quiz-interactions';

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test-fixtures/scorm12',
);

/**
 * Reads a fixture package from disk as a map of package path to bytes.
 *
 * @param name - Fixture folder name
 * @returns Every file in the package, keyed by `/`-separated relative path
 */
export function readScorm12Fixture(
  name: Scorm12FixtureName,
): Record<string, Uint8Array> {
  const root = path.join(FIXTURE_ROOT, name);
  const files: Record<string, Uint8Array> = {};
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const full = path.join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        const relative = path.relative(root, full).split(path.sep).join('/');
        files[relative] = new Uint8Array(readFileSync(full));
      }
    }
  };
  walk(root);
  return files;
}

/**
 * Zips a fixture package the way an authoring tool's export would.
 *
 * @param name - Fixture folder name
 * @param overrides - Files to replace, add, or (with `null`) drop
 */
export function zipScorm12Fixture(
  name: Scorm12FixtureName,
  overrides: Record<string, Uint8Array | string | null> = {},
): Uint8Array {
  const files: Record<string, Uint8Array> = readScorm12Fixture(name);
  for (const [filePath, body] of Object.entries(overrides)) {
    if (body === null) {
      delete files[filePath];
    } else {
      files[filePath] =
        typeof body === 'string' ? new TextEncoder().encode(body) : body;
    }
  }
  return zipSync(files);
}
