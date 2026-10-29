import type { PackageType } from '../enums/package-type';

/**
 * One node in a parsed activity tree (SCO, AU, H5P item, LTI resource link).
 * No persistence ids — importers assign those when writing entities.
 */
export interface ActivityNodeTree {
  /** Publisher identifier (SCORM item id, cmi5 publisherId, …). */
  publisherId?: string;
  /** Human-readable title. */
  title: string;
  /** Relative launch href when this node is launchable. */
  href?: string;
  /** Child activities in document order. */
  children?: ActivityNodeTree[];
  /** Format-specific metadata (moveOn, masteryScore, sequencing, …). */
  metadata?: Record<string, unknown>;
}

/**
 * Result of {@link ContentRuntime.parse} before persistence.
 * Describes title, version, entry href, and the activity-node tree only.
 */
export interface ParsedPackage {
  /** Package title from the manifest or fallback file name. */
  title: string;
  /** Package or content version when the format exposes one. */
  version?: string;
  /** Relative entry href used when launching the package root. */
  entryHref: string;
  /** Detected package format. */
  packageType: PackageType;
  /** Root-level activity nodes (may be a single HTML5 leaf). */
  activities: ActivityNodeTree[];
}
