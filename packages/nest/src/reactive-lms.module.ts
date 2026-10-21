import { APP_FILTER, RouterModule } from '@nestjs/core';
import {
  Module,
  type DynamicModule,
  type InjectionToken,
  type OptionalFactoryDependency,
  type Provider,
  type Type,
} from '@nestjs/common';
import {
  EnrolmentService,
  FilesystemStorageAdapter,
  Html5Runtime,
  LaunchService,
  ModuleService,
  PackageImporter,
  ProgressSinkService,
  Scorm12Runtime,
  ScormCmiService,
} from '@reactive-lms/core';
import type {
  CapabilityAdapter,
  IdentityAdapter,
  StorageAdapter,
} from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { CatalogService } from './catalog/catalog.service';
import { CoursesController } from './controllers/courses.controller';
import { EnrolmentsController } from './controllers/enrolments.controller';
import { LaunchesController } from './controllers/launches.controller';
import { ModulesController } from './controllers/modules.controller';
import { PackagesController } from './controllers/packages.controller';
import { ProgressController } from './controllers/progress.controller';
import { ScormRuntimeController } from './controllers/scorm-runtime.controller';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { LmsExceptionFilter } from './filters/lms-exception.filter';
import { LmsRequestService } from './identity/lms-request.service';
import { PersonDirectory } from './identity/person-directory';
import {
  RLMS_CAPABILITY_ADAPTER,
  RLMS_DATA_SOURCE,
  RLMS_IDENTITY_ADAPTER,
  RLMS_MODULE_OPTIONS,
  RLMS_STORAGE_ADAPTER,
} from './tokens';

/**
 * Options for {@link ReactiveLmsModule.register} / `registerAsync`.
 */
export interface ReactiveLmsModuleOptions {
  /** Host identity bridge. */
  identityAdapter: IdentityAdapter;
  /** Optional host capability checks. */
  capabilityAdapter?: CapabilityAdapter;
  /** Blob store; created from `dataRoot` when omitted. */
  storageAdapter?: StorageAdapter;
  /** Filesystem dataroot used when `storageAdapter` is omitted. */
  dataRoot?: string;
  /** URL prefix for LMS routes. Default `lms`. */
  routePrefix?: string;
  /** Caller-owned TypeORM DataSource. */
  dataSource: DataSource;
}

/**
 * Async registration for {@link ReactiveLmsModule.registerAsync}.
 */
export interface ReactiveLmsModuleAsyncOptions {
  /** Nest modules to import (e.g. host AuthModule). */
  imports?: Array<Type<unknown> | DynamicModule>;
  /** Tokens injected into `useFactory`. */
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
  /** Builds module options from injected host services. */
  useFactory: (
    ...args: unknown[]
  ) => Promise<ReactiveLmsModuleOptions> | ReactiveLmsModuleOptions;
  /**
   * Route prefix used by `RouterModule`. Defaults to `lms`.
   * Read here (not only from `useFactory`) so routing is known at init.
   */
  routePrefix?: string;
}

const CONTROLLERS = [
  PackagesController,
  CoursesController,
  ModulesController,
  EnrolmentsController,
  LaunchesController,
  ProgressController,
  ScormRuntimeController,
];

/**
 * Embeddable Nest module: REST + OpenAPI over `@reactive-lms/core`.
 */
@Module({})
export class ReactiveLmsModule {
  /**
   * Registers LMS controllers under `routePrefix` (default `lms`).
   *
   * @param options - Adapters, DataSource, and optional dataroot
   */
  static register(options: ReactiveLmsModuleOptions): DynamicModule {
    return buildModule({
      prefix: options.routePrefix ?? 'lms',
      optionProvider: { provide: RLMS_MODULE_OPTIONS, useValue: options },
      imports: [],
    });
  }

  /**
   * Async variant that pulls adapters from the host DI container.
   *
   * @param options - `useFactory` / `inject` plus optional `routePrefix`
   */
  static registerAsync(options: ReactiveLmsModuleAsyncOptions): DynamicModule {
    return buildModule({
      prefix: options.routePrefix ?? 'lms',
      optionProvider: {
        provide: RLMS_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      imports: options.imports ?? [],
    });
  }
}

function buildModule(input: {
  prefix: string;
  optionProvider: Provider;
  imports: Array<Type<unknown> | DynamicModule>;
}): DynamicModule {
  const providers: Provider[] = [
    input.optionProvider,
    {
      provide: RLMS_DATA_SOURCE,
      useFactory: (opts: ReactiveLmsModuleOptions) => opts.dataSource,
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: RLMS_IDENTITY_ADAPTER,
      useFactory: (opts: ReactiveLmsModuleOptions) => opts.identityAdapter,
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: RLMS_CAPABILITY_ADAPTER,
      useFactory: (opts: ReactiveLmsModuleOptions) =>
        opts.capabilityAdapter ?? null,
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: RLMS_STORAGE_ADAPTER,
      useFactory: (opts: ReactiveLmsModuleOptions) => resolveStorage(opts),
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: PackageImporter,
      useFactory: (dataSource: DataSource, storage: StorageAdapter) =>
        new PackageImporter(dataSource, storage, [
          new Html5Runtime(),
          new Scorm12Runtime(),
        ]),
      inject: [RLMS_DATA_SOURCE, RLMS_STORAGE_ADAPTER],
    },
    {
      provide: ModuleService,
      useFactory: (dataSource: DataSource) => new ModuleService(dataSource),
      inject: [RLMS_DATA_SOURCE],
    },
    {
      provide: EnrolmentService,
      useFactory: (dataSource: DataSource) => new EnrolmentService(dataSource),
      inject: [RLMS_DATA_SOURCE],
    },
    {
      provide: LaunchService,
      useFactory: (dataSource: DataSource, storage: StorageAdapter) =>
        new LaunchService(dataSource, storage, [
          new Html5Runtime(),
          new Scorm12Runtime(),
        ]),
      inject: [RLMS_DATA_SOURCE, RLMS_STORAGE_ADAPTER],
    },
    {
      provide: ProgressSinkService,
      useFactory: (dataSource: DataSource) =>
        new ProgressSinkService(dataSource),
      inject: [RLMS_DATA_SOURCE],
    },
    {
      provide: ScormCmiService,
      useFactory: (dataSource: DataSource, sink: ProgressSinkService) =>
        new ScormCmiService(dataSource, sink),
      inject: [RLMS_DATA_SOURCE, ProgressSinkService],
    },
    PersonDirectory,
    LmsRequestService,
    CatalogService,
    { provide: APP_FILTER, useClass: LmsExceptionFilter },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ];

  return {
    module: ReactiveLmsModule,
    global: true,
    imports: [
      ...input.imports,
      RouterModule.register([
        { path: input.prefix, module: ReactiveLmsModule },
      ]),
    ],
    controllers: CONTROLLERS,
    providers,
    exports: [
      PackageImporter,
      ModuleService,
      EnrolmentService,
      LaunchService,
      ProgressSinkService,
      ScormCmiService,
      CatalogService,
      LmsRequestService,
      PersonDirectory,
      RLMS_DATA_SOURCE,
      RLMS_IDENTITY_ADAPTER,
      RLMS_CAPABILITY_ADAPTER,
      RLMS_STORAGE_ADAPTER,
    ],
  };
}

function resolveStorage(opts: ReactiveLmsModuleOptions): StorageAdapter {
  if (opts.storageAdapter) {
    return opts.storageAdapter;
  }
  if (opts.dataRoot) {
    return new FilesystemStorageAdapter(opts.dataRoot);
  }
  throw new Error('ReactiveLmsModule requires storageAdapter or dataRoot.');
}
