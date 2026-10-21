import { describe, expect, test } from 'bun:test';
import { wrapAdminApiClient, type AdminApiClient } from './admin-api-client';

describe('wrapAdminApiClient', () => {
  test('routes each request through the wrapper', async () => {
    const seen: string[] = [];
    const inner: AdminApiClient = {
      request: async <T>(path: string): Promise<T> => path as unknown as T,
    };
    const client = wrapAdminApiClient(inner, async (path, _init, next) => {
      seen.push(path);
      return next();
    });

    const result = await client.request<string>('/modules');

    expect(result).toBe('/modules');
    expect(seen).toEqual(['/modules']);
  });
});
