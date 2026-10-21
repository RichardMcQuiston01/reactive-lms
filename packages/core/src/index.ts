export { EventLogService, type EventLogRecord } from './audit/event-log.service';
export {
  ModuleService,
  type PlaceModuleInput,
} from './courses/module-service';
export {
  EnrolmentService,
  type EnrolmentResult,
  type SelfEnrolmentOptions,
} from './enrolment/enrolment-service';
export { detectPackageType } from './import/detect-package-type';
export {
  PackageImporter,
  type ImportPackageOptions,
  type ImportPackageResult,
} from './import/package-importer';
export {
  createMemoryFileIndex,
  createZipFileIndex,
  normalizePackagePath,
} from './import/package-file-index';
export {
  assertAvailable,
  type AvailabilityModule,
  type AvailabilityProgress,
} from './launch/availability';
export { LaunchService } from './launch/launch-service';
export {
  computeRegistrationStatus,
  type ComputeRegistrationStatusInput,
  type ModuleProgressSnapshot,
} from './progress/course-completion';
export { ProgressSinkService } from './progress/progress-sink';
export {
  Html5Runtime,
  joinStorageKey,
  type Html5LaunchContext,
} from './runtimes/html5/html5-runtime';
export { parseImsmanifest } from './runtimes/scorm/parse-imsmanifest';
export {
  CmiStore,
  addCmiTimespans,
  cmiTimespanToIso8601,
  coerceCmiValue,
  mapCmiToProgress,
  type CmiStoreSeed,
  type CmiValues,
} from './runtimes/scorm/cmi-store';
export {
  Scorm12Runtime,
  type Scorm12LaunchContext,
} from './runtimes/scorm/scorm-12-runtime';
export { ScormCmiService } from './runtimes/scorm/scorm-cmi.service';
export {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
  DEFAULT_PUBLIC_URL_PREFIX,
  FilesystemStorageAdapter,
  type FilesystemStorageOptions,
} from './storage/filesystem-storage.adapter';

