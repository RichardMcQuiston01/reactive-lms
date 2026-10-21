import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { createPersistenceDataSource } from '@reactive-lms/persistence';
import { ReactiveLmsModule } from '@reactive-lms/nest';
import { ContentMiddleware } from './content/content.middleware';
import { HealthController } from './health.controller';
import { DemoIdentityAdapter } from './identity/demo-identity.adapter';
import { resolveDatabaseUrl, resolveDataRoot } from './standalone-config';

/**
 * Standalone Nest app: demo identity, filesystem dataroot, `/health`.
 */
@Module({
  imports: [
    ReactiveLmsModule.registerAsync({
      routePrefix: 'lms',
      useFactory: async () => {
        const dataSource = createPersistenceDataSource({
          url: resolveDatabaseUrl(),
        });
        if (!dataSource.isInitialized) {
          await dataSource.initialize();
        }
        return {
          identityAdapter: new DemoIdentityAdapter(),
          dataSource,
          dataRoot: resolveDataRoot(),
          routePrefix: 'lms',
        };
      },
    }),
  ],
  controllers: [HealthController],
  providers: [ContentMiddleware],
})
export class AppModule implements NestModule {
  /**
   * Serves extracted HTML5 files for logged-in (demo) users.
   *
   * @param consumer - Nest middleware consumer
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ContentMiddleware)
      .forRoutes(
        { path: 'lms/content', method: RequestMethod.GET },
        { path: 'lms/content/*path', method: RequestMethod.GET },
      );
  }
}
