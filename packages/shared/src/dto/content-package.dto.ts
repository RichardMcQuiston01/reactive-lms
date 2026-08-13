import type { PackageType } from '../enums/package-type';

/**
 * API DTO for an imported content package (response shape).
 * No Nest/class-validator decorators — plain shared contract for REST and player.
 */
export interface ContentPackageDto {
  /** Package id. */
  id: string;
  /** Detected package format. */
  packageType: PackageType;
  /** Package title. */
  title: string;
  /** Version when known. */
  version?: string;
  /** Relative entry href or remote LTI URL. */
  entryHref?: string;
  /** Storage key of the original archive or asset. */
  storageKey: string;
  /** Storage key prefix of the extracted static root, when extracted. */
  extractedKey?: string;
  /** SHA-256 of the original upload when recorded. */
  checksumSha256?: string;
  /** ISO-8601 created timestamp. */
  createdAt: string;
  /** ISO-8601 updated timestamp. */
  updatedAt: string;
}
