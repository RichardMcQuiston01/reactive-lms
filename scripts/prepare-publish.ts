/**
 * Rewrites a workspace package's manifest for `npm pack` and `npm publish`,
 * and restores it afterwards.
 *
 * In the workspace, `exports` point at TypeScript source so Bun, `tsc` and
 * the Angular builds need no build step, and sibling packages are referenced
 * as `workspace:*`. Neither works for a consumer, so the packed manifest
 * points `exports` at the bundled `dist` files and pins sibling packages to
 * their current version.
 *
 * Usage (from a package directory): `bun ../../scripts/prepare-publish.ts
 * prepack|postpack`.
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

const MANIFEST_FILE = 'package.json';
const BACKUP_FILE = 'package.json.prepack-backup';
const DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/**
 * Maps a source export target to the file the build produces.
 *
 * @param sourcePath - A path such as `./src/testing/index.ts`
 * @param kind - `types` for the `.d.ts` file, `import` for the `.js` file
 * @returns The path under `./dist`, or `undefined` when it is not source
 */
export function distPathFor(
  sourcePath: string,
  kind: 'types' | 'import',
): string | undefined {
  const match = /^\.\/src\/(.+)\.ts$/.exec(sourcePath);
  if (match === null) {
    return undefined;
  }
  return `./dist/${match[1]}${kind === 'types' ? '.d.ts' : '.js'}`;
}

/**
 * Builds the `exports` map for the packed manifest from the workspace one.
 *
 * @param exportsField - The workspace `exports` value
 * @returns The same subpaths, pointing at `dist`
 * @throws Error when an entry does not point at `./src/*.ts`
 */
export function publishExports(exportsField: unknown): JsonObject {
  if (typeof exportsField !== 'object' || exportsField === null) {
    throw new Error('package.json has no "exports" map to rewrite for dist.');
  }
  const result: JsonObject = {};
  for (const [subpath, target] of Object.entries(exportsField)) {
    const source = (target as JsonObject)['import'];
    const types =
      typeof source === 'string' ? distPathFor(source, 'types') : undefined;
    const code =
      typeof source === 'string' ? distPathFor(source, 'import') : undefined;
    if (types === undefined || code === undefined) {
      throw new Error(
        `exports["${subpath}"].import is ${JSON.stringify(source)}; ` +
          'expected a "./src/<name>.ts" path.',
      );
    }
    result[subpath] = { types, import: code };
  }
  return result;
}

/**
 * Finds every workspace package's version, by name.
 *
 * @param packagesDirectory - The `packages` folder
 * @returns A map from package name to version
 */
function workspaceVersions(packagesDirectory: string): Map<string, string> {
  const versions = new Map<string, string>();
  for (const entry of readdirSync(packagesDirectory)) {
    const manifestPath = path.join(packagesDirectory, entry, MANIFEST_FILE);
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as JsonObject;
    if (
      typeof manifest['name'] === 'string' &&
      typeof manifest['version'] === 'string'
    ) {
      versions.set(manifest['name'], manifest['version']);
    }
  }
  return versions;
}

/**
 * Replaces `workspace:` ranges with `^<current version>`.
 *
 * @param manifest - The manifest to change in place
 * @param versions - Sibling versions from {@link workspaceVersions}
 * @throws Error when a `workspace:` dependency has no matching package
 */
export function pinWorkspaceDependencies(
  manifest: JsonObject,
  versions: Map<string, string>,
): void {
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field] as Record<string, string> | undefined;
    if (dependencies === undefined) {
      continue;
    }
    for (const [name, range] of Object.entries(dependencies)) {
      if (!range.startsWith('workspace:')) {
        continue;
      }
      const version = versions.get(name);
      if (version === undefined) {
        throw new Error(
          `${field}.${name} is "${range}" but no workspace package has that name.`,
        );
      }
      dependencies[name] = `^${version}`;
    }
  }
}

/** Backs up the manifest and rewrites it for packing. */
function prepack(packageDirectory: string): void {
  const manifestPath = path.join(packageDirectory, MANIFEST_FILE);
  const backupPath = path.join(packageDirectory, BACKUP_FILE);
  if (existsSync(backupPath)) {
    throw new Error(
      `${BACKUP_FILE} already exists in ${packageDirectory}: an earlier pack did not finish. ` +
        `Restore it with "mv ${BACKUP_FILE} ${MANIFEST_FILE}" and run again.`,
    );
  }
  const original = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(original) as JsonObject;
  manifest['exports'] = publishExports(manifest['exports']);
  pinWorkspaceDependencies(
    manifest,
    workspaceVersions(path.resolve(packageDirectory, '..')),
  );
  writeFileSync(backupPath, original);
  // npm only packs a LICENSE that sits in the package folder.
  copyFileSync(
    path.resolve(packageDirectory, '../../LICENSE'),
    path.join(packageDirectory, 'LICENSE'),
  );
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Puts the original manifest back. */
function postpack(packageDirectory: string): void {
  const backupPath = path.join(packageDirectory, BACKUP_FILE);
  if (!existsSync(backupPath)) {
    throw new Error(
      `No ${BACKUP_FILE} in ${packageDirectory}; nothing to restore.`,
    );
  }
  renameSync(backupPath, path.join(packageDirectory, MANIFEST_FILE));
  rmSync(path.join(packageDirectory, 'LICENSE'), { force: true });
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode === 'prepack') {
    prepack(process.cwd());
  } else if (mode === 'postpack') {
    postpack(process.cwd());
  } else {
    console.error('Usage: bun prepare-publish.ts prepack|postpack');
    process.exit(1);
  }
}
