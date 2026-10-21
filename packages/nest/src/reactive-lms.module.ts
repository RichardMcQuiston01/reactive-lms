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
  consoleErrorSink,
  EnrolmentService,
  FilesystemBlobStorageAdapter,
  Html5Runtime,
  LaunchService,
  MemoryCacheAdapter,
  ModuleService,
  PackageImporter,
  ProgressSinkService,
  Scorm12Runtime,
  ScormCmiService,
} from '@richardmcquiston01/reactive-lms-core';
import type {
  BlobStorageAdapter,
  CacheAdapter,
  CapabilityAdapter,
  ErrorSink,
  IdentityAdapter,
} from '@richardmcquiston01/reactive-lms-shared';
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
  RLMS_BLOB_STORAGE_ADAPTER,
  RLMS_CACHE_ADAPTER,
  RLMS_ERROR_SINK,
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
  blobStorage?: BlobStorageAdapter;
  /**
   * Cache for one-time tokens and nonces. Defaults to an in-memory cache,
   * which is only safe with a single API process; inject a shared adapter
   * (e.g. Redis) when running several.
   */
  cache?: CacheAdapter;
  /**
   * Receives unexpected (5xx) errors. Defaults to one JSON line per error on
   * `console.error`. `ErrorLogAdapter.log` from `error-log-adapter` fits.
   */
  errorSink?: ErrorSink;
  /** Filesystem dataroot used when `blobStorage` is omitted. */
  dataRoot?: string;
  /** Called with each uploaded archive before it is stored; throw to reject. */
  antivirusScan?: (archive: Uint8Array) => Promise<void>;
  /** Maximum total uncompressed size of an uploaded archive. Default 200 MiB. */
  maxUncompressedBytes?: number;
  /** Maximum number of files in an uploaded archive. Default 10,000. */
  maxFileCount?: number;
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
 * Embeddable Nest module: REST + OpenAPI over `@richardmcquiston01/reactive-lms-core`.
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
      provide: RLMS_BLOB_STORAGE_ADAPTER,
      useFactory: (opts: ReactiveLmsModuleOptions) => resolveStorage(opts),
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: RLMS_CACHE_ADAPTER,
      useFactory: (opts: ReactiveLmsModuleOptions): CacheAdapter =>
        opts.cache ?? new MemoryCacheAdapter(),
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: RLMS_ERROR_SINK,
      useFactory: (opts: ReactiveLmsModuleOptions): ErrorSink =>
        opts.errorSink ?? consoleErrorSink,
      inject: [RLMS_MODULE_OPTIONS],
    },
    {
      provide: PackageImporter,
      useFactory: (
        dataSource: DataSource,
        storage: BlobStorageAdapter,
        opts: ReactiveLmsModuleOptions,
      ) =>
        new PackageImporter(
          dataSource,
          storage,
          [new Html5Runtime(), new Scorm12Runtime()],
          {
            antivirusScan: opts.antivirusScan,
            maxUncompressedBytes: opts.maxUncompressedBytes,
            maxFileCount: opts.maxFileCount,
          },
        ),
      inject: [
        RLMS_DATA_SOURCE,
        RLMS_BLOB_STORAGE_ADAPTER,
        RLMS_MODULE_OPTIONS,
      ],
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
      useFactory: (dataSource: DataSource) =>
        new LaunchService(dataSource, [
          new Html5Runtime(),
          new Scorm12Runtime(),
        ]),
      inject: [RLMS_DATA_SOURCE],
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
      RLMS_BLOB_STORAGE_ADAPTER,
      RLMS_CACHE_ADAPTER,
      RLMS_ERROR_SINK,
    ],
  };
}

function resolveStorage(opts: ReactiveLmsModuleOptions): BlobStorageAdapter {
  if (opts.blobStorage) {
    return opts.blobStorage;
  }
  if (opts.dataRoot) {
    return new FilesystemBlobStorageAdapter(opts.dataRoot);
  }
  throw new Error('ReactiveLmsModule requires blobStorage or dataRoot.');
}
