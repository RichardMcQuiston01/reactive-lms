import type { PackageType } from '../enums/package-type';

/**
 * API DTO for a successful package import (response shape of `POST packages`).
 */
export interface ImportPackageResultDto {
  /** Persisted content package id. */
  packageId: string;
  /** Same value as `packageId`, kept for clients that read `id`. */
  id: string;
  /** Persisted root activity node id. */
  activityNodeId: string;
  /** Detected package format. */
  packageType: PackageType;
}
