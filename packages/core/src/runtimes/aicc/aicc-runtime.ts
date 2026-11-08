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
import { parseAicc } from './parse-aicc';

/**
 * AICC (level 1) runtime. Import is implemented: it detects the course
 * description files and reads them into an activity tree. Launching, which
 * needs the HACP endpoint, is not implemented yet.
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
   * Not implemented: launching needs the HACP endpoint.
   *
   * @param _request - Ignored
   * @throws {LmsError} `LAUNCH_NOT_IMPLEMENTED`
   */
  async createLaunch(_request: LaunchRequest): Promise<LaunchDescriptor> {
    throw new LmsError({
      status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
      code: LAUNCH_NOT_IMPLEMENTED,
      message: 'Launching an AICC package is not implemented yet.',
    });
  }
}
