# CHANGELOG

## Unreleased

### Fixed

- HTML5 `complete` writes progress when a module has no stored
  `activityNodeId` by resolving the package entry node and putting it on
  launch `runtimeConfig`
- Nest catch-all exception filter returns `{ code, message }` for
  HttpException, TypeORM, and unexpected errors
- Angular player ignores `postMessage` events that are not from the
  content iframe
- HTML5 import detects ZIP types from central-directory names without inflating
  payloads; a failed persist deletes the original ZIP and extract prefix
- Shared `LMS_ERROR_HTTP_STATUS` maps `PACKAGE_ZIP_BOMB`, `PACKAGE_INVALID_ZIP`,
  `STORAGE_KEY_*`, and `LAUNCH_NOT_IMPLEMENTED`

### Added

- SCORM 1.2 import, launch, CMI store, and `window.API` player bridge:
  parse `imsmanifest.xml` activity trees, persist CMI (`cmi.core.*`,
  suspend_data, comments; objectives in extras), `GET`/`PUT
  /scorm/attempts/:id/cmi`, map `lesson_status` and `score.raw` onto
  `ProgressSink`, debounce Commit 500ms
- `@reactive-lms/nest` `ReactiveLmsModule.registerAsync` with REST + OpenAPI
  for packages, course templates/offerings/sections, modules, enrolment,
  launches, and progress; `LmsError` filter returns `{ code, message }`
- `@reactive-lms/standalone-api` boots that module with a filesystem dataroot
  (`RLMS_DATAROOT`), `GET /health`, `/lms/content/**`, and a fixed demo learner
- `@reactive-lms/player` Angular standalone `RlmsPlayerComponent` plus
  `provideReactiveLms`; HTML5 `postMessage` mapper posts launch progress
- `@reactive-lms/core` course spine: `ModuleService` places/reorders imported
  packages as course modules; `EnrolmentService` supports `manual`, `self`
  (open window + optional key), and `group` methods; `LaunchService` launches
  HTML5 modules in an iframe; `ProgressSinkService` rolls up
  `registration.status` from module completion; `event_log` records
  `package.imported`, `enrol.joined`, `launch.started`, `progress.committed`
- Shared error codes for module availability, enrolment gates (403), and
  package/module/registration not-found (404)
- `@reactive-lms/core` HTML5 import pipeline: deterministic package detection,
  `Html5Runtime`, `FilesystemStorageAdapter` (ZIP-bomb limits + optional
  antivirus hook), and `PackageImporter` that stores a ZIP and persists a
  `ContentPackage` + `ActivityNode`
- `@reactive-lms/persistence` LIS-shaped `rlms_*` TypeORM schema, host-safe
  `createPersistenceDataSource` factory, and `0001-initial-schema` migration
- `@reactive-lms/shared` LMS contracts: package/registration enums, `LearnerRef`,
  `NormalizedProgress`, launch models, adapter interfaces (`ContentRuntime`,
  identity/capability/enrolment/storage), content package / registration / launch
  DTOs, and `LmsError` with HTTP status mapping
- Bun workspaces monorepo scaffold with seven packages:
  `@reactive-lms/shared`, `@reactive-lms/persistence`, `@reactive-lms/core`,
  `@reactive-lms/nest`, `@reactive-lms/player`, `@reactive-lms/standalone-api`,
  `@reactive-lms/standalone-web`
- Root scripts: `typecheck`, `test`, `test:file`, `lint`, `lint:file`
- `tsconfig.base.json`, `.env.example`, and `docs/STANDARDS.md`
