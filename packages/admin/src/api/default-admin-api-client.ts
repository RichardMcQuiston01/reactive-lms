import {
  lmsFetch,
  type ReactiveLmsConfig,
} from '@richardmcquiston01/reactive-lms-player';
import type { AdminApiClient } from './admin-api-client';

/**
 * Creates the default client over the player's JSON fetch helper.
 *
 * @param config - API base URL and access-token getter
 */
export function createAdminApiClient(
  config: ReactiveLmsConfig,
): AdminApiClient {
  return {
    request: <T>(path: string, init?: RequestInit): Promise<T> =>
      lmsFetch<T>(config, path, init),
  };
}
