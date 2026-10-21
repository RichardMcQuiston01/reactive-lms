/**
 * Supported content package formats.
 * Values match `content_package.package_type` persistence.
 */
export type PackageType =
  | 'scorm_12'
  | 'scorm_2004'
  | 'xapi'
  | 'cmi5'
  | 'html5'
  | 'h5p'
  | 'lti';
