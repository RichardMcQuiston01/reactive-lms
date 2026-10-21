import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { DataSource } from 'typeorm';
import { RLMS_DATA_SOURCE } from '@richardmcquiston01/reactive-lms-nest';
import { AppModule } from './app.module';

/**
 * Boots the standalone Nest API with `ReactiveLmsModule`.
 * Identity is the fixed demo learner until auth is added.
 */
export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const dataSource = app.get<DataSource>(RLMS_DATA_SOURCE);
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const swagger = new DocumentBuilder()
    .setTitle('ReactiveLMS Standalone API')
    .setDescription(
      'HTML5 import, launch, and progress. Authenticated as the demo learner.',
    )
    .setVersion('0.0.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
}

if (import.meta.main) {
  void bootstrap();
}
