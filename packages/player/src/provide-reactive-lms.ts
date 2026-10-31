import { InjectionToken, type Provider } from '@angular/core';

/**
 * Configuration for the Angular player HTTP client.
 */
export interface ReactiveLmsConfig {
  /**
   * API origin plus route prefix, e.g. `http://localhost:3000/lms`.
   */
  apiBaseUrl: string;
  /**
   * Returns a bearer token for the standalone or host API.
   * Standalone demo auth may return an empty string.
   */
  getAccessToken: () => string | null | Promise<string | null>;
}

/**
 * DI token holding {@link ReactiveLmsConfig}.
 */
export const REACTIVE_LMS_CONFIG = new InjectionToken<ReactiveLmsConfig>(
  'REACTIVE_LMS_CONFIG',
);

/**
 * Registers ReactiveLMS player configuration in an Angular app.
 *
 * @param config - API base URL and access-token getter
 * @returns Angular providers for `bootstrapApplication` / `importProvidersFrom`
 */
export function provideReactiveLms(config: ReactiveLmsConfig): Provider[] {
  return [{ provide: REACTIVE_LMS_CONFIG, useValue: config }];
}
