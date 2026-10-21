// Enums
export type { PackageType } from './enums/package-type';
export type { RegistrationStatus } from './enums/registration-status';

// Models
export type { LearnerRef } from './models/learner-ref';
export type {
  CompletionStatus,
  NormalizedProgress,
  SuccessStatus,
} from './models/normalized-progress';
export {
  CmiStore,
  addCmiTimespans,
  cmiTimespanToIso8601,
  coerceCmiValue,
  mapCmiToProgress,
  type CmiStoreSeed,
  type CmiValues,
} from './models/cmi-store';
export type {
  LaunchDescriptor,
  LaunchMode,
  LaunchRequest,
  PlayerKind,
} from './models/launch';
export type { PackageFileIndex } from './models/package-file-index';
export type { ActivityNodeTree, ParsedPackage } from './models/parsed-package';

export type {
  AvailabilityCondition,
  AvailabilityGroup,
  AvailabilityNode,
  AvailabilityParseResult,
  AvailabilityV0,
  AvailabilityV1,
} from './models/availability';
export {
  MAX_AVAILABILITY_DEPTH,
  MAX_AVAILABILITY_NODES,
  parseAvailability,
  referencedGroupIds,
} from './models/availability';

// Contracts
export type { ContentRuntime, ProgressSink } from './contracts/content-runtime';
export type { IdentityAdapter } from './contracts/identity-adapter';
export type {
  CapabilityAdapter,
  LmsAction,
  LmsResourceRef,
} from './contracts/capability-adapter';
export type { EnrolmentAdapter } from './contracts/enrolment-adapter';
export type {
  BlobAbortSignal,
  BlobBody,
  BlobError,
  BlobErrorCode,
  BlobInfo,
  BlobObject,
  BlobResult,
  BlobStorageAdapter,
  GetBlobOptions,
  ListBlobOptions,
  PutBlobOptions,
} from './contracts/blob-storage-adapter';
export {
  collectBlobBody,
  compareBlobKeys,
  normalizeBlobKey,
  normalizeBlobPrefix,
} from './blob-keys';

// DTOs
export type { ContentPackageDto } from './dto/content-package.dto';
export type { RegistrationDto } from './dto/registration.dto';
export type { CreateLaunchDto, LaunchDto } from './dto/launch.dto';
export type { ScormCmiDto } from './dto/scorm-cmi.dto';

// Errors
export {
  CMI5_TOKEN_USED,
  ENROLMENT_GROUP_REQUIRED,
  ENROLMENT_KEY_REQUIRED,
  ENROLMENT_METHOD_UNAVAILABLE,
  ENROLMENT_WINDOW_CLOSED,
  LAUNCH_NOT_IMPLEMENTED,
  LAUNCH_SESSION_OPEN,
  AVAILABILITY_INVALID,
  LMS_ERROR_HTTP_STATUS,
  LmsError,
  MODULE_NOT_AVAILABLE,
  MODULE_NOT_FOUND,
  PACKAGE_INVALID_ZIP,
  PACKAGE_NOT_FOUND,
  PACKAGE_NOT_DETECTED,
  PACKAGE_TYPE_UNSUPPORTED,
  PACKAGE_ZIP_BOMB,
  REGISTRATION_NOT_FOUND,
  ATTEMPT_NOT_FOUND,
  STORAGE_IO_ERROR,
  STORAGE_KEY_INVALID,
  STORAGE_RANGE_INVALID,
  STORAGE_KEY_NOT_FOUND,
  httpStatusForLmsCode,
} from './errors/lms-error';
export type { LmsErrorCode, LmsErrorOptions } from './errors/lms-error';
