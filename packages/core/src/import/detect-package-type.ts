import {
  LmsError,
  PACKAGE_NOT_DETECTED,
  httpStatusForLmsCode,
  type PackageFileIndex,
  type PackageType,
} from '@reactive-lms/shared';
import { normalizePackagePath } from './package-file-index';

const CMI5_MARKER = 'cmi5.xml';
const SCORM_MARKER = 'imsmanifest.xml';
const XAPI_MARKER = 'tincan.xml';
const H5P_MARKER = 'h5p.json';

/**
 * Detects a package format from an in-memory file index.
 * Order: `cmi5` → SCORM (`schemaversion`) → `xapi` → `h5p` → `html5`.
 *
 * @param files - Package file index (paths relative to the package root)
 * @returns Detected package type
 * @throws {@link LmsError} `PACKAGE_NOT_DETECTED` when no marker matches
 */
export function detectPackageType(files: PackageFileIndex): PackageType {
  const rootFiles = rootFileMap(files);

  if (rootFiles.has(CMI5_MARKER)) {
    return 'cmi5';
  }

  if (rootFiles.has(SCORM_MARKER)) {
    const storedPath = rootFiles.get(SCORM_MARKER);
    const bytes =
      (storedPath ? files.read(storedPath) : undefined) ??
      files.read(SCORM_MARKER);
    return detectScormPackageType(decodeUtf8(bytes));
  }

  if (rootFiles.has(XAPI_MARKER)) {
    return 'xapi';
  }

  if (rootFiles.has(H5P_MARKER)) {
    return 'h5p';
  }

  if (hasHtmlFile(files)) {
    return 'html5';
  }

  throw new LmsError({
    status: httpStatusForLmsCode(PACKAGE_NOT_DETECTED),
    code: PACKAGE_NOT_DETECTED,
    message: 'No supported package marker found.',
    details: { paths: [...files.paths] },
  });
}

function rootFileMap(files: PackageFileIndex): Map<string, string> {
  const root = new Map<string, string>();
  for (const path of files.paths) {
    const normalized = normalizePackagePath(path);
    if (!normalized || normalized.includes('/')) {
      continue;
    }
    root.set(normalized.toLowerCase(), normalized);
  }
  return root;
}

function hasHtmlFile(files: PackageFileIndex): boolean {
  return files.paths.some((path) =>
    normalizePackagePath(path).toLowerCase().endsWith('.html'),
  );
}

function detectScormPackageType(xml: string): 'scorm_12' | 'scorm_2004' {
  const match = xml.match(/<schemaversion\b[^>]*>([\s\S]*?)<\/schemaversion>/i);
  const schemaversion = match?.[1]?.trim() ?? '';
  if (schemaversion.includes('1.2')) {
    return 'scorm_12';
  }
  if (schemaversion.includes('2004') || schemaversion.includes('CAM 1.3')) {
    return 'scorm_2004';
  }
  return 'scorm_12';
}

function decodeUtf8(bytes: Uint8Array | undefined): string {
  if (!bytes) {
    return '';
  }
  return new TextDecoder().decode(bytes);
}
