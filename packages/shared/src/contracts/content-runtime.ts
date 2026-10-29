import type { PackageType } from '../enums/package-type';
import type { LaunchDescriptor, LaunchRequest } from '../models/launch';
import type { NormalizedProgress } from '../models/normalized-progress';
import type { PackageFileIndex } from '../models/package-file-index';
import type { ParsedPackage } from '../models/parsed-package';

/**
 * Format-specific runtime: detect, parse, and create launches for one PackageType.
 * Implementations live in `@richardmcquiston01/reactive-lms-core`; this contract is the only shared surface.
 */
export interface ContentRuntime {
  /** Package format this runtime handles. */
  readonly packageType: PackageType;

  /**
   * Returns true when the file index matches this format (deterministic detection).
   *
   * @param files - In-memory package file index
   */
  detect(files: PackageFileIndex): Promise<boolean>;

  /**
   * Parses package structure into a persistence-ready description (no I/O side effects).
   *
   * @param files - In-memory package file index
   */
  parse(files: PackageFileIndex): Promise<ParsedPackage>;

  /**
   * Creates a launch descriptor for an enrolled learner on a module.
   *
   * @param request - Launch request with registration, module, and learner
   */
  createLaunch(request: LaunchRequest): Promise<LaunchDescriptor>;
}

/**
 * Sink every runtime uses to write format-agnostic progress.
 * Implementations map into persistence and registration rollup.
 */
export interface ProgressSink {
  /**
   * Upserts normalized progress for a registration × module × activity node.
   *
   * @param progress - Format-agnostic progress payload
   */
  upsert(progress: NormalizedProgress): Promise<void>;
}
