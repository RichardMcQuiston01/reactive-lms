import type { ReactiveLmsConfig } from '../provide-reactive-lms';

/**
 * JSON fetch against the ReactiveLMS REST API.
 *
 * @param config - Base URL and token getter
 * @param path - Path under `apiBaseUrl` (must start with `/`)
 * @param init - Optional `fetch` init (JSON body is stringified)
 */
export async function lmsFetch<T>(
  config: ReactiveLmsConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await config.getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const parsed = text.length > 0 ? parseJson(text) : undefined;
  if (!response.ok) {
    const message = errorMessage(parsed) ?? response.statusText;
    throw new Error(message);
  }
  return parsed as T;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}
