import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

/**
 * Reads a fixture folder from disk as a map of package path to bytes.
 *
 * @param root - Absolute path of the fixture folder
 * @returns Every file in it, keyed by `/`-separated relative path
 */
export function readFixtureFolder(root: string): Record<string, Uint8Array> {
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
 * Zips fixture files the way an authoring tool's export would.
 *
 * @param files - Package files, keyed by relative path
 * @param overrides - Files to replace, add, or (with `null`) drop
 */
export function zipFixtureFiles(
  files: Record<string, Uint8Array>,
  overrides: Record<string, Uint8Array | string | null> = {},
): Uint8Array {
  const result: Record<string, Uint8Array> = { ...files };
  for (const [filePath, body] of Object.entries(overrides)) {
    if (body === null) {
      delete result[filePath];
    } else {
      result[filePath] =
        typeof body === 'string' ? new TextEncoder().encode(body) : body;
    }
  }
  return zipSync(result);
}
