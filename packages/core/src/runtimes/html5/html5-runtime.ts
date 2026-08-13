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
import { normalizePackagePath } from '../../import/package-file-index';

/**
 * HTML5 static-bundle runtime (ZIP of assets + an HTML entry).
 * Launch is implemented in a later slice.
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
   * Launch is not part of this slice.
   *
   * @param _request - Launch request (unused)
   * @throws {@link LmsError} always
   */
  async createLaunch(_request: LaunchRequest): Promise<LaunchDescriptor> {
    throw new LmsError({
      status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
      code: LAUNCH_NOT_IMPLEMENTED,
      message: 'HTML5 launch is not implemented in 3a',
    });
  }
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
