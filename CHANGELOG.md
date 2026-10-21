# CHANGELOG

## Unreleased

### Added

- ESLint (flat config, typescript-eslint) and Prettier with an `.editorconfig`;
  `bun run lint`, `lint:file`, `format`, and `format:check`. A lint rule keeps
  the shared package free of Nest, Angular, TypeORM, Redis, and Tailwind
  imports.
- GitHub Actions CI running typecheck, lint, format check, and tests on pull
  requests and pushes to `main` and `dev`.
- `GROK_PLAN.md` implementation plan and `docs/TECHNOLOGY.md` stack spec
  (Postgres first / multi-DB later, Redis behind a cache adapter, Angular 18+
  with Tailwind and Material on the demo app)
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
- `docs/PLAN_0.2.0.md`: task breakdown for the 0.2.0 milestone.

### Changed

- Roadmap: decided to keep an own `BlobStorageAdapter` for package files (D11).
- Roadmap: `error-log-adapter` is optional (D12); implementation starts once
  `storage-adapters` and `error-log-adapter` reach stable 1.0 (D13).
- Roadmap: decided the git workflow (D10).
- Roadmap: decided the standards-support approach (D1).
- Roadmap: decided the reusable `@reactive-lms/admin` package, first screens in
  0.3.0 (D2).
- Roadmap: decided portable TypeORM column types in entities (D9).
- Roadmap: decided filesystem blob storage first and S3-compatible storage
  in 1.0.0 (D3).
- Roadmap: decided to publish under the `@richardmcquiston01` npm scope (D4).
- Roadmap: decided learning paths: module tree and conditions in 0.3.0, reusable
  path entity in 1.2.0 (D5).
- Roadmap: decided certificates: completion events in 0.9.0, built-in
  certificates in 1.3.0, Open Badges 3.0 in 1.4.0 (D6).
- Roadmap: decided Redis in standalone: in-memory through 1.0, opt-in Redis in
  1.1.0 (D7).
- Roadmap: decided MySQL/MariaDB then SQLite, behind an extensible dialect
  contract hosts can override (D8).
- Roadmap: standalone-api logs to console plus a rotating JSON file by default
  when `error-log-adapter` is installed (D12).

### Added

- `ROADMAP.md` with milestones, exit criteria, and open design decisions.
- Roadmap adopts `@richardmcquiston01/error-log-adapter` and
  `@richardmcquiston01/storage-adapters`.

### Fixed

- SCORM 1.2: a stale attach no longer deletes a newer `window.API`
- SCORM 1.2: flush a pending Commit on player destroy; coerce numeric
  CMI values so `score.raw` hydrates; accept empty / `null` /
  `undefined` Initialize-Commit-Finish args; re-apply LMS-owned CMI
  keys after hydrate; reload the SCO when launch inputs change; show
  CMI hydrate errors instead of a blank frame
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

## 0.1.0 - 2026-10-20

### Added

- Root `package.json` (v0.1.0) with `funding` link.
- `donate.svg` QR code and "Buy Me a Coffee" README section.

### Changed

- Rewrote `README.md`.
- Locked the stack in `docs/TECHNOLOGY.md`: NestJS + TypeORM for the
  API; Angular 18+ + TailwindCSS + RxJS for the demo. Angular Material
  is no longer a required demo dependency.

