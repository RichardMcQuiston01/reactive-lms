import type { AvailabilityV1 } from '../models/availability';

/** Deepest module nesting accepted; a top-level module has depth 1. */
export const MAX_MODULE_DEPTH = 5;

/**
 * API DTO for one row of a section's module tree (response shape).
 */
export interface CourseModuleDto {
  /** Module id. */
  id: string;
  /** Section that owns the module. */
  courseSectionId: string;
  /** Parent block id, or `null` for a top-level module. */
  parentModuleId: string | null;
  /** Content package launched by this module; `null` for a block. */
  contentPackageId: string | null;
  /** Display title. */
  title: string;
  /** Position among siblings (same section and parent), ascending. */
  sortOrder: number;
  /** True for a block (chapter) that only groups child modules. */
  isBlock: boolean;
  /** Availability rules as version 1, or `null` when the module is always open. */
  availability: AvailabilityV1 | null;
  /**
   * True when stored rules cannot be read. Launch then fails closed, so the
   * module is unavailable until someone saves valid rules.
   */
  availabilityInvalid: boolean;
}
