export {
  EventLogService,
  type EventLogRecord,
} from './audit/event-log.service';
export {
  ModuleService,
  assertBlockAvailability,
  type PlaceBlockInput,
  type PlaceModuleInput,
} from './courses/module-service';
export {
  MAX_MODULE_DEPTH,
  ancestorsOf,
  assertCanParent,
  contentModules,
  isBlockModule,
  subtreeHeight,
} from './courses/module-tree';
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
  type PackageImporterOptions,
} from './import/package-importer';
export {
  createMemoryFileIndex,
  createZipFileIndex,
  normalizePackagePath,
} from './import/package-file-index';
export {
  assertAvailable,
  assertChainAvailable,
  evaluateAvailability,
  normalizeAvailabilityInput,
  readStoredAvailability,
  type AvailabilityContext,
  type AvailabilityEvaluation,
  type AvailabilityInput,
  type AvailabilityModule,
  type AvailabilityProgress,
  type UnmetCondition,
} from './launch/availability';
export {
  LaunchService,
  type LaunchServiceOptions,
} from './launch/launch-service';
export {
  computeRegistrationStatus,
  type ComputeRegistrationStatusInput,
  type ModuleProgressSnapshot,
} from './progress/course-completion';
export {
  ProgressSinkService,
  type LaunchProgressInput,
} from './progress/progress-sink';
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
export { FilesystemBlobStorageAdapter } from './storage/filesystem-blob-storage.adapter';
export { MemoryBlobStorageAdapter } from './storage/memory-blob-storage.adapter';
export { blobErrorToLmsError, requireBlob } from './storage/require-blob';
export {
  DEFAULT_MAX_ZIP_FILE_COUNT,
  DEFAULT_MAX_ZIP_UNCOMPRESSED_BYTES,
} from './import/zip-limits';
export {
  extractZipToStorage,
  type ZipExtractionLimits,
} from './import/zip-extractor';
export {
  DEFAULT_CONTENT_URL_PREFIX,
  contentTypeForKey,
  contentUrlForKey,
  parseByteRange,
  type ByteRangeResult,
} from './content/content-serving';
export { MemoryCacheAdapter } from './cache/memory-cache.adapter';
export {
  consoleErrorSink,
  errorSinkEntryOf,
  reportError,
} from './errors/error-sink';
