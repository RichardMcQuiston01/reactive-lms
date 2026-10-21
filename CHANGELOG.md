# CHANGELOG

## Unreleased

### Added

- Admin package upload: the `packages` screen imports a ZIP archive, shows the
  detected type, and reloads the list. A file that is empty or not a `.zip` is
  refused before sending, and the server's message (for example "Uploaded file
  is not a valid ZIP archive.") is shown when it refuses an import.
  `lmsFetch` now sets `Content-Type: application/json` only for string bodies,
  so a `FormData` body gets its multipart boundary from the browser.
  `POST packages` is typed as `ImportPackageResultDto` in `shared`.
- Admin section list, package list, and package placement. The `sections`
  screen lists sections and opens a section's module tree (the open-by-id box
  stays for long lists); the `packages` screen lists imported packages; the
  module-tree screen can place a package, with an optional title and target
  block. New `GET course-sections` (optional `courseOfferingId`) and
  `GET packages`, both paged with `limit` (default 200, at most 500) and
  `offset`; unusable paging values fall back to the defaults. Package upload,
  enrolment, and progress screens remain.
- Admin module-tree screen (`sections/:sectionId/modules`): shows a section's
  modules and blocks as an indented tree with each module's availability
  summary, and lets an administrator add blocks, rename, move earlier or
  later, move into another block (only valid blocks are offered), and remove.
  The server's message is shown when it refuses a change. It resolves through
  `ADMIN_SCREEN_OVERRIDES` as `module-tree`. A simple `sections` screen opens a
  section by id until a section list endpoint exists.
- `GET course-sections/:id/modules` returns a section's modules as
  `CourseModuleDto` (flat; the client builds the tree), flagging blocks and
  reporting stored rules that cannot be read (`availabilityInvalid`).
  `MAX_MODULE_DEPTH` moved to `shared` so the admin screen applies the same
  limit.
- ROADMAP records D14, an opt-in learner engagement extension package
  (spaced repetition and lightweight gamification) targeted at 1.5.0, and
  narrows the "social/gamification" non-goal to allow it in that package only.
- `CacheAdapter` (D7) and `ErrorSink` (D12) contracts in `shared`. The cache
  holds small string state with expiry and offers atomic `setIfAbsent` and
  `take` for cmi5 one-time tokens and LTI nonces. `MemoryCacheAdapter` is the
  default (single API process only) and `runCacheConformance` is the pass bar
  for shared adapters such as Redis. Without an injected sink, unexpected
  (5xx) errors are written as one JSON line to `console.error`; the entry
  fields match `error-log-adapter`'s `ErrorLogEntry`, so its `log` can be
  passed as `errorSink`. A failing sink never changes a response. New
  `ReactiveLmsModule` options `cache` and `errorSink`.
- `@richardmcquiston01/reactive-lms-admin` (D2): theme-free Angular admin
  scaffold styled only through `--rlms-admin-*` CSS custom properties.
  `provideReactiveLmsAdmin` and `reactiveLmsAdminRoutes` expose the extension
  points: navigation items, replaceable screens (`ADMIN_SCREEN_OVERRIDES`),
  header and footer content slots, a wrappable API client
  (`wrapAdminApiClient`), and a capability check that hides navigation the
  user cannot use. Screens are placeholders until 0.3.0. `standalone-web`
  re-exports it alongside the player.
- Module tree (D5): `parent_module_id` on `course_module` and container
  modules ("blocks") with no content package, nested up to five levels
  (`MODULE_TREE_INVALID`). A module is available only if every ancestor block's
  rules hold; a failed launch names the blocking block. Blocks are not
  launchable (`MODULE_NOT_LAUNCHABLE`), do not count toward section
  completion, and cannot be deleted while they hold modules
  (`MODULE_HAS_CHILDREN`). New `POST course-sections/:id/blocks` endpoint;
  `PATCH` on a module can re-parent it. Migration `0001` was edited in place.
- Versioned module availability conditions (D5): `{ version: 1, all | any: [...] }`
  with nested groups and four condition types: `module_completed`,
  `date_window`, `min_score`, and `group_member`. Rules are validated on write
  (`AVAILABILITY_INVALID`, 400, listing every problem with its path) and
  evaluated at launch; a failed launch reports every unmet condition in
  `details.unmet`. The older single-object shape is still accepted, upcast on
  write, and read as version 1; invalid stored rules fail closed.
- `BlobStorageAdapter` (D11) replaces `StorageAdapter`: stream-based and
  key-based, with `put`, `get` (optional byte range), `head`, `list`, `remove`,
  and `removePrefix`. It returns results instead of throwing, exposes no local
  paths and no public URLs, and shares key normalization (`normalizeBlobKey`)
  across adapters.
- `FilesystemBlobStorageAdapter` (atomic writes, lazily opened reads, pruned
  empty directories) and `MemoryBlobStorageAdapter`, both passing the shared
  conformance suite exported from `@richardmcquiston01/reactive-lms-core/testing`
  as `runBlobStorageConformance`. It is the pass bar for the 1.0.0 S3 adapter.
- `extractZipToStorage`: ZIP extraction moved out of storage adapters so every
  store gets the same zip-bomb limits, path checks, and content types.
- The standalone content endpoint streams files and supports a single `Range`
  header (206 and 416 responses), so media can seek without buffering.
- `PersistenceDialect` contract and `DialectRegistry` (D8). Postgres ships as
  the built-in dialect; a host can register another or replace one.
  `createPersistenceDataSource` takes a dialect object or registered name.
- CI now runs the persistence integration tests against a Postgres 16 service,
  including a round trip of JSON, UTC timestamps, and binary document bodies.
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
- `docs/PLAN_0.2.0.md`: plan for reconciling the foundation workspace with the
  roadmap decisions.

### Changed

- Breaking, pre-release: the Nest module option `storageAdapter` is now
  `blobStorage`, the token `RLMS_STORAGE_ADAPTER` is `RLMS_BLOB_STORAGE_ADAPTER`,
  the antivirus hook and zip-bomb limits are options on `PackageImporter` (and
  `ReactiveLmsModule`), and `LaunchService` no longer takes a storage argument.
- Entities use portable TypeORM column types (D9): `json`, `decimal`, and
  `Date` replace `jsonb`, `numeric`, and `timestamptz`; xAPI document bodies are
  stored as base64 `text`. Native Postgres types stay in the Postgres migration,
  which keeps `jsonb` and `timestamptz` (UTC instants).
- The Postgres migration moved to `migrations/postgres/` and was edited in
  place (never applied): its name now carries the timestamp TypeORM requires,
  and `rlms_xapi_document.body` is `text`.
- Packages renamed from `@reactive-lms/*` to `@richardmcquiston01/reactive-lms-*`
  (D4) and versioned 0.1.0. Entries below that predate this change use the old
  names.
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

