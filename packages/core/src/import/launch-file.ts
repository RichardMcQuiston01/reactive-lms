import { normalizePackagePath } from './package-file-index';
import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
  type PackageFileIndex,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * A refusal to import a package, as `PACKAGE_NOT_DETECTED` with a message that
 * names what is wrong.
 *
 * @param message - What is wrong with the package
 */
export function packageRefusal(message: string): LmsError {
  return new LmsError({
    status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
    code: PACKAGE_NOT_DETECTED,
    message,
  });
}

/**
 * Applies extra launch parameters (a SCORM item's `parameters`, an AICC\n * unit's `web_launch`) to a launch address: they are appended to it. A `?` where the address already has a query continues that query,
 * and a `&` where it has none starts one.
 */
export function withParameters(
  href: string,
  parameters: string | undefined,
): string {
  const extra = parameters?.trim() ?? '';
  if (extra === '') {
    return href;
  }
  if (extra.startsWith('#')) {
    return `${href}${extra}`;
  }
  const hasQuery = href.includes('?');
  if (extra.startsWith('?') || extra.startsWith('&')) {
    const rest = extra.slice(1);
    return `${href}${hasQuery ? '&' : '?'}${rest}`;
  }
  return `${href}${hasQuery ? '&' : '?'}${extra}`;
}

/**
 * Refuses a launch address whose file the package does not hold, so a broken
 * export fails at import with the unit and file named, instead of a blank
 * page when a learner launches it.
 *
 * @param label - What launches the file, for the message (for example `SCORM item "Intro"`)
 * @param href - Launch address, with any query or fragment
 * @param files - Package file index
 */
export function assertLaunchFile(
  label: string,
  href: string,
  files: PackageFileIndex,
): void {
  const filePath = filePartOf(href);
  if (escapesPackage(filePath)) {
    throw packageRefusal(
      `${label} launches "${filePath}", which is outside the package. Launch paths must stay inside it.`,
    );
  }
  if (!hasFile(files, filePath)) {
    const sameName = files.paths
      .map((path) => normalizePackagePath(path))
      .find((path) => path.toLowerCase() === filePath.toLowerCase());
    throw packageRefusal(
      sameName
        ? `${label} launches "${filePath}", but the package has "${sameName}", which differs only in letter case. File names are case sensitive.`
        : `${label} launches "${filePath}", which is not in the package.`,
    );
  }
}

/** The file part of a launch address: no query, no fragment. */
function filePartOf(href: string): string {
  return href.split(/[?#]/, 1)[0] ?? href;
}

function escapesPackage(filePath: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(filePath) ||
    filePath.split('/').some((segment) => segment === '..')
  );
}

/** True when the package has the file, as written or with %-escapes decoded. */
function hasFile(files: PackageFileIndex, filePath: string): boolean {
  if (files.has(filePath)) {
    return true;
  }
  try {
    return files.has(decodeURIComponent(filePath));
  } catch {
    return false;
  }
}
