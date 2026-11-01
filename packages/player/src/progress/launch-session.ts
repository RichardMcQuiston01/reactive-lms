import type { NormalizedProgress } from '@richardmcquiston01/reactive-lms-shared';
import { mapHtml5Message, type Html5MessageContext } from './map-html5-message';

/**
 * Everything the player knows about one successful HTML5 launch. It is fixed
 * when the launch finishes, so later changes to the player's inputs cannot
 * change what an already-loaded frame reports as.
 */
export interface LaunchContext extends Html5MessageContext {
  /** Public URL the frame was loaded from. */
  contentUrl: string;
}

/**
 * Tracks which launch the player is showing and which one its messages may
 * speak for.
 *
 * When the player's inputs change, the old frame stays on screen until the new
 * launch finishes, and it can still post messages. Reading the ids from the
 * live inputs would label the old lesson's messages with the new lesson's
 * registration and module. Instead each launch gets a token, its ids are
 * captured when it was requested, and messages are accepted only while that
 * launch is the current one and has finished.
 */
export class LaunchSession {
  private generation = 0;
  private current: LaunchContext | null = null;

  /**
   * Starts a new launch. The previous one stops speaking at once, so its frame
   * is ignored until the new launch is ready.
   *
   * @returns A token to pass to {@link LaunchSession.ready}
   */
  begin(): number {
    this.generation += 1;
    this.current = null;
    return this.generation;
  }

  /**
   * Records that a launch finished.
   *
   * @param token - Value returned by the matching {@link LaunchSession.begin}
   * @param context - Ids and URL captured when the launch was requested
   * @returns `false` and records nothing if a newer launch has begun since
   */
  ready(token: number, context: LaunchContext): boolean {
    if (token !== this.generation) {
      return false;
    }
    this.current = context;
    return true;
  }

  /** URL of the current launch's frame, or `null` while none is ready. */
  get contentUrl(): string | null {
    return this.current?.contentUrl ?? null;
  }

  /**
   * Maps a message from the frame to a progress body using the current
   * launch's own ids.
   *
   * @param data - `MessageEvent.data`
   * @returns The body to send, or `null` when no launch is ready or the
   *   message is not a ReactiveLMS HTML5 event
   */
  progressFor(data: unknown): Partial<NormalizedProgress> | null {
    return this.current ? mapHtml5Message(data, this.current) : null;
  }
}
