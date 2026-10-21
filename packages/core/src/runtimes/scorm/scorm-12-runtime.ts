import {
  LmsError,
  LAUNCH_NOT_IMPLEMENTED,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
  type ContentRuntime,
  type LaunchDescriptor,
  type LaunchRequest,
  type PackageFileIndex,
  type ParsedPackage,
} from '@reactive-lms/shared';
import { detectPackageType } from '../../import/detect-package-type';
import { joinStorageKey } from '../html5/html5-runtime';
import { parseImsmanifest } from './parse-imsmanifest';

/**
 * Extra fields {@link Scorm12Runtime.createLaunch} needs after the
 * attempt row exists. `LaunchRequest` stays the shared contract.
 */
export interface Scorm12LaunchContext {
  /** Attempt created by LaunchService. */
  attemptId: string;
  /** Unique session id stored on the attempt. */
  sessionId: string;
  /** Storage prefix of the extracted package. */
  extractedKey: string;
  /** Relative SCO href (package entry or chosen activity node). */
  entryHref: string;
  /** Activity node launched with this attempt, when known. */
  activityNodeId?: string;
  /** Resolves a storage key to a player-loadable URL. */
  getPublicUrl: (key: string) => Promise<string>;
}

/**
 * SCORM 1.2 runtime: parse `imsmanifest.xml`, launch one SCO in a
 * `scorm-frame` whose parent installs `window.API`.
 */
export class Scorm12Runtime implements ContentRuntime {
  /** @inheritdoc */
  readonly packageType = 'scorm_12' as const;

  /**
   * True when the index is a SCORM 1.2 `imsmanifest.xml` package.
   *
   * @param files - Package file index
   */
  async detect(files: PackageFileIndex): Promise<boolean> {
    try {
      return detectPackageType(files) === 'scorm_12';
    } catch (error) {
      if (error instanceof LmsError && error.code === PACKAGE_NOT_DETECTED) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Parses the activity tree from `imsmanifest.xml`.
   *
   * @param files - Package file index
   */
  async parse(files: PackageFileIndex): Promise<ParsedPackage> {
    const parsed = parseImsmanifest(files);
    return { ...parsed, packageType: 'scorm_12' };
  }

  /**
   * Builds a `scorm-frame` launch descriptor for the extracted SCO.
   *
   * @param request - Registration, module, learner, and launch mode
   * @param context - Attempt ids plus extracted entry location
   */
  async createLaunch(
    request: LaunchRequest,
    context?: Scorm12LaunchContext,
  ): Promise<LaunchDescriptor> {
    if (!context?.extractedKey || !context.entryHref) {
      throw new LmsError({
        status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
        code: LAUNCH_NOT_IMPLEMENTED,
        message:
          'SCORM 1.2 launch requires extracted content location and a public URL.',
      });
    }

    const storageKey = joinStorageKey(context.extractedKey, context.entryHref);
    const contentUrl = await context.getPublicUrl(storageKey);
    return {
      attemptId: context.attemptId,
      sessionId: context.sessionId,
      packageType: 'scorm_12',
      playerKind: 'scorm-frame',
      contentUrl,
      runtimeConfig: {
        launchMode: request.launchMode,
        learner: request.learner,
        ...(context.activityNodeId
          ? { activityNodeId: context.activityNodeId }
          : {}),
      },
    };
  }
}
