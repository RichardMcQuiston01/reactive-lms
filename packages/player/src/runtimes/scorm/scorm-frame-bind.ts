import type { ScormCmiDto } from '@reactive-lms/shared';
import { ScormApiBridge, type ScormApiHost } from './scorm-api-bridge';

/**
 * Result of {@link bindScormFrame}.
 */
export interface ScormFrameBindResult {
  /** Bridge that owns `window.API`, when hydrate succeeded. */
  bridge?: ScormApiBridge;
  /** Iframe src to assign after the API is installed. */
  iframeSrc: string | null;
  /** Hydrate error to show instead of a blank frame. */
  error: string | null;
}

/**
 * Options for {@link bindScormFrame}.
 */
export interface ScormFrameBindOptions {
  /** Attempt whose CMI is hydrated. */
  attemptId: string;
  /** Extracted SCO URL. */
  contentUrl: string;
  /** Player window (or test double). */
  host: ScormApiHost;
  /** Previous bridge to uninstall / flush first. */
  previous?: ScormApiBridge;
  /**
   * When provided, `window.API` is assigned only if this returns true
   * after hydrate (stale attach generations return false).
   */
  shouldApply?: () => boolean;
  /** Hydrate hook. */
  getCmi: () => Promise<ScormCmiDto>;
  /** Commit hook. */
  putCmi: (body: ScormCmiDto) => Promise<void>;
}

/**
 * Uninstalls any previous bridge, hydrates CMI, and installs `window.API`.
 * On hydrate failure, returns an error and no iframe src.
 *
 * @param input - Attempt, content URL, host, and HTTP hooks
 */
export async function bindScormFrame(
  input: ScormFrameBindOptions,
): Promise<ScormFrameBindResult> {
  input.previous?.uninstall(input.host);
  if (!input.attemptId || !input.contentUrl) {
    return { iframeSrc: null, error: null };
  }
  const bridge = new ScormApiBridge({
    getCmi: input.getCmi,
    putCmi: input.putCmi,
  });
  try {
    await bridge.install(input.host, {
      shouldApply: input.shouldApply,
    });
    return { bridge, iframeSrc: input.contentUrl, error: null };
  } catch (error) {
    bridge.uninstall(input.host);
    return {
      iframeSrc: null,
      error: error instanceof Error ? error.message : 'CMI hydrate failed.',
    };
  }
}
