import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Packages that `@richardmcquiston01/reactive-lms-shared` must never import. */
const SHARED_FORBIDDEN_IMPORTS = [
  '@nestjs/*',
  '@angular/*',
  'typeorm',
  'ioredis',
  'redis',
  'tailwindcss',
  'pg',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/player/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // The shared package is consumed by both frontend and backend, so it must
    // not depend on any framework, ORM, cache client, or CSS tooling.
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SHARED_FORBIDDEN_IMPORTS,
              message:
                'The shared package must stay free of Nest, Angular, TypeORM, Redis, and Tailwind imports.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
