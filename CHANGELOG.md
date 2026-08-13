# CHANGELOG

## Unreleased

### Fixed

- HTML5 import detects ZIP types from central-directory names without inflating
  payloads; a failed persist deletes the original ZIP and extract prefix
- Shared `LMS_ERROR_HTTP_STATUS` maps `PACKAGE_ZIP_BOMB`, `PACKAGE_INVALID_ZIP`,
  `STORAGE_KEY_*`, and `LAUNCH_NOT_IMPLEMENTED`

### Added

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
