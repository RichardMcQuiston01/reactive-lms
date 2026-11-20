import type { Options } from 'tsup';

/**
 * Options shared by the published libraries.
 *
 * tsup bundles each library into one ES module plus type declarations. Its
 * esbuild core does not emit decorator metadata, which TypeORM and Nest read
 * at run time. When a package's tsconfig sets `emitDecoratorMetadata` and
 * `@swc/core` is installed, tsup compiles the TypeScript with SWC instead, so
 * `scripts/verify-packages.ts` checks that the metadata is really there.
 *
 * Dependencies listed in a package's `package.json` stay external.
 *
 * @param overrides - Per-package options, such as extra entry points
 * @returns The options to hand to `defineConfig`
 */
export function libraryOptions(overrides: Options = {}): Options {
  return {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    sourcemap: true,
    clean: true,
    dts: true,
    splitting: false,
    ...overrides,
  };
}
