/**
 * In-memory index of files inside an uploaded package (ZIP / .h5p / loose tree).
 * Paths use forward slashes and are relative to the package root.
 */
export interface PackageFileIndex {
  /**
   * Relative paths present in the package (e.g. `imsmanifest.xml`, `index.html`).
   */
  readonly paths: readonly string[];

  /**
   * Returns file bytes for a relative path, or `undefined` if absent.
   * Implementations may load lazily; callers should treat missing paths as not present.
   */
  read(path: string): Uint8Array | undefined;

  /**
   * True when the path exists (may be cheaper than `read` for large files).
   */
  has(path: string): boolean;
}
