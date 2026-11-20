// Runs inside an empty project that installed the packed ReactiveLMS packages,
// under plain Node. It is plain JavaScript because it must not need Bun,
// TypeScript, or the workspace.
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

const PACKAGES = ['shared', 'persistence', 'core', 'nest'].map(
  (name) => `@richardmcquiston01/reactive-lms-${name}`,
);

const failures = [];

for (const name of PACKAGES) {
  const exported = Object.keys(await import(name));
  if (exported.length === 0) {
    failures.push(`${name} loaded but exports nothing.`);
  }
  console.log(`${name}: ${exported.length} exports`);
}

const columns = getMetadataArgsStorage().columns;
const withoutMetadata = columns.filter(
  (column) =>
    Reflect.getMetadata(
      'design:type',
      column.target.prototype,
      column.propertyName,
    ) === undefined,
);
if (columns.length === 0 || withoutMetadata.length > 0) {
  failures.push(
    `${withoutMetadata.length} of ${columns.length} entity columns have no ` +
      'design:type metadata; the build dropped emitDecoratorMetadata.',
  );
}
console.log(
  `entity columns with decorator metadata: ${columns.length - withoutMetadata.length}/${columns.length}`,
);

const databaseUrl = process.env.RLMS_TEST_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  console.log(
    'RLMS_TEST_DATABASE_URL is not set: skipping the Nest boot check.',
  );
} else {
  const { createPersistenceDataSource } = await import(PACKAGES[1]);
  const { ReactiveLmsModule } = await import(PACKAGES[3]);

  class AppModule {}
  Module({
    imports: [
      ReactiveLmsModule.registerAsync({
        routePrefix: 'lms',
        useFactory: async () => {
          const dataSource = createPersistenceDataSource({
            url: databaseUrl,
            migrationsRun: true,
          });
          await dataSource.initialize();
          return {
            identityAdapter: {
              resolveLearner: async () => ({
                externalId: 'package-smoke',
                displayName: 'Package Smoke',
                email: 'smoke@localhost',
              }),
            },
            allowUnrestrictedAdmin: true,
            dataSource,
            dataRoot: mkdtempSync(path.join(os.tmpdir(), 'rlms-smoke-')),
            routePrefix: 'lms',
          };
        },
      }),
    ],
  })(AppModule);

  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await app.listen(0);
  const { port } = app.getHttpServer().address();
  const response = await fetch(`http://localhost:${port}/lms/packages`);
  console.log(`GET /lms/packages -> ${response.status}`);
  if (response.status !== 200) {
    failures.push(
      `GET /lms/packages returned ${response.status}: ${await response.text()}`,
    );
  }
  await app.close();
}

if (failures.length > 0) {
  console.error(`\nPackage smoke test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Package smoke test passed.');
