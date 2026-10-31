/** Public URL prefix under which extracted package files are served. */
export const DEFAULT_CONTENT_URL_PREFIX = '/lms/content';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
};

/**
 * Guesses a media type from a key's extension. Package files are served from
 * stores that may not record one, and S3-compatible stores need it on upload.
 *
 * @param key - Object key
 * @returns The media type, or `application/octet-stream` when unknown
 */
export function contentTypeForKey(key: string): string {
  const extension = key.toLowerCase().split('.').pop() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

/**
 * Builds the URL a player loads an extracted file from. Files are always
 * streamed through the API from our own origin, never from a store URL.
 *
 * @param key - Object key of the extracted file
 * @param prefix - URL prefix; defaults to {@link DEFAULT_CONTENT_URL_PREFIX}
 */
export function contentUrlForKey(
  key: string,
  prefix: string = DEFAULT_CONTENT_URL_PREFIX,
): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${prefix.replace(/\/+$/, '')}/${normalized}`;
}

/**
 * Outcome of {@link parseByteRange}.
 */
export type ByteRangeResult =
  | { kind: 'none' }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'unsatisfiable' };

/**
 * Parses a single-range HTTP `Range` header against an object size.
 * Multi-range requests are not supported and are served as the whole object.
 *
 * @param header - Raw `Range` header value, if any
 * @param size - Object size in bytes
 */
export function parseByteRange(
  header: string | undefined,
  size: number,
): ByteRangeResult {
  if (!header) {
    return { kind: 'none' };
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return { kind: 'none' };
  }
  const [, rawStart, rawEnd] = match;

  if (rawStart === '' && rawEnd === '') {
    return { kind: 'none' };
  }
  if (rawStart === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0 || size === 0) {
      return { kind: 'unsatisfiable' };
    }
    return { kind: 'range', start: Math.max(size - suffix, 0), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) {
    return { kind: 'unsatisfiable' };
  }
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) {
    return { kind: 'none' };
  }
  return { kind: 'range', start, end };
}
