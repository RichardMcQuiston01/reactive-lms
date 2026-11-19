/**
 * Packs the publishable libraries, installs the tarballs into an empty
 * project, and loads them under plain Node.
 *
 * This is the check that the published packages work for a consumer: it
 * catches `exports` that point at missing files, imports Node cannot resolve,
 * and a build that drops decorator metadata. Set `RLMS_TEST_DATABASE_URL` to
 * also boot the Nest module against Postgres.
 *
 * Usage: `bun run verify:packages`
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');
const LIBRARIES = ['shared', 'persistence', 'core', 'nest'] as const;
/** The Postgres driver is an optional peer of persistence; a host installs it. */
const HOST_DEPENDENCIES = ['pg'];

/**
 * Runs a command and fails with its output when it exits non-zero.
 *
 * @param command - Program to run
 * @param args - Its arguments
 * @param cwd - Working directory
 * @returns Standard output of the command
 * @throws Error naming the command and its output on failure
 */
function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `"${command} ${args.join(' ')}" failed in ${cwd} with exit code ${result.status}:\n` +
        `${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

/** Packs, installs, and loads the libraries. */
function main(): void {
  const workDirectory = mkdtempSync(path.join(os.tmpdir(), 'rlms-verify-'));
  try {
    const packDirectory = path.join(workDirectory, 'pack');
    const consumerDirectory = path.join(workDirectory, 'consumer');
    mkdirSync(packDirectory);
    mkdirSync(consumerDirectory);

    for (const name of LIBRARIES) {
      const packageDirectory = path.join(REPOSITORY_ROOT, 'packages', name);
      console.log(`Packing ${name}...`);
      run(
        'npm',
        ['pack', '--pack-destination', packDirectory],
        packageDirectory,
      );
      if (
        existsSync(path.join(packageDirectory, 'package.json.prepack-backup'))
      ) {
        throw new Error(
          `packages/${name} still has package.json.prepack-backup: its manifest was not restored after packing.`,
        );
      }
    }

    const tarballs = readdirSync(packDirectory).map((file) =>
      path.join(packDirectory, file),
    );
    writeFileSync(
      path.join(consumerDirectory, 'package.json'),
      JSON.stringify({
        name: 'rlms-package-consumer',
        private: true,
        type: 'module',
      }),
    );
    console.log('Installing the tarballs into an empty project...');
    run(
      'npm',
      ['install', '--no-audit', '--no-fund', ...tarballs, ...HOST_DEPENDENCIES],
      consumerDirectory,
    );

    copyFileSync(
      path.join(REPOSITORY_ROOT, 'scripts/fixtures/consumer-smoke.mjs'),
      path.join(consumerDirectory, 'smoke.mjs'),
    );
    console.log('Loading the packages under Node...');
    console.log(run('node', ['smoke.mjs'], consumerDirectory));
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
