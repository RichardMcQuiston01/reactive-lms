import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFixtureFolder, zipFixtureFiles } from './fixture-files';

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
  return readFixtureFolder(path.join(FIXTURE_ROOT, name));
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
  return zipFixtureFiles(readScorm12Fixture(name), overrides);
}
