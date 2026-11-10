/** Parts of an Express request that the callback address is built from. */
interface RequestParts {
  protocol?: unknown;
  originalUrl?: unknown;
  get?: unknown;
}

const HOST_PATTERN = /^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;
const ROUTE_MARKER = '/registrations/';

/**
 * Works out the address of this LMS's API root that launched content can call
 * back, from the launch request itself. The root is everything in the request
 * path before `/registrations/`, so it holds whatever route prefix the host
 * uses. The scheme and host come from `publicBaseUrl` when the host sets one
 * (needed behind a proxy that rewrites them), and otherwise from the request.
 *
 * @param req - The host request (an Express request)
 * @param publicBaseUrl - Scheme, host, and port clients use, without a path
 * @returns The API root, or `undefined` when it cannot be worked out
 */
export function callbackBaseUrl(
  req: unknown,
  publicBaseUrl?: string,
): string | undefined {
  const parts = (req ?? {}) as RequestParts;
  const url = typeof parts.originalUrl === 'string' ? parts.originalUrl : '';
  const path = url.split('?', 1)[0] ?? '';
  const marker = path.indexOf(ROUTE_MARKER);
  if (marker === -1) {
    return undefined;
  }
  const apiPath = path.slice(0, marker);

  const configured = publicBaseUrl?.trim().replace(/\/+$/, '') ?? '';
  if (configured !== '') {
    return `${configured}${apiPath}`;
  }
  const protocol = typeof parts.protocol === 'string' ? parts.protocol : '';
  const host =
    typeof parts.get === 'function'
      ? (parts.get as (name: string) => unknown).call(req, 'host')
      : undefined;
  if (
    (protocol !== 'http' && protocol !== 'https') ||
    typeof host !== 'string' ||
    !HOST_PATTERN.test(host)
  ) {
    return undefined;
  }
  return `${protocol}://${host}${apiPath}`;
}
