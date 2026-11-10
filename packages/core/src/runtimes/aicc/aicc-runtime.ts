import {
  LAUNCH_NOT_IMPLEMENTED,
  LmsError,
  httpStatusForLmsCode,
  type ContentRuntime,
  type LaunchDescriptor,
  type LaunchRequest,
  type PackageFileIndex,
  type ParsedPackage,
} from '@richardmcquiston01/reactive-lms-shared';
import { detectPackageType } from '../../import/detect-package-type';
import { joinStorageKey } from '../html5/html5-runtime';
import { parseAicc } from './parse-aicc';

/** Path of the HACP endpoint, under the LMS API root. */
export const HACP_PATH = '/aicc/hacp';

/**
 * Extra fields {@link AiccRuntime.createLaunch} needs after the attempt row
 * exists. `LaunchRequest` stays the shared contract.
 */
export interface AiccLaunchContext {
  /** Attempt created by LaunchService. */
  attemptId: string;
  /** Session id stored on the attempt; the content's `AICC_SID`. */
  sessionId: string;
  /** Storage prefix of the extracted package. */
  extractedKey: string;
  /** Relative launch file of the unit, with any query the package gave. */
  entryHref: string;
  /** Activity node launched with this attempt, when known. */
  activityNodeId?: string;
  /** Resolves a storage key to a player-loadable URL. */
  getPublicUrl: (key: string) => Promise<string>;
}

/**
 * AICC (level 1) runtime. Import detects the course description files and
 * reads them into an activity tree. A launch opens the unit's file with
 * `AICC_SID` and `AICC_URL`, and the content then calls the HACP endpoint
 * (see {@link AiccHacpService}) at that address.
 */
export class AiccRuntime implements ContentRuntime {
  /** @inheritdoc */
  readonly packageType = 'aicc' as const;

  /**
   * True when the package root holds the AICC course description files.
   *
   * @param files - Package file index
   */
  async detect(files: PackageFileIndex): Promise<boolean> {
    try {
      return detectPackageType(files) === 'aicc';
    } catch {
      return false;
    }
  }

  /**
   * Reads the course, its assignable units, and their structure.
   *
   * @param files - Package file index
   */
  async parse(files: PackageFileIndex): Promise<ParsedPackage> {
    return parseAicc(files);
  }

  /**
   * Builds the launch for one unit: its file, with the session id and the
   * address of the HACP endpoint as query parameters. The player shows it in a
   * frame, like any web content.
   *
   * @param request - Registration, module, learner, and launch mode
   * @param context - Attempt ids plus the unit's location
   * @throws {LmsError} `LAUNCH_NOT_IMPLEMENTED` when the LMS address or the
   *   launch location is missing
   */
  async createLaunch(
    request: LaunchRequest,
    context?: AiccLaunchContext,
  ): Promise<LaunchDescriptor> {
    if (!context?.extractedKey || !context.entryHref) {
      throw new LmsError({
        status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
        code: LAUNCH_NOT_IMPLEMENTED,
        message:
          'An AICC launch needs the extracted content location and a public URL.',
      });
    }
    const base = request.callbackBaseUrl?.trim().replace(/\/+$/, '') ?? '';
    if (base === '') {
      throw new LmsError({
        status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
        code: LAUNCH_NOT_IMPLEMENTED,
        message:
          'An AICC launch needs callbackBaseUrl: the address of this LMS that the content calls back, such as https://lms.example.com/lms.',
      });
    }
    const hacpUrl = `${base}${HACP_PATH}`;
    const storageKey = joinStorageKey(context.extractedKey, context.entryHref);
    const contentUrl = withQuery(await context.getPublicUrl(storageKey), {
      AICC_SID: context.sessionId,
      AICC_URL: hacpUrl,
    });
    return {
      attemptId: context.attemptId,
      sessionId: context.sessionId,
      packageType: 'aicc',
      playerKind: 'iframe',
      contentUrl,
      runtimeConfig: {
        launchMode: request.launchMode,
        learner: request.learner,
        aicc: { sessionId: context.sessionId, url: hacpUrl },
        ...(context.activityNodeId
          ? { activityNodeId: context.activityNodeId }
          : {}),
      },
    };
  }
}

/** Adds query parameters to an address, ahead of any `#fragment`. */
function withQuery(address: string, params: Record<string, string>): string {
  const hash = address.indexOf('#');
  const path = hash === -1 ? address : address.slice(0, hash);
  const fragment = hash === -1 ? '' : address.slice(hash);
  const query = new URLSearchParams(params).toString();
  return `${path}${path.includes('?') ? '&' : '?'}${query}${fragment}`;
}
