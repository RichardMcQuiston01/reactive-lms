import type { PackageType } from '../enums/package-type';
import type { LaunchMode, PlayerKind } from '../models/launch';

/**
 * Request body for `POST /registrations/:id/launches`.
 */
export interface CreateLaunchDto {
  /** Course module to launch. */
  courseModuleId: string;
  /** Optional specific activity node (SCO/AU). */
  activityNodeId?: string;
  /** Launch mode; defaults to Normal when omitted by the server. */
  launchMode?: LaunchMode;
}

/**
 * Response body after a successful launch (mirrors {@link LaunchDescriptor}).
 */
export interface LaunchDto {
  /** Attempt id created for this launch. */
  attemptId: string;
  /** Session id for runtime bridges. */
  sessionId: string;
  /** Package format of the launched content. */
  packageType: PackageType;
  /** Player surface to render. */
  playerKind: PlayerKind;
  /** Content URL the player loads. */
  contentUrl: string;
  /** Format-specific runtime configuration. */
  runtimeConfig: Record<string, unknown>;
}
