import type { NormalizedProgress } from '@richardmcquiston01/reactive-lms-shared';

/**
 * HTML5 content → player postMessage envelope.
 */
export interface Html5PlayerMessage {
  /** Must be `reactive-lms` for the player to accept the message. */
  source: 'reactive-lms';
  /** Progress update or a shorthand completion event. */
  type: 'progress' | 'complete';
  /** Partial progress fields for `type: 'progress'`. */
  payload?: Partial<NormalizedProgress>;
}

/**
 * Registration / module context the player already knows.
 */
export interface Html5MessageContext {
  /** Active registration. */
  registrationId: string;
  /** Launched course module. */
  courseModuleId: string;
  /** Default activity node from launch, when known. */
  activityNodeId?: string;
}

/**
 * Maps a `window.postMessage` data value to a progress POST body.
 * Returns `null` when the message is not a ReactiveLMS HTML5 event.
 *
 * @param data - `MessageEvent.data`
 * @param context - Registration and module ids from the player
 */
export function mapHtml5Message(
  data: unknown,
  context: Html5MessageContext,
): Partial<NormalizedProgress> | null {
  if (!isHtml5PlayerMessage(data)) {
    return null;
  }

  if (data.type === 'complete') {
    return {
      registrationId: context.registrationId,
      courseModuleId: context.courseModuleId,
      activityNodeId: data.payload?.activityNodeId ?? context.activityNodeId,
      completionStatus: 'completed',
      successStatus: data.payload?.successStatus ?? 'unknown',
    };
  }

  return {
    ...data.payload,
    registrationId: context.registrationId,
    courseModuleId: context.courseModuleId,
    activityNodeId: data.payload?.activityNodeId ?? context.activityNodeId,
  };
}

function isHtml5PlayerMessage(data: unknown): data is Html5PlayerMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  return (
    record.source === 'reactive-lms' &&
    (record.type === 'progress' || record.type === 'complete')
  );
}
