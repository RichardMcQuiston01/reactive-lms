import type { PackageType } from '../enums/package-type';
import type { LearnerRef } from './learner-ref';

/**
 * Launch mode for an attempt (cmi5 / SCORM semantics).
 */
export type LaunchMode = 'Normal' | 'Browse' | 'Review';

/**
 * Player surface the Angular library should render for a launch.
 */
export type PlayerKind =
  'iframe' | 'scorm-frame' | 'h5p' | 'lti-redirect' | 'xapi-au';

/**
 * Request to create a launch attempt for a registered learner on a module.
 */
export interface LaunchRequest {
  /** Existing registration for the learner on the section. */
  registrationId: string;
  /** Course module to launch. */
  courseModuleId: string;
  /** Optional specific activity node (SCO/AU); omit for package entry. */
  activityNodeId?: string;
  /** Resolved learner identity for the runtime. */
  learner: LearnerRef;
  /** How the content should treat the attempt. */
  launchMode: LaunchMode;
}

/**
 * Descriptor returned to the player after a successful launch.
 * The player never talks to TypeORM; it only consumes this shape via REST.
 */
export interface LaunchDescriptor {
  /** Attempt id created for this launch. */
  attemptId: string;
  /** Session id (cmi5 session; also used by SCORM bridges). */
  sessionId: string;
  /** Package format of the launched content. */
  packageType: PackageType;
  /** Which player component to mount. */
  playerKind: PlayerKind;
  /** URL or path the player loads (iframe src, LTI redirect target, etc.). */
  contentUrl: string;
  /** Format-specific runtime config (API endpoints, tokens, CMI seeds, …). */
  runtimeConfig: Record<string, unknown>;
}
