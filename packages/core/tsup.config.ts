import { defineConfig } from 'tsup';
import { libraryOptions } from '../../tsup.base';

export default defineConfig(
  libraryOptions({
    entry: {
      index: 'src/index.ts',
      'testing/index': 'src/testing/index.ts',
    },
    // The conformance suites run inside Bun's test runner.
    external: ['bun:test'],
  }),
);
