/**
 * Blob storage for original packages and extracted static content.
 * Hosts may implement filesystem, S3, or other backends.
 */
export interface StorageAdapter {
  /**
   * Stores bytes under the given key.
   *
   * @param key - Storage key
   * @param body - File contents
   */
  put(key: string, body: Uint8Array): Promise<void>;

  /**
   * Reads bytes previously stored under the key.
   *
   * @param key - Storage key
   */
  get(key: string): Promise<Uint8Array>;

  /**
   * Returns a URL suitable for the player or CDN to fetch the object.
   *
   * @param key - Storage key
   */
  getPublicUrl(key: string): Promise<string>;

  /**
   * Extracts a ZIP (or .h5p) stored at `key` under `destPrefix`.
   *
   * @param key - Key of the archive
   * @param destPrefix - Destination key prefix for extracted files
   * @returns Relative paths of extracted files under the destination
   */
  extractZip(key: string, destPrefix: string): Promise<string[]>;

  /**
   * Deletes a stored object or every object under a key prefix.
   * Missing keys are a no-op.
   *
   * @param key - Storage key or directory prefix
   */
  remove(key: string): Promise<void>;
}
