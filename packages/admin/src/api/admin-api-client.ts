/**
 * HTTP client the admin screens use to talk to the ReactiveLMS REST API.
 *
 * Hosts replace or wrap it (see {@link wrapAdminApiClient}) to add headers,
 * tracing, or error reporting without forking a screen.
 */
export interface AdminApiClient {
  /**
   * Sends a JSON request under the configured API base URL.
   *
   * @param path - Path under the API base URL (must start with `/`)
   * @param init - Optional `fetch` init; a JSON body is sent as given
   * @returns The parsed JSON response, or `undefined` for 204
   */
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

/**
 * Wraps a client so every request passes through `around`.
 *
 * @param inner - Client to delegate to
 * @param around - Receives the request and a `next` that calls `inner`
 */
export function wrapAdminApiClient(
  inner: AdminApiClient,
  around: <T>(
    path: string,
    init: RequestInit | undefined,
    next: () => Promise<T>,
  ) => Promise<T>,
): AdminApiClient {
  return {
    request: <T>(path: string, init?: RequestInit): Promise<T> =>
      around<T>(path, init, () => inner.request<T>(path, init)),
  };
}
