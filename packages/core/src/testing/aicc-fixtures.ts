import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFixtureFolder, zipFixtureFiles } from './fixture-files';

/** Names of the fixture packages under `packages/core/test-fixtures/aicc`. */
export type AiccFixtureName = 'single-au' | 'blocks-and-params';

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test-fixtures/aicc',
);

/**
 * Reads a fixture package from disk as a map of package path to bytes.
 *
 * @param name - Fixture folder name
 * @returns Every file in the package, keyed by `/`-separated relative path
 */
export function readAiccFixture(
  name: AiccFixtureName,
): Record<string, Uint8Array> {
  return readFixtureFolder(path.join(FIXTURE_ROOT, name));
}

/**
 * Zips a fixture package the way an authoring tool's export would.
 *
 * @param name - Fixture folder name
 * @param overrides - Files to replace, add, or (with `null`) drop
 */
export function zipAiccFixture(
  name: AiccFixtureName,
  overrides: Record<string, Uint8Array | string | null> = {},
): Uint8Array {
  return zipFixtureFiles(readAiccFixture(name), overrides);
}
