import { createHash, randomUUID } from 'node:crypto';
import {
  ActivityNode,
  ContentPackage,
  EventLog,
} from '@reactive-lms/persistence';
import {
  LmsError,
  PACKAGE_TYPE_UNSUPPORTED,
  httpStatusForLmsCode,
  type ActivityNodeTree,
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

const IMPORTABLE = new Set<PackageType>(['html5', 'scorm_12']);

/**
 * Detects a ZIP package, stores it, and persists HTML5 / SCORM 1.2
 * packages plus their activity trees.
 */
export class PackageImporter {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource (not a global)
   * @param storage - Blob store for the original ZIP and extracted files
   * @param runtimes - Registered content runtimes (HTML5 + SCORM 1.2)
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageAdapter,
    private readonly runtimes: ContentRuntime[],
  ) {}

  /**
   * Imports a ZIP buffer: detect → parse → store → persist.
   * Unsupported detected types are rejected with `PACKAGE_TYPE_UNSUPPORTED`.
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
    if (!IMPORTABLE.has(packageType)) {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_TYPE_UNSUPPORTED),
        code: PACKAGE_TYPE_UNSUPPORTED,
        message: `Package type ${packageType} cannot be imported in this version.`,
        details: { packageType },
      });
    }

    const runtime = this.runtimes.find(
      (entry) => entry.packageType === packageType,
    );
    if (!runtime) {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_TYPE_UNSUPPORTED),
        code: PACKAGE_TYPE_UNSUPPORTED,
        message: `No ${packageType} runtime is registered for import.`,
        details: { packageType },
      });
    }

    const parsed = await runtime.parse(files);
    const packageId = randomUUID();
    const packagePrefix = `packages/${packageId}`;
    const storageKey = `${packagePrefix}/original.zip`;
    const extractedKey = `${packagePrefix}/content`;
    const checksumSha256 = createHash('sha256')
      .update(buffer)
      .digest('hex');
    const flattened = flattenActivities(parsed.activities, parsed.entryHref);
    const activityNodeId = flattened.defaultNodeId;

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

        for (const node of flattened.nodes) {
          const activityNode = manager.create(ActivityNode, {
            id: node.id,
            contentPackageId: packageId,
            parentId: node.parentId,
            publisherId: node.publisherId,
            title: node.title,
            href: node.href,
            sortOrder: node.sortOrder,
            metadataJson: node.metadata,
          });
          await manager.save(activityNode);
        }

        const imported = manager.create(EventLog, {
          personId: options?.createdByUserId ?? null,
          action: 'package.imported',
          subjectType: 'content_package',
          subjectId: packageId,
          payloadJson: {
            packageType: parsed.packageType,
            title: parsed.title,
            activityNodeId,
          },
        });
        await manager.save(imported);
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

interface FlattenedActivity {
  id: string;
  parentId: string | null;
  publisherId: string | null;
  title: string;
  href: string | null;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
}

function flattenActivities(
  activities: ActivityNodeTree[],
  entryHref: string,
): { nodes: FlattenedActivity[]; defaultNodeId: string } {
  const nodes: FlattenedActivity[] = [];
  let sortOrder = 0;

  const walk = (
    items: ActivityNodeTree[],
    parentId: string | null,
  ): void => {
    for (const item of items) {
      const id = randomUUID();
      nodes.push({
        id,
        parentId,
        publisherId: item.publisherId ?? null,
        title: item.title,
        href: item.href ?? null,
        sortOrder: sortOrder++,
        metadata: item.metadata ?? null,
      });
      if (item.children?.length) {
        walk(item.children, id);
      }
    }
  };

  walk(activities, null);

  const defaultNode =
    nodes.find((node) => node.href === entryHref) ??
    nodes.find((node) => node.href) ??
    nodes[0];

  return {
    nodes,
    defaultNodeId: defaultNode?.id ?? randomUUID(),
  };
}
