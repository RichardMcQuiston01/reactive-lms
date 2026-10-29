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
} from '@richardmcquiston01/reactive-lms-shared';
import { detectPackageType } from '../../import/detect-package-type';
import { normalizePackagePath } from '../../import/package-file-index';

/**
 * Extra fields {@link Html5Runtime.createLaunch} needs after the
 * attempt row exists. `LaunchRequest` stays the shared contract.
 */
export interface Html5LaunchContext {
  /** Attempt created by {@link LaunchService}. */
  attemptId: string;
  /** Unique session id stored on the attempt. */
  sessionId: string;
  /** Storage prefix of the extracted package. */
  extractedKey: string;
  /** Relative HTML entry (package or activity node href). */
  entryHref: string;
  /** Activity node launched with this attempt, when known. */
  activityNodeId?: string;
  /** Resolves a storage key to a player-loadable URL. */
  getPublicUrl: (key: string) => Promise<string>;
}

/**
 * HTML5 static-bundle runtime (ZIP of assets + an HTML entry).
 * Launch returns an iframe descriptor whose `contentUrl` is the
 * public URL of the extracted entry file.
 */
export class Html5Runtime implements ContentRuntime {
  /** @inheritdoc */
  readonly packageType = 'html5' as const;

  /**
   * True when the index is an HTML5 bundle and no higher-priority marker exists.
   *
   * @param files - Package file index
   */
  async detect(files: PackageFileIndex): Promise<boolean> {
    try {
      return detectPackageType(files) === 'html5';
    } catch (error) {
      if (error instanceof LmsError && error.code === PACKAGE_NOT_DETECTED) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Parses a single-entry HTML5 package.
   * Entry is `index.html` when present, otherwise the first `.html` file.
   *
   * @param files - Package file index
   */
  async parse(files: PackageFileIndex): Promise<ParsedPackage> {
    const entryHref = pickHtmlEntry(files);
    if (!entryHref) {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
        code: PACKAGE_NOT_DETECTED,
        message: 'HTML5 package has no HTML entry file.',
      });
    }

    const title = titleFromEntry(entryHref);
    return {
      title,
      entryHref,
      packageType: 'html5',
      activities: [{ title, href: entryHref }],
    };
  }

  /**
   * Builds an iframe launch descriptor for extracted HTML5 content.
   *
   * @param request - Registration, module, learner, and launch mode
   * @param context - Attempt ids plus extracted entry location
   */
  async createLaunch(
    request: LaunchRequest,
    context?: Html5LaunchContext,
  ): Promise<LaunchDescriptor> {
    if (!context?.extractedKey || !context.entryHref) {
      throw new LmsError({
        status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
        code: LAUNCH_NOT_IMPLEMENTED,
        message:
          'HTML5 launch requires extracted content location and a public URL.',
      });
    }

    const storageKey = joinStorageKey(context.extractedKey, context.entryHref);
    const contentUrl = await context.getPublicUrl(storageKey);
    return {
      attemptId: context.attemptId,
      sessionId: context.sessionId,
      packageType: 'html5',
      playerKind: 'iframe',
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

/**
 * Joins a storage prefix and relative href without introducing `..`.
 *
 * @param prefix - Extracted package key
 * @param relative - Entry href inside the package
 */
export function joinStorageKey(prefix: string, relative: string): string {
  const left = prefix.replace(/\\/g, '/').replace(/\/+$/, '');
  const right = relative.replace(/\\/g, '/').replace(/^\/+/, '');
  return left ? `${left}/${right}` : right;
}

function pickHtmlEntry(files: PackageFileIndex): string | undefined {
  const htmlPaths = files.paths
    .map((path) => normalizePackagePath(path))
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort((left, right) => left.localeCompare(right));

  const rootIndex = htmlPaths.find(
    (path) => path.toLowerCase() === 'index.html',
  );
  if (rootIndex) {
    return rootIndex;
  }

  const nestedIndex = htmlPaths.find((path) =>
    path.toLowerCase().endsWith('/index.html'),
  );
  if (nestedIndex) {
    return nestedIndex;
  }

  return htmlPaths[0];
}

function titleFromEntry(entryHref: string): string {
  const base = entryHref.split('/').pop() ?? entryHref;
  const stem = base.replace(/\.html$/i, '');
  if (!stem || stem.toLowerCase() === 'index') {
    return 'HTML5 package';
  }
  return stem;
}
