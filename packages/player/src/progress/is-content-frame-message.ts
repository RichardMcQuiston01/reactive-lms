/**
 * True when a `postMessage` came from the launched content iframe.
 *
 * @param event - Browser message event (source + origin)
 * @param frameWindow - `iframe.contentWindow` of the player frame
 * @param contentUrl - Launched `contentUrl`, when known
 * @param pageOrigin - Document origin used to resolve relative content URLs
 */
export function isContentFrameMessage(
  event: Pick<MessageEvent, 'source' | 'origin'>,
  frameWindow: Window | null | undefined,
  contentUrl?: string | null,
  pageOrigin?: string,
): boolean {
  if (!frameWindow || event.source !== frameWindow) {
    return false;
  }
  if (!contentUrl) {
    return true;
  }
  try {
    const base = pageOrigin ?? 'http://localhost/';
    const expected = new URL(contentUrl, base).origin;
    return event.origin === expected || event.origin === 'null';
  } catch {
    return true;
  }
}
