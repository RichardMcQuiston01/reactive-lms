import { createHash, randomUUID } from 'node:crypto';
import {
  ActivityNode,
  ContentPackage,
} from '@reactive-lms/persistence';
import {
  LmsError,
  PACKAGE_TYPE_UNSUPPORTED,
  httpStatusForLmsCode,
  type ContentRuntime,
  type PackageType,
  type StorageAdapter,
} from '@reactive-lms/shared';
import type { DataSource } from 'typeorm';
import { detectPackageType } from './detect-package-type';
import { createZipFileIndex } from './package-file-index';

/**
 * Optional fields applied when persisting an imported package.
 */
export interface ImportPackageOptions {
  /** Host audit user stored on the content package. */
  createdByUserId?: string;
}

/**
 * Result of a successful {@link PackageImporter.import}.
 */
export interface ImportPackageResult {
  /** Persisted content package id. */
  packageId: string;
  /** Persisted root activity node id. */
  activityNodeId: string;
  /** Detected package format. */
  packageType: PackageType;
}

/**
 * Detects a ZIP package, stores it, and persists HTML5 package + activity tree.
 */
export class PackageImporter {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource (not a global)
   * @param storage - Blob store for the original ZIP and extracted files
   * @param runtimes - Registered content runtimes (HTML5 is required in 3a)
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageAdapter,
    private readonly runtimes: ContentRuntime[],
  ) {}

  /**
   * Imports a ZIP buffer: detect → parse HTML5 → store → persist.
   * Other detected types are rejected with `PACKAGE_TYPE_UNSUPPORTED`.
   *
   * @param buffer - Uploaded ZIP bytes
   * @param options - Optional audit fields
   */
  async import(
    buffer: Uint8Array,
    options?: ImportPackageOptions,
  ): Promise<ImportPackageResult> {
    const files = createZipFileIndex(buffer);
    const packageType = detectPackageType(files);
    if (packageType !== 'html5') {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_TYPE_UNSUPPORTED),
        code: PACKAGE_TYPE_UNSUPPORTED,
        message: `Package type ${packageType} cannot be imported in this version.`,
        details: { packageType },
      });
    }

    const runtime = this.runtimes.find(
      (entry) => entry.packageType === 'html5',
    );
    if (!runtime) {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_TYPE_UNSUPPORTED),
        code: PACKAGE_TYPE_UNSUPPORTED,
        message: 'No HTML5 runtime is registered for import.',
        details: { packageType },
      });
    }

    const parsed = await runtime.parse(files);
    const packageId = randomUUID();
    const activityNodeId = randomUUID();
    const packagePrefix = `packages/${packageId}`;
    const storageKey = `${packagePrefix}/original.zip`;
    const extractedKey = `${packagePrefix}/content`;
    const checksumSha256 = createHash('sha256')
      .update(buffer)
      .digest('hex');
    const rootActivity = parsed.activities[0];

    try {
      await this.dataSource.transaction(async (manager) => {
        await this.storage.put(storageKey, buffer);
        await this.storage.extractZip(storageKey, extractedKey);

        const contentPackage = manager.create(ContentPackage, {
          id: packageId,
          packageType: parsed.packageType,
          title: parsed.title,
          version: parsed.version ?? null,
          entryHref: parsed.entryHref,
          storageKey,
          extractedKey,
          manifestJson: {
            title: parsed.title,
            version: parsed.version,
            entryHref: parsed.entryHref,
            activities: parsed.activities,
          },
          checksumSha256,
          createdByUserId: options?.createdByUserId ?? null,
        });
        await manager.save(contentPackage);

        const activityNode = manager.create(ActivityNode, {
          id: activityNodeId,
          contentPackageId: packageId,
          title: rootActivity?.title ?? parsed.title,
          href: rootActivity?.href ?? parsed.entryHref,
          sortOrder: 0,
          metadataJson: rootActivity?.metadata ?? null,
        });
        await manager.save(activityNode);
      });
    } catch (error) {
      try {
        await this.storage.remove(packagePrefix);
      } catch {
        // Compensation must not hide the persist/store failure.
      }
      throw error;
    }

    return {
      packageId,
      activityNodeId,
      packageType: parsed.packageType,
    };
  }
}
